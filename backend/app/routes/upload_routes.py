from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Header, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from fastapi.responses import FileResponse, StreamingResponse
from fastapi import Depends
from pydantic import BaseModel, Field
from app.database.database import get_db
import pandas as pd
from datetime import datetime, date
import hashlib
import shutil
import os
import re
import uuid
from openpyxl.styles import PatternFill

from app.database.database import SessionLocal

from app.models.sku_master import (
    SKUMaster,
    SKUPiece
)
from app.models.daily_report import DailyReport
from app.models.daily_sales_report import DailySalesReport
from app.models.return_inventory import ReturnInventory
from app.models.stock_inventory import StockInventory
from app.models.sticker_inventory import StickerInventory
from app.models.sales_upload import SalesUpload
from app.models.inventory_deduction_log import InventoryDeductionLog

from app.services.excel_service import (
    clean_color_name,
    normalize_column_name,
    normalize_sku,

    read_excel_file,
    read_sheet_columns,
    read_csv_columns,
    read_sku_sheet,

    filter_flipkart_orders,
    get_flipkart_target_date,
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

BASE_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
    )
)
UPLOAD_FOLDER = os.path.join(
    BASE_DIR,
    "uploads"
)
PLATFORM_NAMES = [
    "Flipkart",
    "Amazon",
    "Ajio",
    "Meesho",
    "Myntra",
]


class ManualSKUPieceCreate(BaseModel):
    color: Optional[str] = ""
    qty: Optional[int] = 0


class ManualSKUMasterCreate(BaseModel):
    platform: Optional[str] = "Common"
    sku: str = Field(..., min_length=1)
    style: Optional[str] = ""
    size: Optional[str] = ""
    pieces: List[ManualSKUPieceCreate] = Field(default_factory=list)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def _clean_upload_filename(filename: str):
    filename = os.path.basename(
        filename or ""
    ).strip()

    if not filename:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is missing a filename.",
        )

    return re.sub(
        r"[^A-Za-z0-9._() -]",
        "_",
        filename,
    )


def _save_upload(upload_file: UploadFile):
    filename = _clean_upload_filename(
        upload_file.filename
    )

    file_path = os.path.join(
        UPLOAD_FOLDER,
        filename
    )

    if os.path.exists(file_path):
        name, ext = os.path.splitext(filename)
        file_path = os.path.join(
            UPLOAD_FOLDER,
            f"{name}_{uuid.uuid4().hex[:8]}{ext}"
        )

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(
                upload_file.file,
                buffer
            )
    except OSError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not save uploaded file: {e}",
        )

    upload_file.saved_path = file_path
    upload_file.saved_filename = os.path.basename(
        file_path
    )

    return file_path


def _upload_error(label: str, error: Exception):
    if isinstance(error, HTTPException):
        raise error

    raise HTTPException(
        status_code=400,
        detail=f"{label} upload failed: {error}",
    )


def _read_uploaded_orders(label: str, upload_file: UploadFile, reader):
    file_path = _save_upload(upload_file)

    try:
        return reader(file_path)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read {label} file: {e}",
        )


def save_daily_report_rows(
    db: Session,
    report_date: date,
    platform: str,
    report_rows
):
    for row in report_rows:
        style = str(row.get("style", "")).strip()
        color = str(row.get("color", "")).strip()
        size = str(row.get("size", "")).strip()
        qty = _safe_int(row.get("total_order_qty", 0))

        if qty <= 0:
            continue

        existing = db.query(DailyReport).filter(
            DailyReport.report_date == report_date,
            DailyReport.platform == platform,
            DailyReport.style == style,
            DailyReport.color == color,
            DailyReport.size == size,
        ).first()

        if existing:
            existing.total_order_qty = (
                _safe_int(existing.total_order_qty) + qty
            )
            continue

        db.add(
            DailyReport(
                report_date=report_date,
                style=style,
                color=color,
                size=size,
                total_order_qty=qty,
                platform=platform
            )
        )


def _safe_int(value):
    try:
        if pd.isna(value):
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def _safe_float(value):
    try:
        if pd.isna(value):
            return 0
        return float(value)
    except (TypeError, ValueError):
        return 0


def _unique_order_count(orders):
    unique_order_ids = set()
    fallback_order_count = 0

    for row in orders:
        order_id = str(
            row.get("order_id", "")
        ).strip()

        if order_id:
            unique_order_ids.add(order_id)
        else:
            fallback_order_count += 1

    return len(unique_order_ids) + fallback_order_count


def _log_inventory_deductions(
    db: Session,
    report_date: date,
    platform: str,
    inventory_type: str,
    deductions,
):
    for deduction in deductions or []:
        deducted_qty = _safe_int(
            deduction.get("deducted_qty", 0)
        )

        if deducted_qty <= 0:
            continue

        db.add(
            InventoryDeductionLog(
                report_date=report_date,
                platform=platform,
                inventory_type=inventory_type,
                style=str(deduction.get("style", "")).strip(),
                color=str(deduction.get("color", "")).strip(),
                size=str(deduction.get("size", "")).strip() or None,
                qty=deducted_qty,
            )
        )


def _restore_inventory_deduction_log(
    db: Session,
    report_date: date,
    platform: str = None,
):
    query = db.query(InventoryDeductionLog).filter(
        InventoryDeductionLog.report_date == report_date
    )

    if platform == "All":
        query = query.filter(
            InventoryDeductionLog.platform.in_(PLATFORM_NAMES)
        )
    elif platform:
        query = query.filter(
            InventoryDeductionLog.platform == platform
        )

    logs = query.all()

    for log in logs:
        qty = _safe_int(log.qty)

        if qty <= 0:
            continue

        if log.inventory_type == "stock":
            row = db.query(StockInventory).filter(
                StockInventory.style == log.style,
                StockInventory.color == log.color,
                StockInventory.size == log.size,
            ).first()

            if not row:
                row = StockInventory(
                    style=log.style,
                    color=log.color,
                    size=log.size,
                    qty=0,
                )
                db.add(row)
                db.flush()

            row.qty = _safe_int(row.qty) + qty

        elif log.inventory_type == "return":
            row = db.query(ReturnInventory).filter(
                ReturnInventory.style == log.style,
                ReturnInventory.color == log.color,
                ReturnInventory.size == log.size,
            ).first()

            if not row:
                row = ReturnInventory(
                    style=log.style,
                    color=log.color,
                    size=log.size,
                    qty=0,
                )
                db.add(row)
                db.flush()

            row.qty = _safe_int(row.qty) + qty

        elif log.inventory_type == "sticker":
            row = db.query(StickerInventory).filter(
                StickerInventory.style == log.style,
                StickerInventory.color == log.color,
            ).first()

            if not row:
                row = StickerInventory(
                    style=log.style,
                    color=log.color,
                    qty=0,
                )
                db.add(row)
                db.flush()

            row.qty = _safe_int(row.qty) + qty

    restored_count = len(logs)
    restored_qty = sum(
        _safe_int(log.qty)
        for log in logs
    )

    query.delete(synchronize_session=False)

    return {
        "restored_logs": restored_count,
        "restored_qty": restored_qty,
    }


def _rebuild_all_daily_report_rows(
    db: Session,
    report_date: date,
):
    db.query(DailyReport).filter(
        DailyReport.report_date == report_date,
        DailyReport.platform == "All",
    ).delete(synchronize_session=False)

    rows = db.query(DailyReport).filter(
        DailyReport.report_date == report_date,
        DailyReport.platform != "All",
    ).all()

    grouped_rows = {}

    for row in rows:
        key = (
            row.style,
            row.color,
            row.size,
        )

        if key not in grouped_rows:
            grouped_rows[key] = 0

        grouped_rows[key] += _safe_int(row.total_order_qty)

    for (style, color, size), qty in grouped_rows.items():
        if qty <= 0:
            continue

        db.add(
            DailyReport(
                report_date=report_date,
                platform="All",
                style=style,
                color=color,
                size=size,
                total_order_qty=qty,
            )
        )


def save_daily_sales_summary(
    db: Session,
    report_date: date,
    platform: str,
    orders,
    mapped_piece_qty: int
):
    total_invoice_amount = 0

    for row in orders:
        total_invoice_amount += _safe_float(
            row.get("price", 0)
        )

    new_order_count = _unique_order_count(orders)

    existing = db.query(DailySalesReport).filter(
        DailySalesReport.report_date == report_date,
        DailySalesReport.platform == platform
    ).first()

    if existing:
        existing.total_orders = (
            _safe_int(existing.total_orders)
            + new_order_count
        )
        existing.total_piece_qty = (
            _safe_int(existing.total_piece_qty)
            + mapped_piece_qty
        )
        existing.total_invoice_amount = round(
            float(existing.total_invoice_amount or 0)
            + total_invoice_amount,
            2
        )
        return

    db.add(
        DailySalesReport(
            report_date=report_date,
            platform=platform,
            total_orders=new_order_count,
            total_piece_qty=mapped_piece_qty,
            total_invoice_amount=round(
                total_invoice_amount,
                2
            )
        )
    )


def _saved_upload_sha256(upload_file: UploadFile):
    file_path = getattr(
        upload_file,
        "saved_path",
        None
    )

    if not file_path:
        file_path = os.path.join(
            UPLOAD_FOLDER,
            _clean_upload_filename(
                upload_file.filename
            )
        )

    digest = hashlib.sha256()

    with open(file_path, "rb") as saved_file:
        while chunk := saved_file.read(1024 * 1024):
            digest.update(chunk)

    return digest.hexdigest()


def _upload_already_counted(
    db: Session,
    platform: str,
    upload_file: UploadFile,
):
    if not upload_file:
        return True

    file_hash = _saved_upload_sha256(upload_file)

    return (
        db.query(SalesUpload)
        .filter(
            SalesUpload.platform == platform,
            SalesUpload.file_hash == file_hash,
        )
        .first()
        is not None
    )


def _count_sales_upload_once(
    db: Session,
    report_date: date,
    platform: str,
    upload_file: UploadFile
):
    if _upload_already_counted(
        db,
        platform,
        upload_file,
    ):
        return False

    file_hash = _saved_upload_sha256(
        upload_file
    )

    db.add(
        SalesUpload(
            report_date=report_date,
            platform=platform,
            file_name=getattr(
                upload_file,
                "saved_filename",
                upload_file.filename
            ),
            file_hash=file_hash
        )
    )

    return True


def _orders_from_new_platform_uploads(
    db: Session,
    report_date: date,
    platform_orders,
    platform_files,
):
    new_orders = []
    counted_platforms = []
    skipped_platforms = []

    for platform_name, orders in platform_orders.items():
        upload_file = platform_files.get(platform_name)
        platform_report_date = _platform_report_date(
            platform_name,
            report_date,
        )

        if not upload_file:
            continue

        if _upload_already_counted(
            db,
            platform_name,
            upload_file,
        ):
            skipped_platforms.append(platform_name)
            continue

        new_orders.extend(orders)
        counted_platforms.append(platform_name)

    return new_orders, counted_platforms, skipped_platforms


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
        platform_report_date = _platform_report_date(
            platform_name,
            report_date,
        )

        if not upload_file or not _count_sales_upload_once(
            db,
            platform_report_date,
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
            platform_report_date,
            platform_name,
            platform_report
        )
        save_daily_sales_summary(
            db,
            platform_report_date,
            platform_name,
            orders,
            sum(
                _safe_int(item.get("qty", 0))
                for item in platform_expanded
            )
        )
        counted_platforms.append(platform_name)

    return counted_platforms, skipped_platforms


def _platform_report_date(
    platform_name: str,
    default_report_date: date,
) -> date:
    if platform_name == "Flipkart":
        return get_flipkart_target_date()
    return default_report_date


def _orders_for_report_date(
    platform_orders: dict,
    report_date: date,
) -> list:
    orders = []

    for platform_name, platform_order_list in platform_orders.items():
        if (
            _platform_report_date(platform_name, report_date)
            != report_date
        ):
            continue
        orders.extend(platform_order_list)

    return orders


def _unknown_platform_skus(db: Session, platform_orders: dict) -> List[dict]:
    master_skus = {
        normalize_sku(row.sku)
        for row in db.query(SKUMaster.sku).all()
        if row.sku
    }

    unknown_by_key = {}

    for platform_name, orders in platform_orders.items():
        for order in orders:
            raw_sku = str(order.get("sku", "")).strip()

            if not raw_sku:
                continue

            normalized = normalize_sku(raw_sku)

            if normalized in master_skus:
                continue

            key = normalized

            if key not in unknown_by_key:
                unknown_by_key[key] = {
                    "platform": platform_name,
                    "platforms": [platform_name],
                    "sku": raw_sku,
                    "normalized_sku": normalized,
                    "quantity": 0,
                }
            elif platform_name not in unknown_by_key[key]["platforms"]:
                unknown_by_key[key]["platforms"].append(platform_name)
                unknown_by_key[key]["platform"] = ", ".join(
                    unknown_by_key[key]["platforms"]
                )

            unknown_by_key[key]["quantity"] += _safe_int(
                order.get("quantity", 0)
            )

    return list(unknown_by_key.values())


def _raise_if_unknown_platform_skus(
    db: Session,
    platform_orders: dict,
):
    unknown_skus = _unknown_platform_skus(
        db,
        platform_orders,
    )

    if unknown_skus:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "UNKNOWN_SKUS",
                "message": (
                    "Some platform SKUs are not available in the SKU master."
                ),
                "skus": unknown_skus,
            },
        )


def _daily_report_query(db: Session, report_date, platform):
    query = db.query(DailyReport)

    if not report_date:
        if platform == "All":
            query = query.filter(
                DailyReport.platform != "All"
            )
        elif platform:
            query = query.filter(
                DailyReport.platform == platform
            )
        return query

    if platform == "All" or not platform:
        conditions = [
            and_(
                DailyReport.platform == platform_name,
                DailyReport.report_date == report_date,
            )
            for platform_name in PLATFORM_NAMES
        ]
        return query.filter(or_(*conditions))

    return query.filter(
        DailyReport.platform == platform,
        DailyReport.report_date == report_date,
    )


def _sales_row_for_platform(
    db: Session,
    platform_name: str,
    view_date: date,
):
    return (
        db.query(DailySalesReport)
        .filter(
            DailySalesReport.platform == platform_name,
            DailySalesReport.report_date == view_date,
        )
        .first()
    )


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
        parsed_date = None
        if report_date:
            parsed_date = _parse_report_date(report_date)

        rows = (
            _daily_report_query(
                db,
                parsed_date,
                platform or "All",
            )
            .order_by(
                DailyReport.report_date.desc(),
                DailyReport.platform.asc(),
                DailyReport.style.asc(),
                DailyReport.color.asc(),
                DailyReport.size.asc()
            )
            .all()
        )

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
    for date_format in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(
                report_date,
                date_format
            ).date()
        except ValueError:
            continue

    raise HTTPException(
        status_code=400,
        detail="Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY."
    )


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
            else datetime.now().strftime("%d-%m-%Y")
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


DAILY_REPORT_SIZE_ORDER = [
    "XS", "S", "M", "L", "XL", "2XL",
]


def _pivot_daily_report_rows(rows):
    grouped = {}
    sizes = set()

    for row in rows:
        size = str(row.size or "").upper().strip()
        if size:
            sizes.add(size)

        key = (
            row.platform,
            row.style,
            row.color,
        )

        if key not in grouped:
            grouped[key] = {
                "date": str(row.report_date),
                "platform": row.platform,
                "style": row.style,
                "color": row.color,
                "sizes": {},
                "total": 0,
            }

        qty = int(row.total_order_qty or 0)
        grouped[key]["sizes"][size] = (
            grouped[key]["sizes"].get(size, 0) + qty
        )
        grouped[key]["total"] += qty

    size_columns = [
        size
        for size in DAILY_REPORT_SIZE_ORDER
        if size in sizes
    ]
    size_columns.extend(
        sorted(
            size
            for size in sizes
            if size not in DAILY_REPORT_SIZE_ORDER
        )
    )

    summary = sorted(
        grouped.values(),
        key=lambda item: (
            item["platform"],
            item["style"],
            item["color"],
        ),
    )

    return summary, size_columns


@router.get("/daily-report/export-excel")
def export_daily_report_excel(
    report_date: str = Query(None),
    platform: str = Query(None),
):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

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

        summary_rows, size_columns = _pivot_daily_report_rows(rows)

        wb = Workbook()
        ws = wb.active
        ws.title = "Daily Report"

        header_fill = PatternFill(
            "solid",
            fgColor="022658",
        )
        header_font = Font(
            bold=True,
            color="FFFFFF",
        )

        plat_label = platform or "All"
        date_label = (
            str(parsed_date) if parsed_date
            else "All dates"
        )

        ws.append(["Daily final order report"])
        ws.merge_cells(
            start_row=1,
            start_column=1,
            end_row=1,
            end_column=4 + len(size_columns),
        )
        ws["A1"].font = Font(bold=True, size=14)
        ws.append(["Date", date_label])
        ws.append(["Platform", plat_label])
        ws.append([])

        headers = [
           
            "Style",
            "Color",
            *size_columns,
            "Total",
        ]
        ws.append(headers)

        for cell in ws[ws.max_row]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")

        for item in summary_rows:
            ws.append([
               
                item["style"],
                item["color"],
                *[
                    item["sizes"].get(size, "")
                    for size in size_columns
                ],
                item["total"],
            ])

        for column_cells in ws.columns:
            column_letter = get_column_letter(
                column_cells[0].column,
            )
            max_length = 0
            for cell in column_cells:
                if cell.value is not None:
                    max_length = max(
                        max_length,
                        len(str(cell.value)),
                    )
            ws.column_dimensions[column_letter].width = min(
                max(max_length + 2, 10),
                40,
            )

        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        date_part = (
            str(parsed_date) if parsed_date
            else datetime.now().strftime("%d-%m-%Y")
        )
        plat_part = (platform or "all").lower()
        filename = (
            f"daily_report_{date_part}_{plat_part}.xlsx"
        )

        return StreamingResponse(
            buffer,
            media_type=(
                "application/vnd.openxmlformats-officedocument"
                ".spreadsheetml.sheet"
            ),
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
    password: str = Query(""),
):
    if password != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Invalid password",
        )

    db: Session = SessionLocal()

    try:
        parsed_date = _parse_report_date(report_date)

        restore_result = _restore_inventory_deduction_log(
            db,
            parsed_date,
            platform,
        )

        query = db.query(DailyReport).filter(
            DailyReport.report_date == parsed_date
        )

        if platform == "All":
            pass
        elif platform:
            query = query.filter(
                DailyReport.platform == platform
            )

        deleted = query.delete(synchronize_session=False)

        sales_query = db.query(DailySalesReport).filter(
            DailySalesReport.report_date == parsed_date
        )

        if platform == "All":
            sales_query = sales_query.filter(
                DailySalesReport.platform.in_(PLATFORM_NAMES)
            )
        elif platform:
            sales_query = sales_query.filter(
                DailySalesReport.platform == platform
            )

        deleted_sales = sales_query.delete(
            synchronize_session=False
        )

        if platform and platform != "All":
            _rebuild_all_daily_report_rows(
                db,
                parsed_date,
            )

        db.commit()

        return {
            "message": "Daily report deleted successfully",
            "deleted_rows": deleted,
            "deleted_sales_rows": deleted_sales,
            "restored_inventory_rows": restore_result["restored_logs"],
            "restored_inventory_qty": restore_result["restored_qty"],
            "report_date": str(parsed_date),
            "platform": platform or "all",
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.get("/sales-reports")
def list_sales_reports():
    db: Session = SessionLocal()

    try:
        rows = (
            db.query(DailySalesReport)
            .order_by(
                DailySalesReport.report_date.desc(),
                DailySalesReport.platform.asc(),
            )
            .all()
        )

        by_date = {}

        for row in rows:
            date_key = str(row.report_date)

            if date_key not in by_date:
                by_date[date_key] = {
                    "report_date": date_key,
                    "platforms": {},
                    "total_orders": 0,
                    "total_piece_qty": 0,
                    "total_invoice_amount": 0.0,
                }

            entry = by_date[date_key]
            platform_name = row.platform
            platform_summary = {
                "platform": platform_name,
                "total_orders": int(row.total_orders or 0),
                "total_piece_qty": int(
                    row.total_piece_qty or 0
                ),
                "total_invoice_amount": round(
                    float(row.total_invoice_amount or 0),
                    2,
                ),
            }

            if platform_name in entry["platforms"]:
                existing = entry["platforms"][platform_name]
                existing["total_orders"] += platform_summary[
                    "total_orders"
                ]
                existing["total_piece_qty"] += platform_summary[
                    "total_piece_qty"
                ]
                existing["total_invoice_amount"] = round(
                    existing["total_invoice_amount"]
                    + platform_summary["total_invoice_amount"],
                    2,
                )
            else:
                entry["platforms"][platform_name] = platform_summary

        reports = []

        for date_key in sorted(by_date.keys(), reverse=True):
            entry = by_date[date_key]
            platforms = sorted(
                entry["platforms"].values(),
                key=lambda item: item["platform"],
            )
            entry["platforms"] = platforms
            entry["total_orders"] = sum(
                item["total_orders"] for item in platforms
            )
            entry["total_piece_qty"] = sum(
                item["total_piece_qty"] for item in platforms
            )
            entry["total_invoice_amount"] = round(
                sum(
                    item["total_invoice_amount"]
                    for item in platforms
                ),
                2,
            )
            entry["platform_count"] = len(platforms)
            reports.append(entry)

        return {
            "count": len(reports),
            "reports": reports,
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
            _daily_report_query(
                db,
                parsed_date,
                platform or "All",
            )
            .order_by(
                DailyReport.platform.asc(),
                DailyReport.style.asc(),
                DailyReport.color.asc(),
                DailyReport.size.asc(),
            )
            .all()
        )

        sales_summary = {
            name: {
                "total_orders": 0,
                "total_piece_qty": 0,
                "total_invoice_amount": 0,
            }
            for name in PLATFORM_NAMES
        }

        for platform_name in PLATFORM_NAMES:
            sales_row = _sales_row_for_platform(
                db,
                platform_name,
                parsed_date,
            )

            if not sales_row:
                continue

            sales_summary[platform_name] = {
                "total_orders": int(
                    sales_row.total_orders or 0
                ),
                "total_piece_qty": int(
                    sales_row.total_piece_qty or 0
                ),
                "total_invoice_amount": round(
                    float(sales_row.total_invoice_amount or 0),
                    2
                ),
            }

        platform_totals = {
            name: totals["total_piece_qty"]
            for name, totals in sales_summary.items()
        }

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
            "sales_summary": sales_summary,
            "total_orders": sum(
                item["total_orders"]
                for item in sales_summary.values()
            ),
            "grand_total": sum(platform_totals.values()),
            "total_invoice_amount": round(
                sum(
                    item["total_invoice_amount"]
                    for item in sales_summary.values()
                ),
                2
            ),
            "top_products": top_products,
            "style_chart": style_chart,
        }
    finally:
        db.close()


@router.get("/sales-analytics/export")
def export_sales_analytics(
    report_date: str = Query(None),
    platform: str = Query("All"),
):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    data = sales_analytics(
        report_date=report_date,
        platform=platform,
    )

    selected_platform = data.get("platform") or "All"
    sales_summary = data.get("sales_summary") or {}
    top_products = data.get("top_products") or []

    wb = Workbook()
    ws = wb.active
    ws.title = "Sales Summary"

    header_fill = PatternFill(
        "solid",
        fgColor="EDE9FE",
    )
    total_fill = PatternFill(
        "solid",
        fgColor="F5F3FF",
    )

    ws.append([
        "Today's final sale report",
    ])
    ws.merge_cells(
        start_row=1,
        start_column=1,
        end_row=1,
        end_column=4,
    )
    ws["A1"].font = Font(
        bold=True,
        size=14,
    )

    ws.append([
        "Date",
        data.get("report_date", ""),
    ])
    ws.append([
        "Platform",
        selected_platform,
    ])
    ws.append([])
    ws.append([
        "Platform",
        "Total orders",
        "Total piece quantity",
        "Total invoice amount",
    ])

    for cell in ws[5]:
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    summary_rows = [
        (name, totals)
        for name, totals in sales_summary.items()
        if selected_platform == "All" or name == selected_platform
    ]

    for name, totals in summary_rows:
        ws.append([
            name,
            int(totals.get("total_orders") or 0),
            int(totals.get("total_piece_qty") or 0),
            float(totals.get("total_invoice_amount") or 0),
        ])

    ws.append([
        "Total",
        int(data.get("total_orders") or 0)
        if selected_platform == "All"
        else sum(
            int(totals.get("total_orders") or 0)
            for _, totals in summary_rows
        ),
        int(data.get("grand_total") or 0)
        if selected_platform == "All"
        else sum(
            int(totals.get("total_piece_qty") or 0)
            for _, totals in summary_rows
        ),
        float(data.get("total_invoice_amount") or 0)
        if selected_platform == "All"
        else sum(
            float(totals.get("total_invoice_amount") or 0)
            for _, totals in summary_rows
        ),
    ])

    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True)
        cell.fill = total_fill

    for row in ws.iter_rows(
        min_row=6,
        min_col=4,
        max_col=4,
    ):
        row[0].number_format = '#,##0.00'

    for column_cells in ws.columns:
        column_letter = get_column_letter(
            column_cells[0].column
        )
        width = max(
            len(str(cell.value or ""))
            for cell in column_cells
        )
        ws.column_dimensions[column_letter].width = min(
            max(width + 2, 12),
            34,
        )

    product_ws = wb.create_sheet("Top Products")
    product_ws.append([
        "Rank",
        "Style",
        "Total quantity",
        "Sizes",
    ])

    for cell in product_ws[1]:
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for index, product in enumerate(top_products, start=1):
        sizes = product.get("sizes") or {}
        size_text = ", ".join(
            f"{size}: {qty}"
            for size, qty in sorted(sizes.items())
        )
        product_ws.append([
            index,
            product.get("style", ""),
            int(product.get("total_qty") or 0),
            size_text,
        ])

    for column_cells in product_ws.columns:
        column_letter = get_column_letter(
            column_cells[0].column
        )
        width = max(
            len(str(cell.value or ""))
            for cell in column_cells
        )
        product_ws.column_dimensions[column_letter].width = min(
            max(width + 2, 12),
            48,
        )

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    safe_platform = re.sub(
        r"[^A-Za-z0-9_-]",
        "_",
        selected_platform.lower(),
    )
    filename = (
        f"final_sale_report_{data.get('report_date')}_{safe_platform}.xlsx"
    )

    return StreamingResponse(
        output,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename}"'
            )
        },
    )


class ReturnInventoryUpdate(BaseModel):
    qty: int = Field(ge=0)


class StockInventoryUpdate(BaseModel):
    qty: int = Field(ge=0)


class StickerInventoryUpdate(BaseModel):
    qty: int = Field(ge=0)


def _admin_key_valid(x_admin_key: Optional[str]) -> bool:
    expected = os.getenv("ADMIN_API_KEY", "dev-admin")
    return bool(x_admin_key) and x_admin_key == expected


def _display_stock_color(style: str, color: str):
    return format_daily_report_color(
        style,
        color,
    )

def get_stock_inventory_style(style):
    style_text = str(style).strip().lower()

    if "lsds" in style_text or style_text.startswith("sn"):
        return "lsds"

    if "gv" in style_text:
        return "gv print"
    
    if "sprn" in style_text:
        return "sprn"

    return None
def normalize_stock_inventory_color(color):
    color_text = str(color).strip().lower()

    black_colors = {
        "black-front tiger",
        "black-boys",
        "black-bat",
        "black-beast",
        "black-blue bull",
        "black-bull",
        "black-error",
        "black-fearless",
        "black-future",
        "black-green eye",
        "black-jordan",
        "black-red bull",
        "black-smile",
        "black-yellow bull",
        "black-bulls",
        "black-cash",
        "black-dirty",
        "black-rules",
        "black-skull",
        "black-space",
        "black-worry",
    }

    white_colors = {
        "white-boys",
        "white-blue bull",
        "white-jordan",
        "white-crack",
        "white-dope",
        "white-dreams",
        "white-gang",
        "white-free",
        "white-eagle",
        "white-flow",
    }

    if color_text in black_colors:
        return "1 black"

    if color_text in white_colors:
        return "2 white"

    return color


STICKER_COLORS = [
    "1 black",
    "2 white",
    "3 grey",
    "4 sandal",
    "5 navy",
    "6 pink",
    "7 brown",
    "8 olive",
]

LSDS_STICKER_STYLES = [
    f"lsds{n:02d}"
    for n in (
        1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21
    )
]

SN_STICKER_STYLES = [
    "sn450",
    "sn451",
    "sn452",
]

STICKER_STYLES = LSDS_STICKER_STYLES + SN_STICKER_STYLES

STICKER_COLOR_BY_NAME = {
    color.split(" ", 1)[1]: color
    for color in STICKER_COLORS
}


def get_sticker_inventory_style(style):
    style_text = str(style).strip().lower().replace(" ", "")

    lsds_match = re.search(
        r"lsds(\d+)",
        style_text,
    )
    if lsds_match:
        normalized = f"lsds{int(lsds_match.group(1)):02d}"
        if normalized in LSDS_STICKER_STYLES:
            return normalized

    for sticker_style in SN_STICKER_STYLES:
        if sticker_style in style_text:
            return sticker_style

    return None


def normalize_sticker_inventory_color(color):
    color_text = " ".join(
        str(color).strip().lower().split()
    )

    if color_text in STICKER_COLORS:
        return color_text

    if color_text in STICKER_COLOR_BY_NAME:
        return STICKER_COLOR_BY_NAME[color_text]

    numbered_match = re.match(
        r"^([1-8])\s+(.+)$",
        color_text,
    )

    if numbered_match:
        normalized = (
            f"{numbered_match.group(1)} "
            f"{numbered_match.group(2)}"
        )
        if normalized in STICKER_COLORS:
            return normalized

    stock_color = normalize_stock_inventory_color(color)
    stock_color_text = " ".join(
        str(stock_color).strip().lower().split()
    )

    if stock_color_text in STICKER_COLORS:
        return stock_color_text

    return None


def deduct_lsds_stock_inventory(report_rows, db):
    lines_updated = 0
    total_qty_deducted = 0
    deductions = []

    for row in report_rows:
        original_style = str(
            row.get("style", "")
        ).strip()

        style = get_stock_inventory_style(
            original_style
        )

        if not style:
            continue

        qty = _safe_int(
            row.get(
                "need_from_stock",
                row.get("stock_inventory", 0),
            )
        )

        if qty <= 0:
            continue

        color = normalize_stock_inventory_color(
            row.get("color", "")
        )
        size = str(row.get("size", "")).strip()

        stock_row = db.query(StockInventory).filter(
            StockInventory.style == style,
            StockInventory.color == color,
            StockInventory.size == size,
        ).first()

        if not stock_row:
            stock_row = StockInventory(
                style=style,
                color=color,
                size=size,
                qty=0,
            )
            db.add(stock_row)
            db.flush()

        previous_qty = _safe_int(stock_row.qty)
        deducted_qty = min(
            previous_qty,
            qty,
        )
        stock_row.qty = max(
            previous_qty - qty,
            0,
        )

        lines_updated += 1
        total_qty_deducted += deducted_qty

        deductions.append({
            "style": style,
            "color": color,
            "size": size,
            "requested_qty": qty,
            "deducted_qty": deducted_qty,
            "remaining_qty": stock_row.qty,
        })

    return {
        "lines_updated": lines_updated,
        "total_qty_deducted": total_qty_deducted,
        "deductions": deductions,
    }


def deduct_sticker_inventory(report_rows, db):
    lines_updated = 0
    total_qty_deducted = 0
    deductions = []

    for row in report_rows:
        style = get_sticker_inventory_style(
            row.get("style", "")
        )

        if not style:
            continue

        color = normalize_sticker_inventory_color(
            row.get("color", "")
        )

        if not color:
            continue

        qty = _safe_int(
            row.get(
                "need_from_stock",
                row.get("stock_inventory", 0),
            )
        )

        if qty <= 0:
            continue

        sticker_row = db.query(StickerInventory).filter(
            StickerInventory.style == style,
            StickerInventory.color == color,
        ).first()

        if not sticker_row:
            sticker_row = StickerInventory(
                style=style,
                color=color,
                qty=0,
            )
            db.add(sticker_row)
            db.flush()

        previous_qty = _safe_int(sticker_row.qty)
        deducted_qty = min(
            previous_qty,
            qty,
        )
        sticker_row.qty = max(
            previous_qty - qty,
            0,
        )

        lines_updated += 1
        total_qty_deducted += deducted_qty

        deductions.append({
            "style": style,
            "color": color,
            "requested_qty": qty,
            "deducted_qty": deducted_qty,
            "remaining_qty": sticker_row.qty,
        })

    return {
        "lines_updated": lines_updated,
        "total_qty_deducted": total_qty_deducted,
        "deductions": deductions,
    }


def seed_stock_inventory_if_empty(db):
    has_rows = db.query(
        StockInventory.id
    ).first()

    if has_rows:
        return

    sizes = ["M", "L", "XL"]

    lsds_colors = [
        ("1 black", 0, 0, 0),
        ("2 white", 0, 0, 0),
        ("3 grey", 0, 0, 0),
        ("4 sandal", 0, 0, 0),
        ("5 navy", 0, 0, 0),
        ("6 pink", 0, 0, 0),
        ("7 brown", 0, 0, 0),
        ("8 olive", 0, 0, 0),
        ("9 cream", 0, 0, 0),
        ("10 grey melange", 0, 0, 0),
        ("11 charcoal melange", 0, 0, 0),
        ("12 dark grey", 0, 0, 0),
    ]

    gv_print_colors = [
        ("black", 0, 0, 0),
        ("navy", 0, 0, 0),
        ("maroon", 0, 0, 0),
        ('red', 0, 0, 0),
        ("yellow", 0, 0, 0),
        ("sky blue", 0, 0, 0),
        ("light grey", 0, 0, 0),
        ("dark grey", 0, 0, 0),
    ]

    sprn_colors = [
        ("black", 0, 0, 0),
        ("white", 0, 0, 0),
        ("navy", 0, 0, 0),
        ("maroon", 0, 0, 0),
        ("light grey", 0, 0, 0),
        ("dark grey", 0, 0, 0),
    ]

    inventories = [
        ("lsds", lsds_colors),
        ("gv print", gv_print_colors),
        ("sprn", sprn_colors),
    ]

    for style, colors in inventories:
        for color, *qty_values in colors:
            for size, qty in zip(sizes, qty_values):
                db.add(
                    StockInventory(
                        style=style,
                        color=color,
                        size=size,
                        qty=qty,
                    )
                )

    db.commit()


def ensure_sticker_inventory(db):
    legacy_rows = db.query(StickerInventory).filter(
        StickerInventory.style == "lsds",
    ).all()

    if legacy_rows:
        for row in legacy_rows:
            db.delete(row)
        db.flush()

    existing = {
        (row.style, row.color)
        for row in db.query(
            StickerInventory.style,
            StickerInventory.color,
        ).all()
    }

    added = False
    for style in STICKER_STYLES:
        for color in STICKER_COLORS:
            if (style, color) not in existing:
                db.add(
                    StickerInventory(
                        style=style,
                        color=color,
                        qty=0,
                    )
                )
                added = True

    if legacy_rows or added:
        db.commit()


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

@router.post("/sku-master/manual")
def save_manual_sku_master(
    items: List[ManualSKUMasterCreate],
    db: Session = Depends(get_db),
):
    saved_items = []

    for item in items:
        sku_value = item.sku.strip()

        if not sku_value:
            continue

        normalized_sku = normalize_sku(sku_value)
        existing_sku = None

        for row in db.query(SKUMaster).all():
            if normalize_sku(row.sku) == normalized_sku:
                existing_sku = row
                break

        if existing_sku:
            sku_master = existing_sku
            sku_master.platform = item.platform or "Common"
            sku_master.sku = sku_value
            sku_master.style = (item.style or "").strip()
            sku_master.size = (item.size or "").strip()

            db.query(SKUPiece).filter(
                SKUPiece.sku_master_id == sku_master.id
            ).delete()
        else:
            sku_master = SKUMaster(
                platform=item.platform or "Common",
                sku=sku_value,
                style=(item.style or "").strip(),
                size=(item.size or "").strip(),
            )
            db.add(sku_master)
            db.flush()

        for piece in item.pieces:
            color_value = clean_color_name(piece.color or "")

            if (
                not color_value
                or color_value == "nan"
                or color_value == "-"
            ):
                continue

            qty_value = _safe_int(piece.qty)

            if qty_value <= 0:
                continue

            db.add(
                SKUPiece(
                    sku_master_id=sku_master.id,
                    color=color_value,
                    qty=qty_value,
                )
            )

        saved_items.append(
            {
                "sku": sku_master.sku,
                "platform": sku_master.platform,
            }
        )

    if not saved_items:
        raise HTTPException(
            status_code=400,
            detail="Enter at least one SKU.",
        )

    db.commit()

    return {
        "message": "SKU master updated",
        "count": len(saved_items),
        "items": saved_items,
    }

@router.post("/upload-file")
def upload_file(
    file: UploadFile = File(...)
):

    file_path = _save_upload(file)

    # =====================================
    # AUTO IMPORT SKU MASTER
    # =====================================

    if (
        "sku" in file.filename.lower()
        or
        "master" in file.filename.lower()
    ):

        try:
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
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Could not read SKU master Excel file: {e}",
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

        except Exception as e:

            db.rollback()

            raise HTTPException(
                status_code=400,
                detail=f"Could not import SKU master: {e}",
            )

        finally:

            db.close()

    return {

        "message":
        "File uploaded successfully",

        "filename":
        getattr(
            file,
            "saved_filename",
            file.filename
        )
    }


# =====================================
# READ EXCEL SHEETS
# =====================================

@router.get("/read-master/{filename}")
def read_master_file(filename: str):

    file_path = os.path.join(
        UPLOAD_FOLDER,
        _clean_upload_filename(filename)
    )

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

    file_path = os.path.join(
        UPLOAD_FOLDER,
        _clean_upload_filename(filename)
    )

    return read_sheet_columns(
        file_path,
        sheet_name
    )


# =====================================
# READ CSV COLUMNS
# =====================================

@router.get("/read-csv-columns/{filename}")
def get_csv_columns(filename: str):

    file_path = os.path.join(
        UPLOAD_FOLDER,
        _clean_upload_filename(filename)
    )

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

    file_path = os.path.join(
        UPLOAD_FOLDER,
        _clean_upload_filename(filename)
    )

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

    file_path = os.path.join(
        UPLOAD_FOLDER,
        _clean_upload_filename(filename)
    )

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

    file_path = _save_upload(file)

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
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Could not import returns file: {e}"
        )
    finally:
        db.close()


@router.get("/stock-inventory")
def list_stock_inventory(search: Optional[str] = Query(None)):
    db: Session = SessionLocal()
    try:
        seed_stock_inventory_if_empty(db)

        q = db.query(StockInventory)

        if search and search.strip():
            term = f"%{search.strip()}%"
            q = q.filter(
                or_(
                    StockInventory.style.ilike(term),
                    StockInventory.color.ilike(term),
                    StockInventory.size.ilike(term),
                )
            )

        rows = (
            q.order_by(
                StockInventory.style.asc(),
                StockInventory.color.asc(),
                StockInventory.size.asc(),
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
                    "display_color": _display_stock_color(
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


@router.patch("/stock-inventory/{inventory_id}")
def update_stock_inventory_qty(
    inventory_id: int,
    body: StockInventoryUpdate,
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
        row = db.query(StockInventory).filter(
            StockInventory.id == inventory_id
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


@router.get("/sticker-inventory")
def list_sticker_inventory(search: Optional[str] = Query(None)):
    db: Session = SessionLocal()
    try:
        ensure_sticker_inventory(db)

        q = db.query(StickerInventory)

        if search and search.strip():
            term = f"%{search.strip()}%"
            q = q.filter(
                or_(
                    StickerInventory.style.ilike(term),
                    StickerInventory.color.ilike(term),
                )
            )

        rows = (
            q.order_by(
                StickerInventory.style.asc(),
                StickerInventory.color.asc(),
            )
            .all()
        )
        return {
            "count": len(rows),
            "rows": [
                {
                    "id": row.id,
                    "style": row.style,
                    "color": row.color,
                    "qty": row.qty,
                }
                for row in rows
            ],
        }
    finally:
        db.close()


@router.patch("/sticker-inventory/{inventory_id}")
def update_sticker_inventory_qty(
    inventory_id: int,
    body: StickerInventoryUpdate,
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
        row = db.query(StickerInventory).filter(
            StickerInventory.id == inventory_id
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
            "qty": row.qty,
        }
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

    meesho_file: UploadFile = File(None),

    myntra_file: UploadFile = File(None)
):

    all_orders = []
    platform_orders = {}
    platform_orders = {}

    # =====================
    # FLIPKART
    # =====================

    if flipkart_file:

        flipkart_orders = (
            _read_uploaded_orders(
                "Flipkart",
                flipkart_file,
                filter_flipkart_orders
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

        amazon_orders = (
            _read_uploaded_orders(
                "Amazon",
                amazon_file,
                filter_amazon_orders
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

        ajio_orders = (
            _read_uploaded_orders(
                "Ajio",
                ajio_file,
                filter_ajio_orders
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

        meesho_orders = (
            _read_uploaded_orders(
                "Meesho",
                meesho_file,
                filter_meesho_orders
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

        myntra_orders = (
            _read_uploaded_orders(
                "Myntra",
                myntra_file,
                filter_myntra_orders
            )
        )
        platform_orders["Myntra"] = myntra_orders

        all_orders.extend(
            myntra_orders
        )

    # =====================
    # AGGREGATE
    # =====================

    aggregated_orders = aggregate_orders(
        all_orders
    )

    db: Session = SessionLocal()

    try:
        _raise_if_unknown_platform_skus(
            db,
            platform_orders,
        )

        expanded_inventory = expand_inventory(
            aggregated_orders,
            db
        )

        final_report = generate_daily_report(
            expanded_inventory,
            db
        )

        report_date = datetime.now().date()

        all_platform_orders = _orders_for_report_date(
            platform_orders,
            report_date,
        )
        all_platform_aggregated = aggregate_orders(
            all_platform_orders
        )
        all_platform_expanded = expand_inventory(
            all_platform_aggregated,
            db
        )
        all_platform_report = generate_daily_report(
            all_platform_expanded,
            db
        )

        save_daily_report_rows(
            db,
            report_date,
            "All",
            all_platform_report
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
                "Myntra": myntra_file,
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

        flipkart_orders = (
            _read_uploaded_orders(
                "Flipkart",
                flipkart_file,
                filter_flipkart_orders
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

        amazon_orders = (
            _read_uploaded_orders(
                "Amazon",
                amazon_file,
                filter_amazon_orders
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

        ajio_orders = (
            _read_uploaded_orders(
                "Ajio",
                ajio_file,
                filter_ajio_orders
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

        meesho_orders = (
            _read_uploaded_orders(
                "Meesho",
                meesho_file,
                filter_meesho_orders
            )
        )
        print("MEESHO SAMPLE")
        print(meesho_orders[:5])
        platform_orders["Meesho"] = meesho_orders

        all_orders.extend(
            meesho_orders
        )

            # =====================
    # MYNTRA
    # =====================

    if myntra_file:

        myntra_orders = (
            _read_uploaded_orders(
                "Myntra",
                myntra_file,
                filter_myntra_orders
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

    include_detail_columns: bool = Form(True),
    include_order_summary: bool = Form(True),
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
    order_summary_rows = []

    try:
        _raise_if_unknown_platform_skus(
            db,
            platform_orders,
        )

        expanded_inventory = expand_inventory(
            aggregated_orders,
            db
        )

        final_report = generate_daily_report(
            expanded_inventory,
            db
        )

        report_date = datetime.now().date()

        all_platform_orders = _orders_for_report_date(
            platform_orders,
            report_date,
        )
        all_platform_aggregated = aggregate_orders(
            all_platform_orders
        )
        all_platform_expanded = expand_inventory(
            all_platform_aggregated,
            db
        )
        all_platform_report = generate_daily_report(
            all_platform_expanded,
            db
        )

        save_daily_report_rows(
            db,
            report_date,
            "All",
            all_platform_report
        )

        counted_platforms, _ = _save_new_platform_sales(
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

        if include_order_summary:
            for platform_name, orders in platform_orders.items():
                platform_aggregated = aggregate_orders(orders)
                platform_expanded = expand_inventory(
                    platform_aggregated,
                    db
                )
                order_summary_rows.append(
                    {
                        "platform": platform_name,
                        "total_orders": _unique_order_count(orders),
                        "piece_qty": sum(
                            _safe_int(item.get("qty", 0))
                            for item in platform_expanded
                        ),
                    }
                )

        for platform in counted_platforms:
            platform_deduction_orders = aggregate_orders(
                platform_orders.get(platform, [])
            )

            if not platform_deduction_orders:
                continue

            deduction_inventory = expand_inventory(
                platform_deduction_orders,
                db
            )
            stock_deduction_report = generate_daily_report(
                deduction_inventory,
                db
            )

            stock_result = deduct_lsds_stock_inventory(
                stock_deduction_report,
                db
            )
            _log_inventory_deductions(
                db,
                report_date,
                platform,
                "stock",
                stock_result.get("deductions", []),
            )

            sticker_result = deduct_sticker_inventory(
                stock_deduction_report,
                db
            )
            _log_inventory_deductions(
                db,
                report_date,
                platform,
                "sticker",
                sticker_result.get("deductions", []),
            )

            return_result = deduct_return_inventory(
                deduction_inventory,
                db
            )
            _log_inventory_deductions(
                db,
                report_date,
                platform,
                "return",
                return_result.get("deductions", []),
            )

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

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
        "%d-%m-%Y_%H%M"
    )
    today_date = now.strftime("%d-%m-%Y")
    generated_at = now.strftime(
        "%d-%m-%Y %I:%M %p"
    )

    output_file = (
        os.path.join(
            UPLOAD_FOLDER,
            f"final_report_{timestamp}.xlsx"
        )
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
    columns_per_size = 3 if include_detail_columns else 1
    total_columns = 2 + (len(available_sizes) * columns_per_size)
    summary_columns = 3 if include_order_summary else 0
    sheet_columns = max(total_columns, summary_columns, 2)
    last_column = get_column_letter(max(total_columns, 2))
    header_start_row = 2

    if include_order_summary:
        header_start_row = 6 + len(order_summary_rows)

    header_end_row = (
        header_start_row + 1
        if include_detail_columns
        else header_start_row
    )
    data_start_row = header_end_row + 1

    ws.title = "Final Report"
    ws.merge_cells(f"A1:{get_column_letter(sheet_columns)}1")
    ws["A1"] = f"Generated At: {generated_at}"

    if include_order_summary:
        ws.merge_cells(f"A2:{get_column_letter(sheet_columns)}2")
        ws["A2"] = "Order Summary"
        ws.append([
            "Platform",
            "Total Orders",
            "Total Piece Qty",
        ])

        for summary in order_summary_rows:
            ws.append([
                summary["platform"],
                summary["total_orders"],
                summary["piece_qty"],
            ])

        ws.append([
            "Total",
            sum(item["total_orders"] for item in order_summary_rows),
            sum(item["piece_qty"] for item in order_summary_rows),
        ])
        ws.append([""] * sheet_columns)

    # =====================
    # HEADER DESIGN
    # =====================

    headers = ["Style", "Color"]
    sub_headers = ["", ""]

    for size in available_sizes:
        if include_detail_columns:
            headers.extend([size, "", ""])
            sub_headers.extend([
                "Total Order",
                "Return Stock",
                "Need to Print"
            ])
        else:
            headers.append(size)

    ws.append(headers)

    if include_detail_columns:
        ws.append(sub_headers)

        ws.merge_cells(f"A{header_start_row}:A{header_end_row}")
        ws.merge_cells(f"B{header_start_row}:B{header_end_row}")

        for index, _ in enumerate(available_sizes):
            start_col = 3 + (index * columns_per_size)
            end_col = start_col + columns_per_size - 1
            ws.merge_cells(
                (
                    f"{get_column_letter(start_col)}{header_start_row}:"
                    f"{get_column_letter(end_col)}{header_start_row}"
                )
            )

    # =====================
    # STYLES
    # =====================

    header_fill = PatternFill(
        start_color="213A69",
        end_color="213A69",
        fill_type="solid"
    )

    header_font = Font(
        bold=True,
        color="FFFFFF",
        size=14,
    )

    data_font = Font(size=12 )

    center_align = Alignment(
        horizontal="center",
        vertical="center",
        wrap_text=True,
    )

    thin_border = Border(
        left=Side(style="thin", color="FFFFFF"),
        right=Side(style="thin", color="FFFFFF"),
        bottom=Side(style="thin", color="FFFFFF")
    )

    timestamp_fill = PatternFill(
        start_color="E5E7EB",
        end_color="E5E7EB",
        fill_type="solid"
    )

    subtotal_fill = PatternFill(
        start_color="213A69",
        end_color="213A69",
        fill_type="solid"
    )

    table_light_fill = PatternFill(
        start_color="7A9BD6",
        end_color="7A9BD6",
        fill_type="solid"
    )

    table_lighter_fill = PatternFill(
        start_color="ABC4EA",
        end_color="ABC4EA",
        fill_type="solid"
    )

    subtotal_font = Font(
        bold=True,
        color="FFFFFF",
        size=12,
    )

    summary_title_fill = PatternFill(
        start_color="FDE68A",
        end_color="FDE68A",
        fill_type="solid"
    )

    summary_header_fill = PatternFill(
        start_color="FEF3C7",
        end_color="FEF3C7",
        fill_type="solid"
    )

    ws["A1"].fill = timestamp_fill
    ws["A1"].font = Font(bold=True, color="111827", size=12)
    ws["A1"].alignment = Alignment(
        horizontal="center",
        vertical="center",
    )
    ws.row_dimensions[1].height = 18

    if include_order_summary:
        ws["A2"].fill = summary_title_fill
        ws["A2"].font = Font(bold=True, color="92400E", size=13)
        ws["A2"].alignment = center_align

        summary_end_row = 3 + len(order_summary_rows) + 1

        for row in ws.iter_rows(
            min_row=3,
            max_row=summary_end_row,
            min_col=1,
            max_col=3
        ):
            for cell in row:
                cell.alignment = center_align
                cell.border = thin_border

                if cell.row == 3:
                    cell.fill = summary_header_fill
                    cell.font = Font(bold=True, color="78350F", size=11)
                elif cell.row == summary_end_row:
                    cell.fill = subtotal_fill
                    cell.font = subtotal_font
                else:
                    cell.font = Font(size=11)

    for row in ws.iter_rows(
        min_row=header_start_row,
        max_row=header_end_row,
        min_col=1,
        max_col=max(total_columns, 2)
    ):

        for cell in row:

            cell.fill = header_fill

            cell.font = header_font

            cell.alignment = center_align


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

    subtotal_rows = set()
    blank_rows = set()
    current_style = None
    style_totals = None

    def add_style_subtotal_row(style_name):
        subtotal_row = [
            "Total",
            ""
        ]

        for size in available_sizes:
            totals = style_totals.get(
                size,
                {
                    "total_order_qty": 0,
                    "return_qty": 0,
                    "stock_qty": 0,
                }
            )

            subtotal_row.extend([
                (
                    " "
                    if totals["total_order_qty"] == 0
                    else totals["total_order_qty"]
                )
            ])

            if include_detail_columns:
                subtotal_row.extend([
                    (
                        " "
                        if totals["return_qty"] == 0
                        else totals["return_qty"]
                    ),
                    (
                        " "
                        if totals["stock_qty"] == 0
                        else totals["stock_qty"]
                    ),
                ])

        ws.append(subtotal_row)

        subtotal_row_number = ws.max_row
        subtotal_rows.add(subtotal_row_number)

        for cell in ws[subtotal_row_number]:
            cell.fill = subtotal_fill
            cell.font = subtotal_font
            cell.alignment = center_align

    for (style, color), sizes in grouped_data.items():

        if current_style is None:
            current_style = style
            style_totals = {
                size: {
                    "total_order_qty": 0,
                    "return_qty": 0,
                    "stock_qty": 0,
                }
                for size in available_sizes
            }

        elif style != current_style:
            add_style_subtotal_row(current_style)        

            current_style = style
            style_totals = {
                size: {
                    "total_order_qty": 0,
                    "return_qty": 0,
                    "stock_qty": 0,
                }
                for size in available_sizes
            }

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

                style_totals[size]["total_order_qty"] += _safe_int(
                    total_qty or 0
                )
                style_totals[size]["return_qty"] += _safe_int(
                    return_qty or 0
                )
                style_totals[size]["stock_qty"] += _safe_int(
                    stock_qty or 0
                )

                row.extend([
                    (
                        "-"
                        if total_qty == 0
                        else total_qty
                    )
                ])

                if include_detail_columns:
                    row.extend([
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
                row.extend(["-"] * columns_per_size)

        ws.append(row)

    if current_style is not None:
        add_style_subtotal_row(current_style)

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
        sheet_columns + 1
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

    for row in ws.iter_rows(

        min_row=data_start_row,

        max_row=ws.max_row,

        min_col=1,

        max_col=ws.max_column
    ):

        for cell in row:

            if cell.row in blank_rows:
                continue

            cell.alignment = center_align
            cell.border = thin_border

            if cell.row in subtotal_rows:
                cell.font = subtotal_font
                cell.fill = subtotal_fill
                continue

            cell.font = data_font
            if (cell.row - data_start_row) % 2 == 0:
                cell.fill = table_light_fill
            else:
                cell.fill = table_lighter_fill

    wb.save(output_file)

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

    db: Session = SessionLocal()
    report_date = datetime.now().date()
    platform_files = {
        "Flipkart": flipkart_file,
        "Amazon": amazon_file,
        "Ajio": ajio_file,
        "Meesho": meesho_file,
        "Myntra": myntra_file,
    }

    try:
        _raise_if_unknown_platform_skus(
            db,
            platform_orders,
        )

        new_orders, counted_platforms, skipped_platforms = (
            _orders_from_new_platform_uploads(
                db,
                report_date,
                platform_orders,
                platform_files,
            )
        )

        if not new_orders:
            return {
                "message": (
                    "No new uploads to confirm. "
                    "Duplicate files are skipped."
                ),
                "lines_updated": 0,
                "total_qty_deducted": 0,
                "deductions": [],
                "counted_platforms": counted_platforms,
                "skipped_duplicate_platforms": skipped_platforms,
            }

        aggregated_orders = aggregate_orders(new_orders)

        expanded_inventory = expand_inventory(
            aggregated_orders,
            db,
        )

        result = deduct_return_inventory(
            expanded_inventory,
            db,
        )
        db.commit()
        result["counted_platforms"] = counted_platforms
        result["skipped_duplicate_platforms"] = skipped_platforms
        return result
    finally:
        db.close()


def _clean_extracted_sku(raw_value: str):
    value = str(raw_value or "").strip()
    value = re.sub(r"\s+", " ", value)
    value = re.split(
        r"\s{2,}|\b(?:qty|quantity|hsn|asin|fnsku|tax|description)\b",
        value,
        flags=re.IGNORECASE,
    )[0].strip(" :-#|")
    value = re.sub(r"\s+", "", value)
    return value[:80]


def _looks_like_amazon_seller_sku(value: str):
    value = str(value or "").strip()

    if len(value) < 5:
        return False

    if not re.search(r"[-_]", value):
        return False

    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        return False

    return True


def _extract_amazon_invoice_sku(text: str):
    combined_text = re.sub(r"\s+", " ", str(text or ""))
    wrapped_sku_match = re.search(
        r"\bB0[A-Z0-9]{8,}\s*\(\s*([A-Z0-9][A-Z0-9._/\-\s]{2,80}?)\s*\)",
        combined_text,
    )

    if wrapped_sku_match:
        sku = _clean_extracted_sku(wrapped_sku_match.group(1))
        if _looks_like_amazon_seller_sku(sku):
            return sku

    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in str(text or "").splitlines()
        if line.strip()
    ]

    sku_patterns = [
        r"\(\s*([A-Z0-9][A-Z0-9._/\-]{2,80})\s*\)",
        r"\bMerchant\s+SKU\b\s*(?:No\.?|#|:|-)?\s*([A-Za-z0-9][A-Za-z0-9._/\- ]{1,80})",
        r"\bSeller\s+SKU\b\s*(?:No\.?|#|:|-)?\s*([A-Za-z0-9][A-Za-z0-9._/\- ]{1,80})",
        r"\bSKU\b\s*(?:No\.?|#|:|-)?\s*([A-Za-z0-9][A-Za-z0-9._/\- ]{1,80})",
    ]

    for index, line in enumerate(lines):
        has_sku_label = re.search(r"\bSKU\b", line, flags=re.IGNORECASE)
        has_parenthesized_code = re.search(
            r"\(\s*[A-Z0-9][A-Z0-9._/\-]{2,80}\s*\)",
            line,
        )

        if not has_sku_label and not has_parenthesized_code:
            continue

        for pattern in sku_patterns:
            match = re.search(pattern, line, flags=re.IGNORECASE)
            if match:
                sku = _clean_extracted_sku(match.group(1))
                if (
                    sku
                    and not re.fullmatch(r"sku", sku, flags=re.IGNORECASE)
                    and _looks_like_amazon_seller_sku(sku)
                ):
                    return sku

        if re.fullmatch(
            r"(?:Merchant\s+|Seller\s+)?SKU\s*:?",
            line,
            flags=re.IGNORECASE,
        ) and index + 1 < len(lines):
            sku = _clean_extracted_sku(lines[index + 1])
            if sku and _looks_like_amazon_seller_sku(sku):
                return sku

    return None


def _extract_amazon_invoice_qty(text: str):
    text = str(text or "")
    patterns = [
        r"\bQty\s*:?\s*(\d+)",
        r"\bQuantity\s*:?\s*(\d+)",
        r"\bQty\b\s+(\d+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1)

    return "1"


def _make_sku_overlay(width: float, height: float, sku: str, qty: str):
    from io import BytesIO
    from reportlab.lib.colors import black
    from reportlab.pdfgen import canvas

    packet = BytesIO()
    overlay = canvas.Canvas(packet, pagesize=(float(width), float(height)))
    label = f"( {sku or 'NOT FOUND'} ) (Qty: {qty or '1'})"
    x = 50
    y = 174.7
    box_width = 520
    box_height = 25.3

    overlay.setStrokeColor(black)
    overlay.setLineWidth(1)
    overlay.rect(x, y, box_width, box_height, stroke=1, fill=0)
    overlay.setFillColor(black)
    overlay.setFont("Times-Bold", 17)
    overlay.drawString(x + 5, y + 10.3, label[:60])
    overlay.save()
    packet.seek(0)
    return packet


def _build_amazon_label_cropper_pdf(input_path: str, output_path: str):
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(input_path)
    writer = PdfWriter()
    total_pages = len(reader.pages)

    if total_pages < 2:
        raise HTTPException(
            status_code=400,
            detail="Amazon PDF must contain label and invoice page pairs.",
        )

    missing_skus = []

    for label_index in range(0, total_pages, 2):
        invoice_index = label_index + 1

        if invoice_index >= total_pages:
            break

        label_page = reader.pages[label_index]
        invoice_text = reader.pages[invoice_index].extract_text() or ""
        sku = _extract_amazon_invoice_sku(invoice_text)
        qty = _extract_amazon_invoice_qty(invoice_text)

        if not sku:
            missing_skus.append((label_index // 2) + 1)
            sku = "NOT FOUND"

        width = float(label_page.mediabox.width)
        height = float(label_page.mediabox.height)
        overlay_reader = PdfReader(
            _make_sku_overlay(
                width,
                height,
                sku,
                qty,
            )
        )
        label_page.merge_page(overlay_reader.pages[0])
        writer.add_page(label_page)

    if len(writer.pages) == 0:
        raise HTTPException(
            status_code=400,
            detail="No shipping label pages were found in the uploaded PDF.",
        )

    with open(output_path, "wb") as output_file:
        writer.write(output_file)

    return {
        "label_count": len(writer.pages),
        "missing_skus": missing_skus,
    }


def _transform_point(matrix, x_value, y_value):
    a, b, c, d, e, f = matrix
    return (
        a * x_value + c * y_value + e,
        b * x_value + d * y_value + f,
    )


def _multiply_pdf_matrix(left, right):
    a, b, c, d, e, f = left
    g, h, i, j, k, l = right
    return [
        a * g + b * i,
        a * h + b * j,
        c * g + d * i,
        c * h + d * j,
        e * g + f * i + k,
        e * h + f * j + l,
    ]


def _flipkart_page_horizontal_segments(page):
    from pypdf.generic import ContentStream

    content = page.get_contents()
    if content is None:
        return []

    stream = ContentStream(content, page.pdf)
    matrix = [1, 0, 0, 1, 0, 0]
    stack = []
    dash = []
    current = None
    segments = []

    for operands, operator in stream.operations:
        if operator == b"q":
            stack.append((matrix[:], dash[:]))
            continue

        if operator == b"Q":
            if stack:
                matrix, dash = stack.pop()
            continue

        if operator == b"cm":
            matrix = _multiply_pdf_matrix(
                matrix,
                [float(value) for value in operands],
            )
            continue

        if operator == b"d":
            dash = list(operands[0]) if operands else []
            continue

        if operator == b"m":
            current = _transform_point(
                matrix,
                float(operands[0]),
                float(operands[1]),
            )
            continue

        if operator != b"l" or current is None:
            if operator in (b"h", b"n", b"S", b"s", b"f", b"F", b"f*"):
                current = None
            continue

        next_point = _transform_point(
            matrix,
            float(operands[0]),
            float(operands[1]),
        )
        x1, y1 = current
        x2, y2 = next_point

        if abs(y1 - y2) < 1 and abs(x2 - x1) > 20:
            segments.append(
                {
                    "x1": min(x1, x2),
                    "x2": max(x1, x2),
                    "y": (y1 + y2) / 2,
                    "dash": dash[:],
                }
            )

        current = next_point

    return segments


def _detect_flipkart_separator_y(page):
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    segments = _flipkart_page_horizontal_segments(page)
    dashed_segments = [
        segment
        for segment in segments
        if segment["dash"]
        and (segment["x2"] - segment["x1"]) >= width * 0.65
        and height * 0.35 <= segment["y"] <= height * 0.65
    ]

    if dashed_segments:
        return max(
            dashed_segments,
            key=lambda segment: segment["x2"] - segment["x1"],
        )["y"]

    full_width_segments = [
        segment
        for segment in segments
        if (segment["x2"] - segment["x1"]) >= width * 0.75
        and height * 0.35 <= segment["y"] <= height * 0.65
    ]

    if full_width_segments:
        return max(
            full_width_segments,
            key=lambda segment: segment["y"],
        )["y"]

    raise HTTPException(
        status_code=400,
        detail="Could not detect the Flipkart label separator line.",
    )


def _detect_flipkart_label_bounds(page, separator_y: float):
    from collections import Counter

    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    segments = _flipkart_page_horizontal_segments(page)
    label_segments = [
        segment
        for segment in segments
        if separator_y + 2 <= segment["y"] <= height - 20
        and 160 <= (segment["x2"] - segment["x1"]) <= 260
    ]

    if not label_segments:
        return 0, separator_y, width, height

    endpoint_pairs = Counter(
        (
            round(segment["x1"] * 4) / 4,
            round(segment["x2"] * 4) / 4,
        )
        for segment in label_segments
    )
    left, right = endpoint_pairs.most_common(1)[0][0]
    top = max(
        segment["y"]
        for segment in label_segments
        if abs(segment["x1"] - left) < 1
        and abs(segment["x2"] - right) < 1
    )

    return (
        max(0, left - 26.25),
        max(0, separator_y + 3.5),
        min(width, right + 26.5),
        min(height, top + 7.25),
    )


def _detect_flipkart_crop_box_fast(page):
    from collections import Counter
    from pypdf.generic import ContentStream

    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    content = page.get_contents()

    if content is None:
        raise HTTPException(
            status_code=400,
            detail="Could not read the Flipkart label page content.",
        )

    stream = ContentStream(content, page.pdf)
    matrix = [1, 0, 0, 1, 0, 0]
    stack = []
    dash = []
    current = None
    endpoint_pairs = Counter()
    endpoint_tops = {}
    dashed_separator = None
    full_width_separators = []

    for index, (operands, operator) in enumerate(stream.operations):
        if operator == b"q":
            stack.append((matrix[:], dash[:]))
            continue

        if operator == b"Q":
            if stack:
                matrix, dash = stack.pop()
            continue

        if operator == b"cm":
            matrix = _multiply_pdf_matrix(
                matrix,
                [float(value) for value in operands],
            )
            continue

        if operator == b"d":
            dash = list(operands[0]) if operands else []
            continue

        if operator == b"m":
            current = _transform_point(
                matrix,
                float(operands[0]),
                float(operands[1]),
            )
            continue

        if operator != b"l" or current is None:
            if operator in (b"h", b"n", b"S", b"s", b"f", b"F", b"f*"):
                current = None
            continue

        next_point = _transform_point(
            matrix,
            float(operands[0]),
            float(operands[1]),
        )
        x1, y1 = current
        x2, y2 = next_point
        current = next_point

        if abs(y1 - y2) >= 1:
            continue

        left = min(x1, x2)
        right = max(x1, x2)
        y_position = (y1 + y2) / 2
        line_width = right - left

        if height * 0.35 <= y_position <= height * 0.65:
            if dash and line_width >= width * 0.65:
                dashed_separator = y_position
            elif line_width >= width * 0.75:
                full_width_separators.append(y_position)

        if y_position >= height * 0.5 and 160 <= line_width <= 260:
            endpoint_pair = (
                round(left * 4) / 4,
                round(right * 4) / 4,
            )
            endpoint_pairs[endpoint_pair] += 1
            endpoint_tops[endpoint_pair] = max(
                endpoint_tops.get(endpoint_pair, -1),
                y_position,
            )

        if (
            index > 3500
            and endpoint_pairs
            and (
                dashed_separator is not None
                or full_width_separators
            )
        ):
            break

    if dashed_separator is not None:
        separator_y = dashed_separator
    elif full_width_separators:
        separator_y = max(full_width_separators)
    else:
        raise HTTPException(
            status_code=400,
            detail="Could not detect the Flipkart label separator line.",
        )

    if not endpoint_pairs:
        raise HTTPException(
            status_code=400,
            detail="Could not detect the Flipkart label border.",
        )

    left, right = endpoint_pairs.most_common(1)[0][0]
    top = endpoint_tops[(left, right)]

    return (
        max(0, left - 26.25),
        max(0, separator_y + 3.5),
        min(width, right + 26.5),
        min(height, top + 7.25),
    )


def _build_flipkart_label_cropper_pdf(input_path: str, output_path: str):
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import RectangleObject

    reader = PdfReader(input_path)
    writer = PdfWriter()

    if len(reader.pages) == 0:
        raise HTTPException(
            status_code=400,
            detail="Flipkart PDF does not contain any pages.",
        )

    first_page = reader.pages[0]
    reusable_crop_box = _detect_flipkart_crop_box_fast(first_page)
    reusable_page_size = (
        round(float(first_page.mediabox.width), 2),
        round(float(first_page.mediabox.height), 2),
    )

    for page in reader.pages:
        page_size = (
            round(float(page.mediabox.width), 2),
            round(float(page.mediabox.height), 2),
        )

        if page_size == reusable_page_size:
            crop_box = reusable_crop_box
        else:
            try:
                crop_box = _detect_flipkart_crop_box_fast(page)
            except HTTPException:
                separator_y = _detect_flipkart_separator_y(page)
                crop_box = _detect_flipkart_label_bounds(
                    page,
                    separator_y,
                )
        page.cropbox = RectangleObject(crop_box)
        writer.add_page(page)

    with open(output_path, "wb") as output_file:
        writer.write(output_file)

    return {
        "label_count": len(writer.pages),
    }


def _cropped_output_filename(upload_file: UploadFile):
    clean_name = _clean_upload_filename(
        upload_file.filename
    )
    name_without_extension, _ = os.path.splitext(clean_name)
    return f"{name_without_extension} - cropped.pdf"


@router.post("/label-cropper")
def label_cropper(
    flipkart_file: UploadFile = File(None),
    amazon_file: UploadFile = File(None),
):
    if not amazon_file and not flipkart_file:
        raise HTTPException(
            status_code=400,
            detail="Upload a Flipkart or Amazon label PDF.",
        )

    if amazon_file and flipkart_file:
        raise HTTPException(
            status_code=400,
            detail="Upload one label PDF per request.",
        )

    if amazon_file and not amazon_file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Amazon label cropper accepts PDF files only.",
        )

    if flipkart_file and not flipkart_file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Flipkart label cropper accepts PDF files only.",
        )

    upload_file = amazon_file or flipkart_file
    input_path = _save_upload(upload_file)
    timestamp = datetime.now().strftime("%d-%m-%Y_%H%M%S")
    platform = "amazon" if amazon_file else "flipkart"
    output_filename = _cropped_output_filename(upload_file)
    output_path = os.path.join(
        UPLOAD_FOLDER,
        f"{platform}_{timestamp}_{output_filename}",
    )

    try:
        if amazon_file:
            _build_amazon_label_cropper_pdf(input_path, output_path)
        else:
            _build_flipkart_label_cropper_pdf(input_path, output_path)
    except ImportError as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "PDF tools are missing. Install pypdf and reportlab, then try again."
            ),
        ) from error

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=output_filename,
    )


@router.get(
    "/current-sku-master"
)
def current_sku_master():

    upload_folder = UPLOAD_FOLDER

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

@router.get("/stock-alerts")
def stock_alerts(
    threshold: int = Query(250)
):
    db: Session = SessionLocal()

    try:
        seed_stock_inventory_if_empty(db)
        ensure_sticker_inventory(db)

        stock_rows = (
            db.query(StockInventory)
            .filter(
                StockInventory.qty < threshold
            )
            .order_by(
                StockInventory.qty.asc(),
                StockInventory.style.asc(),
                StockInventory.color.asc(),
                StockInventory.size.asc(),
            )
            .all()
        )

        sticker_rows = (
            db.query(StickerInventory)
            .filter(
                StickerInventory.qty < threshold
            )
            .order_by(
                StickerInventory.qty.asc(),
                StickerInventory.style.asc(),
                StickerInventory.color.asc(),
            )
            .all()
        )

        stock_items = [
            {
                "id": row.id,
                "style": row.style,
                "color": row.color,
                "size": row.size,
                "qty": row.qty,
                "type": "piece",
            }
            for row in stock_rows
        ]

        sticker_items = [
            {
                "id": row.id,
                "style": row.style,
                "color": row.color,
                "qty": row.qty,
                "type": "sticker",
            }
            for row in sticker_rows
        ]

        return {
            "count": len(stock_items) + len(sticker_items),
            "stock_count": len(stock_items),
            "sticker_count": len(sticker_items),
            "threshold": threshold,
            "items": stock_items + sticker_items,
            "stock_items": stock_items,
            "sticker_items": sticker_items,
        }

    finally:
        db.close()

@router.delete(
    "/delete-sku-master"
)
def delete_sku_master(db: Session = Depends(get_db)):

    upload_folder = UPLOAD_FOLDER

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
