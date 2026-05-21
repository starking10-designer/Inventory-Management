from typing import Optional

from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi.responses import FileResponse, StreamingResponse
from fastapi import Depends
from pydantic import BaseModel, Field
from app.database.database import get_db
import pandas as pd
from datetime import datetime, date
import hashlib
import shutil
import os
from openpyxl.styles import PatternFill

from app.database.database import SessionLocal

from app.models.sku_master import (
    SKUMaster,
    SKUPiece
)
from app.models.daily_report import DailyReport
from app.models.return_inventory import ReturnInventory
from app.models.sales_upload import SalesUpload

from app.services.excel_service import (
    clean_color_name,
    normalize_column_name,

    read_excel_file,
    read_sheet_columns,
    read_csv_columns,
    read_sku_sheet,

    filter_flipkart_orders,
    filter_amazon_orders,
    filter_ajio_orders,
    filter_meesho_orders,

    aggregate_orders,
    expand_inventory,

    generate_daily_report,
    read_flipkart_return_file,
    process_returns,
    filter_myntra_orders,
    format_daily_report_color,
    deduct_return_inventory,
    merge_return_inventory_rows,

)

router = APIRouter()

UPLOAD_FOLDER = "uploads"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def save_daily_report_rows(
    db: Session,
    report_date: date,
    platform: str,
    report_rows
):
    db.query(DailyReport).filter(
        DailyReport.report_date == report_date,
        DailyReport.platform == platform
    ).delete()

    for row in report_rows:
        db.add(
            DailyReport(
                report_date=report_date,
                style=str(row.get("style", "")).strip(),
                color=str(row.get("color", "")).strip(),
                size=str(row.get("size", "")).strip(),
                total_order_qty=int(row.get("total_order_qty", 0)),
                platform=platform
            )
        )


def _saved_upload_sha256(file_name: str):
    file_path = os.path.join(
        UPLOAD_FOLDER,
        file_name
    )
    digest = hashlib.sha256()

    with open(file_path, "rb") as saved_file:
        while chunk := saved_file.read(1024 * 1024):
            digest.update(chunk)

    return digest.hexdigest()


def _count_sales_upload_once(
    db: Session,
    report_date: date,
    platform: str,
    upload_file: UploadFile
):
    file_hash = _saved_upload_sha256(
        upload_file.filename
    )

    already_counted = db.query(SalesUpload).filter(
        SalesUpload.platform == platform,
        SalesUpload.file_hash == file_hash
    ).first()

    if already_counted:
        return False

    db.add(
        SalesUpload(
            report_date=report_date,
            platform=platform,
            file_name=upload_file.filename,
            file_hash=file_hash
        )
    )

    return True


def _save_new_platform_sales(
    db: Session,
    report_date: date,
    platform_orders,
    platform_files
):
    counted_platforms = []
    skipped_platforms = []

    for platform_name, orders in platform_orders.items():
        upload_file = platform_files.get(platform_name)

        if not upload_file or not _count_sales_upload_once(
            db,
            report_date,
            platform_name,
            upload_file
        ):
            skipped_platforms.append(platform_name)
            continue

        platform_aggregated = aggregate_orders(orders)
        platform_expanded = expand_inventory(
            platform_aggregated,
            db
        )
        platform_report = generate_daily_report(
            platform_expanded,
            db
        )
        save_daily_report_rows(
            db,
            report_date,
            platform_name,
            platform_report
        )
        counted_platforms.append(platform_name)

    return counted_platforms, skipped_platforms


# =====================================
# DAILY REPORT QUERY
# =====================================

@router.get("/daily-report")
def get_daily_report(
    report_date: str = Query(None),
    platform: str = Query(None)
):
    db: Session = SessionLocal()

    try:
        query = db.query(DailyReport)

        if report_date:
            try:
                parsed_date = datetime.strptime(
                    report_date,
                    "%Y-%m-%d"
                ).date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid date format. Use YYYY-MM-DD."
                )
            query = query.filter(
                DailyReport.report_date == parsed_date
            )

        if platform:
            query = query.filter(
                DailyReport.platform == platform
            )

        rows = query.order_by(
            DailyReport.report_date.desc(),
            DailyReport.platform.asc(),
            DailyReport.style.asc(),
            DailyReport.color.asc(),
            DailyReport.size.asc()
        ).all()

        return {
            "count": len(rows),
            "rows": [
                {
                    "date": str(row.report_date),
                    "style": row.style,
                    "color": row.color,
                    "size": row.size,
                    "total_order_qty": row.total_order_qty,
                    "platform": row.platform
                }
                for row in rows
            ]
        }
    finally:
        db.close()


def _parse_report_date(report_date: str):
    try:
        return datetime.strptime(
            report_date,
            "%Y-%m-%d"
        ).date()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use YYYY-MM-DD."
        )


def _daily_report_query(db: Session, report_date, platform):
    query = db.query(DailyReport)

    if report_date:
        query = query.filter(
            DailyReport.report_date == report_date
        )

    if platform:
        query = query.filter(
            DailyReport.platform == platform
        )

    return query


@router.get("/daily-report/export")
def export_daily_report(
    report_date: str = Query(None),
    platform: str = Query(None),
):
    import csv
    from io import StringIO

    db: Session = SessionLocal()

    try:
        parsed_date = None
        if report_date:
            parsed_date = _parse_report_date(report_date)

        rows = (
            _daily_report_query(db, parsed_date, platform)
            .order_by(
                DailyReport.platform.asc(),
                DailyReport.style.asc(),
                DailyReport.color.asc(),
                DailyReport.size.asc(),
            )
            .all()
        )

        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            "date",
            "platform",
            "style",
            "color",
            "size",
            "total_order_qty",
        ])
        for row in rows:
            writer.writerow([
                str(row.report_date),
                row.platform,
                row.style,
                row.color,
                row.size,
                row.total_order_qty,
            ])

        buffer.seek(0)
        date_part = (
            str(parsed_date) if parsed_date
            else datetime.now().strftime("%Y-%m-%d")
        )
        plat_part = platform or "all"
        filename = f"daily_report_{date_part}_{plat_part}.csv"

        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{filename}"'
                )
            },
        )
    finally:
        db.close()


@router.delete("/daily-report")
def delete_daily_report(
    report_date: str = Query(...),
    platform: str = Query(None),
):
    db: Session = SessionLocal()

    try:
        parsed_date = _parse_report_date(report_date)

        query = db.query(DailyReport).filter(
            DailyReport.report_date == parsed_date
        )

        if platform:
            query = query.filter(
                DailyReport.platform == platform
            )

        deleted = query.delete(synchronize_session=False)
        db.commit()

        return {
            "message": "Daily report deleted successfully",
            "deleted_rows": deleted,
            "report_date": str(parsed_date),
            "platform": platform or "all",
        }
    finally:
        db.close()


@router.get("/sales-analytics")
def sales_analytics(
    report_date: str = Query(None),
    platform: str = Query("All"),
):
    db: Session = SessionLocal()

    try:
        if report_date:
            parsed_date = _parse_report_date(report_date)
        else:
            parsed_date = datetime.now().date()

        rows = (
            db.query(DailyReport)
            .filter(
                DailyReport.report_date == parsed_date,
                DailyReport.platform != "All",
            )
            .all()
        )

        platform_totals = {}
        for row in rows:
            platform_totals[row.platform] = (
                platform_totals.get(row.platform, 0)
                + int(row.total_order_qty or 0)
            )

        if platform and platform not in ("", "All"):
            filtered = [
                r for r in rows
                if r.platform == platform
            ]
            view_platform = platform
        else:
            filtered = rows
            view_platform = "All"

        style_map = {}

        for row in filtered:
            style = row.style or "Unknown"
            size_key = str(row.size or "").upper().strip() or "—"

            if style not in style_map:
                style_map[style] = {
                    "total_qty": 0,
                    "sizes": {},
                }

            qty = int(row.total_order_qty or 0)
            style_map[style]["total_qty"] += qty
            style_map[style]["sizes"][size_key] = (
                style_map[style]["sizes"].get(size_key, 0) + qty
            )

        sorted_styles = sorted(
            style_map.items(),
            key=lambda item: item[1]["total_qty"],
            reverse=True,
        )

        top_products = [
            {
                "style": style,
                "total_qty": data["total_qty"],
                "sizes": data["sizes"],
            }
            for style, data in sorted_styles[:10]
        ]

        style_chart = [
            {
                "style": style,
                "qty": data["total_qty"],
            }
            for style, data in sorted_styles[:10]
        ]

        return {
            "report_date": str(parsed_date),
            "platform": view_platform,
            "platform_totals": platform_totals,
            "grand_total": sum(platform_totals.values()),
            "top_products": top_products,
            "style_chart": style_chart,
        }
    finally:
        db.close()


class ReturnInventoryUpdate(BaseModel):
    qty: int = Field(ge=0)


def _admin_key_valid(x_admin_key: Optional[str]) -> bool:
    expected = os.getenv("ADMIN_API_KEY", "dev-admin")
    return bool(x_admin_key) and x_admin_key == expected


# =====================================
# RETURN INVENTORY (admin edit qty)
# =====================================


@router.get("/return-inventory")
def list_return_inventory(search: Optional[str] = Query(None)):
    db: Session = SessionLocal()
    try:
        merged_rows = merge_return_inventory_rows(db)
        if merged_rows:
            db.commit()

        q = db.query(ReturnInventory)

        if search and search.strip():
            term = f"%{search.strip()}%"
            q = q.filter(
                or_(
                    ReturnInventory.style.ilike(term),
                    ReturnInventory.color.ilike(term),
                    ReturnInventory.size.ilike(term),
                )
            )

        rows = (
            q.order_by(
                ReturnInventory.style.asc(),
                ReturnInventory.color.asc(),
                ReturnInventory.size.asc(),
            )
            .all()
        )
        return {
            "count": len(rows),
            "rows": [
                {
                    "id": r.id,
                    "style": r.style,
                    "color": r.color,
                    "display_color": format_daily_report_color(
                        r.style,
                        r.color,
                    ),
                    "size": r.size,
                    "qty": r.qty,
                }
                for r in rows
            ],
        }
    finally:
        db.close()


@router.patch("/return-inventory/{inventory_id}")
def update_return_inventory_qty(
    inventory_id: int,
    body: ReturnInventoryUpdate,
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
):
    if not _admin_key_valid(x_admin_key):
        raise HTTPException(
            status_code=403,
            detail="Invalid or missing admin key. Set X-Admin-Key header "
            "to match ADMIN_API_KEY (default dev key: dev-admin).",
        )
    db: Session = SessionLocal()
    try:
        row = db.query(ReturnInventory).filter(
            ReturnInventory.id == inventory_id
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="Inventory row not found")
        row.qty = body.qty
        db.commit()
        db.refresh(row)
        return {
            "id": row.id,
            "style": row.style,
            "color": row.color,
            "size": row.size,
            "qty": row.qty,
        }
    finally:
        db.close()


# =====================================
# FILE UPLOAD
# =====================================

@router.post("/upload-file")
def upload_file(
    file: UploadFile = File(...)
):

    file_path = (
        f"{UPLOAD_FOLDER}/{file.filename}"
    )

    with open(file_path, "wb") as buffer:

        shutil.copyfileobj(
            file.file,
            buffer
        )

    # =====================================
    # AUTO IMPORT SKU MASTER
    # =====================================

    if (
        "sku" in file.filename.lower()
        or
        "master" in file.filename.lower()
    ):

        excel_file = pd.ExcelFile(
            file_path
        )

        first_sheet = (
            excel_file.sheet_names[0]
        )

        df = read_sku_sheet(
            file_path,
            first_sheet
        )

        db: Session = SessionLocal()

        try:

            # =====================
            # CLEAR OLD DATA
            # =====================

            db.query(
                SKUPiece
            ).delete()

            db.query(
                SKUMaster
            ).delete()

            db.commit()

            # =====================
            # IMPORT NEW SKU MASTER
            # =====================

            for _, row in df.iterrows():

                sku_value = str(
                    row.get("sku", "")
                ).strip()

                if (
                    not sku_value
                    or sku_value == "nan"
                ):
                    continue

                existing_sku = db.query(
                    SKUMaster
                ).filter(

                    SKUMaster.sku == sku_value

                ).first()

                if existing_sku:

                    continue

                sku_master = SKUMaster(

                    platform="Common",

                    sku=sku_value,

                    style=str(
                        row.get("style", "")
                    ).strip(),

                    size=str(
                        row.get("size", "")
                    ).strip()
                )

                db.add(
                    sku_master
                )

                db.flush()

                color_columns = [

                    (
                        "color1",
                        "color1 qty"
                    ),

                    (
                        "color2",
                        "color2 qty"
                    ),

                    (
                        "color3",
                        "color3 qty"
                    ),

                    (
                        "color4",
                        "color4 qty"
                    ),

                    (
                        "color5",
                        "color5 qty"
                    )
                ]

                for (
                    color_col,
                    qty_col
                ) in color_columns:

                    color_value = clean_color_name(

                        row.get(
                            color_col,
                            ""
                        )
                    )

                    qty_value = row.get(
                        normalize_column_name(qty_col),
                        0
                    )

                    if (
                        not color_value
                        or
                        color_value == "nan"
                        or
                        color_value == "-"
                    ):
                        continue

                    try:

                        qty_value = int(
                            qty_value
                        )

                    except:

                        qty_value = 0

                    if qty_value <= 0:
                        continue

                    sku_piece = SKUPiece(

                        sku_master_id=
                        sku_master.id,

                        color=color_value,

                        qty=qty_value
                    )

                    db.add(
                        sku_piece
                    )

            db.commit()

        finally:

            db.close()

    return {

        "message":
        "File uploaded successfully",

        "filename":
        file.filename
    }


# =====================================
# READ EXCEL SHEETS
# =====================================

@router.get("/read-master/{filename}")
def read_master_file(filename: str):

    file_path = f"uploads/{filename}"

    sheet_names = read_excel_file(
        file_path
    )

    return {
        "filename": filename,
        "sheets": sheet_names
    }



# =====================================
# READ SHEET COLUMNS
# =====================================

@router.get(
    "/read-sheet-columns/{filename}/{sheet_name}"
)
def get_sheet_columns(
    filename: str,
    sheet_name: str
):

    file_path = f"uploads/{filename}"

    return read_sheet_columns(
        file_path,
        sheet_name
    )


# =====================================
# READ CSV COLUMNS
# =====================================

@router.get("/read-csv-columns/{filename}")
def get_csv_columns(filename: str):

    file_path = f"uploads/{filename}"

    return read_csv_columns(file_path)


# =====================================
# IMPORT SKU MASTER
# =====================================

@router.post(
    "/import-sku-sheet/{filename}/{sheet_name}"
)
def import_sku_sheet(
    filename: str,
    sheet_name: str
):

    file_path = f"uploads/{filename}"

    df = read_sku_sheet(
        file_path,
        sheet_name
    )

    db: Session = SessionLocal()

    imported_count = 0

    try:

        for _, row in df.iterrows():

            sku_value = str(
                row.get("sku", "")
            ).strip()

            if (
                not sku_value
                or sku_value == "nan"
            ):
                continue

            existing_sku = db.query(
                SKUMaster
            ).filter(
                SKUMaster.sku == sku_value
            ).first()

            if existing_sku:
                continue

            sku_master = SKUMaster(
                platform="Common",
                sku=sku_value,
                style=str(
                    row.get("style", "")
                ).strip(),
                size=str(
                    row.get("size", "")
                ).strip()
            )

            db.add(sku_master)

            db.flush()

            color_columns = [
                
                ("color1", "color1 Qty"),

                ("color2", "color2 Qty"),

                ("color3", "color3 Qty"),

                ("color4", "color4 Qty"),

                ("color5", "color5 Qty")
            ]

            for color_col, qty_col in color_columns:

                color_value = clean_color_name(
                    row.get(color_col, "")
                )

                qty_value = row.get(
                    normalize_column_name(qty_col),
                    0
                )

                if (
                    not color_value
                    or color_value == "nan"
                    or color_value == "-"
                ):
                    continue

                try:
                    qty_value = int(qty_value)

                except:
                    qty_value = 0

                if qty_value <= 0:
                    continue

                sku_piece = SKUPiece(
                    sku_master_id=sku_master.id,
                    color=color_value,
                    qty=qty_value
                )

                db.add(sku_piece)

            imported_count += 1

        db.commit()

        return {
            "message":
            "SKU sheet imported successfully",

            "imported_count":
            imported_count
        }

    except Exception as e:

        db.rollback()

        return {
            "error": str(e)
        }

    finally:

        db.close()


# =====================================
# FILTER PREVIEW
# =====================================

@router.get(
    "/filter-orders/{platform}/{filename}"
)
def filter_orders(
    platform: str,
    filename: str
):

    file_path = f"uploads/{filename}"

    platform = platform.lower()

    if platform == "flipkart":

        result = filter_flipkart_orders(
            file_path
        )

    elif platform == "amazon":

        result = filter_amazon_orders(
            file_path
        )

    elif platform == "ajio":

        result = filter_ajio_orders(
            file_path
        )

    elif platform == "meesho":

        result = filter_meesho_orders(
            file_path
        )

    else:

        return {
            "error":
            "Invalid platform"
        }

    return {
        "platform": platform,
        "total_orders": len(result),
        "orders": result
    }


# =====================================
# UPLOAD RETURNS
# =====================================

@router.post(
    "/upload-flipkart-returns"
)
@router.post(
    "/upload-returns"
)
def upload_flipkart_returns(
    file: UploadFile = File(...)
):

    file_path = (
        f"uploads/{file.filename}"
    )

    with open(file_path, "wb") as buffer:

        shutil.copyfileobj(
            file.file,
            buffer
        )

    try:
        return_orders = read_flipkart_return_file(file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read returns file: {e}"
        )

    db: Session = SessionLocal()

    try:
        return process_returns(
            return_orders,
            db
        )
    finally:
        db.close()

# =====================================
# FINAL COMBINED REPORT
# =====================================

@router.post("/generate-final-report")
def generate_final_report(

    flipkart_file: UploadFile = File(None),

    amazon_file: UploadFile = File(None),

    ajio_file: UploadFile = File(None),

    meesho_file: UploadFile = File(None)
):

    all_orders = []
    platform_orders = {}
    platform_orders = {}

    # =====================
    # FLIPKART
    # =====================

    if flipkart_file:

        file_path = (
            f"uploads/{flipkart_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                flipkart_file.file,
                buffer
            )

        flipkart_orders = (
            filter_flipkart_orders(
                file_path
            )
        )
        platform_orders["Flipkart"] = flipkart_orders

        all_orders.extend(
            flipkart_orders
        )

    # =====================
    # AMAZON
    # =====================

    if amazon_file:

        file_path = (
            f"uploads/{amazon_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                amazon_file.file,
                buffer
            )

        amazon_orders = (
            filter_amazon_orders(
                file_path
            )
        )
        platform_orders["Amazon"] = amazon_orders

        all_orders.extend(
            amazon_orders
        )

    # =====================
    # AJIO
    # =====================

    if ajio_file:

        file_path = (
            f"uploads/{ajio_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                ajio_file.file,
                buffer
            )

        ajio_orders = (
            filter_ajio_orders(
                file_path
            )
        )
        platform_orders["Ajio"] = ajio_orders

        all_orders.extend(
            ajio_orders
        )

    # =====================
    # MEESHO
    # =====================

    if meesho_file:

        file_path = (
            f"uploads/{meesho_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                meesho_file.file,
                buffer
            )

        meesho_orders = (
            filter_meesho_orders(
                file_path
            )
        )
        platform_orders["Meesho"] = meesho_orders

        all_orders.extend(
            meesho_orders
        )

    # =====================
    # AGGREGATE
    # =====================

    aggregated_orders = aggregate_orders(
        all_orders
    )

    db: Session = SessionLocal()

    try:
        expanded_inventory = expand_inventory(
            aggregated_orders,
            db
        )

        final_report = generate_daily_report(
            expanded_inventory,
            db
        )

        report_date = datetime.now().date()

        save_daily_report_rows(
            db,
            report_date,
            "All",
            final_report
        )

        counted_platforms, skipped_platforms = _save_new_platform_sales(
            db,
            report_date,
            platform_orders,
            {
                "Flipkart": flipkart_file,
                "Amazon": amazon_file,
                "Ajio": ajio_file,
                "Meesho": meesho_file,
            }
        )

        db.commit()

        return {
            "total_platform_orders":
            len(all_orders),

            "total_inventory_items":
            len(final_report),

            "report":
            final_report,

            "sales_counted_platforms":
            counted_platforms,

            "sales_skipped_duplicate_platforms":
            skipped_platforms
        }
    finally:
        db.close()

def _collect_marketplace_orders(
    flipkart_file: UploadFile = None,
    amazon_file: UploadFile = None,
    ajio_file: UploadFile = None,
    meesho_file: UploadFile = None,
    myntra_file: UploadFile = None,
):
    all_orders = []
    platform_orders = {}

    # =====================
    # FLIPKART
    # =====================

    if flipkart_file:

        file_path = (
            f"uploads/{flipkart_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                flipkart_file.file,
                buffer
            )

        flipkart_orders = (
            filter_flipkart_orders(
                file_path
            )
        )
        platform_orders["Flipkart"] = flipkart_orders

        all_orders.extend(
            flipkart_orders
        )

    # =====================
    # AMAZON
    # =====================

    if amazon_file:

        file_path = (
            f"uploads/{amazon_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                amazon_file.file,
                buffer
            )

        amazon_orders = (
            filter_amazon_orders(
                file_path
            )
        )
        platform_orders["Amazon"] = amazon_orders

        all_orders.extend(
            amazon_orders
        )

    # =====================
    # AJIO
    # =====================

    if ajio_file:

        file_path = (
            f"uploads/{ajio_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                ajio_file.file,
                buffer
            )

        ajio_orders = (
            filter_ajio_orders(
                file_path
            )
        )
        platform_orders["Ajio"] = ajio_orders

        all_orders.extend(
            ajio_orders
        )

    # =====================
    # MEESHO
    # =====================

    if meesho_file:

        file_path = (
            f"uploads/{meesho_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                meesho_file.file,
                buffer
            )

        meesho_orders = (
            filter_meesho_orders(
                file_path
            )
        )
        platform_orders["Meesho"] = meesho_orders

        all_orders.extend(
            meesho_orders
        )

            # =====================
    # MYNTRA
    # =====================

    if myntra_file:

        file_path = (
            f"uploads/{myntra_file.filename}"
        )

        with open(file_path, "wb") as buffer:

            shutil.copyfileobj(
                myntra_file.file,
                buffer
            )

        myntra_orders = (
            filter_myntra_orders(
                file_path
            )
        )
        platform_orders["Myntra"] = myntra_orders

        all_orders.extend(
            myntra_orders
        )

    return all_orders, platform_orders


@router.post("/export-final-report")
def export_final_report(

    flipkart_file: UploadFile = File(None),

    amazon_file: UploadFile = File(None),

    ajio_file: UploadFile = File(None),

    meesho_file: UploadFile = File(None),

    myntra_file: UploadFile = File(None),
):

    all_orders, platform_orders = _collect_marketplace_orders(
        flipkart_file,
        amazon_file,
        ajio_file,
        meesho_file,
        myntra_file,
    )

    if not all_orders:
        raise HTTPException(
            status_code=400,
            detail="Upload at least one marketplace order file.",
        )

    aggregated_orders = aggregate_orders(
        all_orders
    )

    db: Session = SessionLocal()

    expanded_inventory = expand_inventory(
        aggregated_orders,
        db
    )

    final_report = generate_daily_report(
        expanded_inventory,
        db
    )

    report_date = datetime.now().date()

    save_daily_report_rows(
        db,
        report_date,
        "All",
        final_report
    )

    _save_new_platform_sales(
        db,
        report_date,
        platform_orders,
        {
            "Flipkart": flipkart_file,
            "Amazon": amazon_file,
            "Ajio": ajio_file,
            "Meesho": meesho_file,
            "Myntra": myntra_file,
        }
    )

    db.commit()

       # =====================
    # EXPORT EXCEL
    # =====================

    from openpyxl import Workbook
    from openpyxl.utils import get_column_letter
    from openpyxl.styles import (
        Font,
        Alignment,
        PatternFill,
        Border,
        Side
    )

    now = datetime.now()
    timestamp = now.strftime(
        "%Y%m%d_%H%M%S"
    )
    today_date = now.strftime("%Y%m%d")
    generated_at = now.strftime(
        "%d-%m-%Y %I:%M:%S %p"
    )

    output_file = (
        f"uploads/final_report_{timestamp}.xlsx"
    )

    wb = Workbook()

    ws = wb.active

    final_report = sorted(

    final_report,

    key=lambda x: (

        x.get("style", ""),

        x.get("color", "")
    )
    )

    size_order = ["XS", "S", "M", "L", "XL", "2XL"]
    available_sizes = []
    seen_sizes = set()

    for item in final_report:
        size_value = str(item.get("size", "")).upper().strip()
        if size_value and size_value in size_order and size_value not in seen_sizes:
            available_sizes.append(size_value)
            seen_sizes.add(size_value)

    available_sizes = [
        size for size in size_order
        if size in available_sizes
    ]
    total_columns = 2 + (len(available_sizes) * 3)
    last_column = get_column_letter(max(total_columns, 2))

    ws.title = "Final Report"
    ws.merge_cells(f"A1:{last_column}1")
    ws["A1"] = f"Generated At: {generated_at}"

    # =====================
    # HEADER DESIGN
    # =====================

    headers = ["Style", "Color"]
    sub_headers = ["", ""]

    for size in available_sizes:
        headers.extend([size, "", ""])
        sub_headers.extend([
            "Total Order",
            "Return Stock",
            "Need to Print"
        ])

    ws.append(headers)
    ws.append(sub_headers)

    ws.merge_cells("A2:A3")
    ws.merge_cells("B2:B3")

    for index, _ in enumerate(available_sizes):
        start_col = 3 + (index * 3)
        end_col = start_col + 2
        ws.merge_cells(
            f"{get_column_letter(start_col)}2:{get_column_letter(end_col)}2"
        )

    # =====================
    # STYLES
    # =====================

    header_fill = PatternFill(
        start_color="1F4E78",
        end_color="1F4E78",
        fill_type="solid"
    )

    header_font = Font(
        bold=True,
        color="FFFFFF",
        size=13,
    )

    data_font = Font(size=12)

    center_align = Alignment(
        horizontal="center",
        vertical="center",
        wrap_text=True,
    )

    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin")
    )

    timestamp_fill = PatternFill(
        start_color="E5E7EB",
        end_color="E5E7EB",
        fill_type="solid"
    )


    ws["A1"].fill = timestamp_fill
    ws["A1"].font = Font(bold=True, color="111827", size=12)
    ws["A1"].alignment = Alignment(
        horizontal="center",
        vertical="center",
    )
    ws["A1"].border = thin_border
    ws.row_dimensions[1].height = 18

    for row in ws.iter_rows(
        min_row=2,
        max_row=3,
        min_col=1,
        max_col=max(total_columns, 2)
    ):

        for cell in row:

            cell.fill = header_fill

            cell.font = header_font

            cell.alignment = center_align

            cell.border = thin_border

    # =====================
    # GROUP DATA
    # =====================

    grouped_data = {}

    for item in final_report:

        key = (
            item["style"],
            item["color"]
        )

        if key not in grouped_data:

            grouped_data[key] = {}

        grouped_data[key][
            item["size"].upper()
        ] = item

    # =====================
    # WRITE DATA
    # =====================

    for (style, color), sizes in grouped_data.items():

        row = [
            style,
            color
        ]

        for size in available_sizes:

            if size in sizes:

                data = sizes[size]

                total_qty = data.get("total_order_qty", 0)
                return_qty = data.get(
                    "used_return_qty",
                    data.get("return_inventory", 0)
                )
                stock_qty = data.get(
                    "need_from_stock",
                    data.get("stock_inventory", 0)
                )

                row.extend([
                    (
                        "-"
                        if total_qty == 0
                        else total_qty
                    ),

                    (
                        "-"
                        if return_qty == 0
                        else return_qty
                    ),

                    (
                        "-"
                        if stock_qty == 0
                        else stock_qty
                    )
                ])

            else:

                row.extend([
                    "-",
                    "-",
                    "-"
                ])

        ws.append(row)

    # =====================
    # COLUMN WIDTH (A4 portrait)
    # =====================

    if total_columns <= 11:

        style_w, color_w, data_w = (
            18,
            16,
            8
        )

    elif total_columns <= 14:

        style_w, color_w, data_w = (
            16,
            14,
            8
        )

    else:

        style_w, color_w, data_w = (
            14,
            12,
            6
        )

    ws.column_dimensions["A"].width = style_w
    ws.column_dimensions["B"].width = color_w

    for col in range(
        3,
        max(total_columns, 2) + 1
    ):

        ws.column_dimensions[
            get_column_letter(col)
        ].width = data_w

    # =====================
    # PAGE SETUP
    # =====================

    ws.sheet_properties.pageSetUpPr.fitToPage = True

    ws.page_setup.orientation = "portrait"

    ws.page_setup.paperSize = 9

    ws.page_setup.fitToWidth = 1

    ws.page_setup.fitToHeight = False

    # =====================
    # DATA CELL STYLE
    # =====================

    return_fill = PatternFill(

    start_color="FFF3CD",

    end_color="FFF3CD",

    fill_type="solid"
    )

    for row in ws.iter_rows(

        min_row=4,

        max_row=ws.max_row,

        min_col=1,

        max_col=ws.max_column
    ):

        for cell in row:

            cell.alignment = center_align
            cell.font = data_font
            cell.border = thin_border

            # =====================
            # HIGHLIGHT RETURN QTY
            # =====================

            if (

                "Used Return Qty"

                in str(
                    ws.cell(
                        row=3,
                        column=cell.column
                    ).value
                )

            ):

                if (

                    cell.value not in [
                        None,
                        "",
                        "-",
                        0
                    ]

                ):

                    try:

                        if int(cell.value) > 0:

                            cell.fill = return_fill

                    except:

                        pass

    wb.save(output_file)
    db.close()

    return FileResponse(
        output_file,
        media_type=(
            "application/vnd.openxmlformats-"
            "officedocument.spreadsheetml.sheet"
        ),
        filename=(
            f"final_report_{today_date}.xlsx"
        )
    )


@router.post("/confirm-final-report")
def confirm_final_report(

    flipkart_file: UploadFile = File(None),

    amazon_file: UploadFile = File(None),

    ajio_file: UploadFile = File(None),

    meesho_file: UploadFile = File(None),

    myntra_file: UploadFile = File(None),
):

    all_orders, _ = _collect_marketplace_orders(
        flipkart_file,
        amazon_file,
        ajio_file,
        meesho_file,
        myntra_file,
    )

    if not all_orders:
        raise HTTPException(
            status_code=400,
            detail="Upload at least one marketplace order file.",
        )

    aggregated_orders = aggregate_orders(all_orders)

    db: Session = SessionLocal()

    try:
        expanded_inventory = expand_inventory(
            aggregated_orders,
            db,
        )

        return deduct_return_inventory(
            expanded_inventory,
            db,
        )
    finally:
        db.close()


@router.get(
    "/current-sku-master"
)
def current_sku_master():

    upload_folder = "uploads"

    if not os.path.exists(
        upload_folder
    ):

        return {
            "filename": None
        }

    files = os.listdir(
        upload_folder
    )

    sku_files = [

        file for file in files

        if (
            "sku" in file.lower()
            or
            "master" in file.lower()
        )
    ]

    if not sku_files:

        return {
            "filename": None
        }

    latest_file = max(

        sku_files,

        key=lambda f: os.path.getctime(
            os.path.join(
                upload_folder,
                f
            )
        )
    )

    return {
        "filename": latest_file
    }

@router.delete(
    "/delete-sku-master"
)
def delete_sku_master(db: Session = Depends(get_db)):

    upload_folder = "uploads"

    if os.path.exists(
        upload_folder
    ):

        files = os.listdir(
            upload_folder
        )

        for file in files:

            if (
                "sku" in file.lower()
                or
                "master" in file.lower()
            ):

                file_path = os.path.join(
                    upload_folder,
                    file
                )

                if os.path.exists(
                    file_path
                ):

                    os.remove(
                        file_path
                    )

    db.query(
        SKUPiece
    ).delete()

    db.query(
        SKUMaster
    ).delete()

    db.commit()

    return {

        "message":
        "SKU master deleted successfully"
    }
