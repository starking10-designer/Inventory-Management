"""Preview marketplace returns without writes, then commit reviewed pieces."""
from datetime import date
from io import BytesIO
import math
import re

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.return_column_mappings import ReturnColumnMapping
from app.models.return_inventory import ReturnInventory
from app.models.return_analytics import ReturnAnalytics
from app.models.missing_return_piece import MissingReturnPiece
from app.models.damaged_return_piece import DamagedReturnPiece
from app.models.sku_master import SKUMaster
from app.services.excel_service import normalize_sku, parse_money

router = APIRouter(prefix="/v2")


def column_key(value):
    return re.sub(r"\s+", "", str(value)).lower()


def text(value):
    return "" if pd.isna(value) else str(value).strip()


def positive_quantity(value):
    try:
        number = float(value)
        if math.isfinite(number) and number > 0 and number.is_integer():
            return int(number)
    except (ValueError, TypeError):
        pass
    raise HTTPException(400, "Return quantities must be positive whole numbers.")


def check_admin(key):
    from app.routes.upload_routes import _admin_key_valid
    if not _admin_key_valid(key):
        raise HTTPException(403, "Invalid or missing admin key.")


def build_preview(frame, mapping, target_date, db):
    frame = frame.copy()
    frame.columns = [column_key(c) for c in frame.columns]
    if frame.columns.duplicated().any():
        raise HTTPException(400, "The report contains duplicate column names.")
    required = [mapping.order_id_col, mapping.sku_col, mapping.qty_col,
                mapping.date_col, mapping.status_col]
    missing = [c for c in required if c and column_key(c) not in frame.columns]
    if missing:
        raise HTTPException(400, "Missing required columns: " + ", ".join(missing))

    def cell(row, col):
        return text(row.get(column_key(col), "")) if col else ""

    masters = {normalize_sku(m.sku): m for m in db.query(SKUMaster).all()
               if not m.platform or m.platform.strip().lower() == mapping.platform.lower()}
    result = []
    for index, row in frame.iterrows():
        if mapping.status_col and cell(row, mapping.status_col).casefold() != (mapping.status_val or "").strip().casefold():
            continue
        if mapping.date_col:
            parsed = pd.to_datetime(cell(row, mapping.date_col), errors="coerce")
            if pd.isna(parsed) or parsed.date() != target_date:
                continue
        order_id, sku = cell(row, mapping.order_id_col), cell(row, mapping.sku_col)
        if not order_id and not sku:
            continue
        if not order_id or not sku:
            raise HTTPException(400, f"Row {index + 2}: order ID and SKU are required.")
        quantity = positive_quantity(cell(row, mapping.qty_col) if mapping.qty_col else 1)
        base = dict(platform=mapping.platform, return_date=target_date.isoformat(),
                    return_order_id=order_id, return_sku=sku,
                    status=cell(row, mapping.status_col),
                    return_type=cell(row, mapping.return_type_col),
                    return_reason=cell(row, mapping.return_reason_col),
                    price=parse_money(cell(row, mapping.amount_col)))
        master = masters.get(normalize_sku(sku))
        pieces = master.pieces if master else []
        complete = master and master.style and master.size and pieces and all(
            p.color and p.qty and p.qty > 0 for p in pieces)
        if not complete:
            result.append(dict(base, style=master.style if master else "",
                               size=master.size if master else "", color="",
                               pack_of=master.pack_of if master else "", return_qty=quantity,
                               _status="missing", warning="SKU is missing or incomplete in SKU Master."))
            continue
        total_pieces = sum(p.qty for p in pieces)
        for piece in pieces:
            result.append(dict(base, style=master.style.strip(), size=master.size.strip().upper(),
                               color=piece.color.strip(), pack_of=master.pack_of,
                               return_qty=quantity * piece.qty,
                               price=base["price"] * piece.qty / total_pieces,
                               _status="valid", warning=""))
    merged = {}
    for row in result:
        key = tuple(row.get(k) for k in ("platform", "return_order_id", "return_sku", "style", "color", "size"))
        if key in merged:
            merged[key]["return_qty"] += row["return_qty"]
            merged[key]["price"] += row["price"]
        else:
            merged[key] = row
    return {"rows": list(merged.values())}


@router.post("/preview-returns")
async def preview_returns(file: UploadFile = File(...), platform: str = Form(...),
                          return_date: date = Form(...), db: Session = Depends(get_db),
                          x_admin_key: str | None = Header(None, alias="X-Admin-Key")):
    check_admin(x_admin_key)
    mapping = db.query(ReturnColumnMapping).filter(ReturnColumnMapping.platform == platform).first()
    if not mapping:
        raise HTTPException(400, "Unsupported return platform.")
    suffix = (file.filename or "").rsplit(".", 1)[-1].lower()
    if suffix not in {"xlsx", "csv"}:
        raise HTTPException(400, "Upload an Excel (.xlsx) or CSV (.csv) report.")
    try:
        content = BytesIO(await file.read())
        frame = pd.read_csv(content, dtype=str) if suffix == "csv" else pd.read_excel(content, dtype=str)
    except Exception as exc:
        raise HTTPException(400, "Could not read the return report.") from exc
    return build_preview(frame, mapping, return_date, db)


class ReturnPiece(BaseModel):
    platform: str
    return_date: date
    return_order_id: str = Field(min_length=1)
    return_sku: str = Field(min_length=1)
    return_qty: int = Field(gt=0)
    style: str = ""
    color: str = ""
    size: str = ""
    pack_of: str | None = None
    status: str = ""
    return_type: str = ""
    return_reason: str = ""
    price: float = Field(default=0, allow_inf_nan=False)


class ReturnCommit(BaseModel):
    valid_orders: list[ReturnPiece] = Field(default_factory=list)
    missing_orders: list[ReturnPiece] = Field(default_factory=list)
    damaged_orders: list[ReturnPiece] = Field(default_factory=list)


def commit_pieces(body, db):
    groups = [(body.valid_orders, ReturnAnalytics), (body.missing_orders, MissingReturnPiece),
              (body.damaged_orders, DamagedReturnPiece)]
    for row in body.valid_orders:
        if not all(v.strip() for v in (row.style, row.color, row.size)):
            raise HTTPException(400, "Valid returns must have style, color and size. Fix the SKU mapping first.")
    total = skipped = 0
    try:
        for rows, model in groups:
            for row in rows:
                identity = dict(platform=row.platform, order_id=row.return_order_id, sku=row.return_sku,
                                style=row.style.strip(), color=row.color.strip(), size=row.size.strip().upper())
                # Re-uploading the same marketplace order/piece must not add stock twice.
                if any(db.query(cls).filter_by(**identity).first() for cls in
                       (ReturnAnalytics, MissingReturnPiece, DamagedReturnPiece)):
                    skipped += 1
                    continue
                db.add(model(**identity, return_date=row.return_date.isoformat(), qty=row.return_qty,
                             pack_of=row.pack_of, status=row.status, return_type=row.return_type,
                             return_reason=row.return_reason, amount=row.price))
                if model is ReturnAnalytics:
                    stock = db.query(ReturnInventory).filter(
                        func.lower(func.trim(ReturnInventory.style)) == identity["style"].lower(),
                        func.lower(func.trim(ReturnInventory.color)) == identity["color"].lower(),
                        func.lower(func.trim(ReturnInventory.size)) == identity["size"].lower()).first()
                    if not stock:
                        stock = ReturnInventory(style=identity["style"], color=identity["color"],
                                                size=identity["size"], qty=0)
                        db.add(stock)
                    stock.qty = (stock.qty or 0) + row.return_qty
                    total += row.return_qty
                db.flush()
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"total_added": total, "skipped_duplicates": skipped}


@router.post("/commit-returns-json")
def commit_returns(body: ReturnCommit, db: Session = Depends(get_db),
                   x_admin_key: str | None = Header(None, alias="X-Admin-Key")):
    check_admin(x_admin_key)
    result = commit_pieces(body, db)
    from app.routes.upload_routes import write_inventory_snapshot, _serialize_return_inventory_rows
    write_inventory_snapshot("return", _serialize_return_inventory_rows(db))
    return result
