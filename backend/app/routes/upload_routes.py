from typing import Optional

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

from app.services.excel_service import (
    clean_color_name,
    normalize_column_name,

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


def save_daily_sales_summary(
    db: Session,
    report_date: date,
    platform: str,
    orders,
    mapped_piece_qty: int
):
    unique_order_ids = set()
    fallback_order_count = 0
    total_invoice_amount = 0

    for row in orders:
        total_invoice_amount += _safe_float(
            row.get("price", 0)
        )

        order_id = str(
            row.get("order_id", "")
        ).strip()

        if order_id:
            unique_order_ids.add(order_id)
        else:
            fallback_order_count += 1

    db.query(DailySalesReport).filter(
        DailySalesReport.report_date == report_date,
        DailySalesReport.platform == platform
    ).delete()

    db.add(
        DailySalesReport(
            report_date=report_date,
            platform=platform,
            total_orders=(
                len(unique_order_ids)
                + fallback_order_count
            ),
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


def _count_sales_upload_once(
    db: Session,
    report_date: date,
    platform: str,
    upload_file: UploadFile
):
    file_hash = _saved_upload_sha256(
        upload_file
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
            file_name=getattr(
                upload_file,
                "saved_filename",
                upload_file.filename
            ),
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


def _report_dates_for_view(view_date: date) -> list[date]:
    today = datetime.now().date()
    dispatch_date = get_flipkart_target_date()
    session_dates = {today, dispatch_date}

    dates = {view_date}
    if view_date in session_dates:
        dates.update(session_dates)

    return sorted(dates)


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
                DailyReport.report_date.in_(
                    _report_dates_for_view(report_date)
                ),
            )
            for platform_name in PLATFORM_NAMES
        ]
        return query.filter(or_(*conditions))

    return query.filter(
        DailyReport.platform == platform,
        DailyReport.report_date.in_(
            _report_dates_for_view(report_date)
        ),
    )


def _sales_row_for_platform(
    db: Session,
    platform_name: str,
    view_date: date,
):
    dates = _report_dates_for_view(view_date)
    rows = (
        db.query(DailySalesReport)
        .filter(
            DailySalesReport.platform == platform_name,
            DailySalesReport.report_date.in_(dates),
        )
        .order_by(
            DailySalesReport.report_date.desc()
        )
        .all()
    )

    if not rows:
        return None

    return rows[0]


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
):
    db: Session = SessionLocal()

    try:
        parsed_date = _parse_report_date(report_date)

        query = db.query(DailyReport).filter(
            DailyReport.report_date == parsed_date
        )

        if platform == "All":
            query = query.filter(
                DailyReport.platform != "All"
            )
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
        db.commit()

        return {
            "message": "Daily report deleted successfully",
            "deleted_rows": deleted,
            "deleted_sales_rows": deleted_sales,
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

    new_orders = []

    for platform in counted_platforms:
        new_orders.extend(
            platform_orders.get(platform, [])
        )

    if new_orders:
        deduction_orders = aggregate_orders(
            new_orders
        )
        deduction_inventory = expand_inventory(
            deduction_orders,
            db
        )
        stock_deduction_report = generate_daily_report(
            deduction_inventory,
            db
        )
        deduct_lsds_stock_inventory(
            stock_deduction_report,
            db
        )
        deduct_sticker_inventory(
            stock_deduction_report,
            db
        )
        deduct_return_inventory(
            deduction_inventory,
            db
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
    last_column = get_column_letter(max(total_columns, 2))
    header_end_row = 3 if include_detail_columns else 2
    data_start_row = header_end_row + 1

    ws.title = "Final Report"
    ws.merge_cells(f"A1:{last_column}1")
    ws["A1"] = f"Generated At: {generated_at}"

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

        ws.merge_cells("A2:A3")
        ws.merge_cells("B2:B3")

        for index, _ in enumerate(available_sizes):
            start_col = 3 + (index * columns_per_size)
            end_col = start_col + columns_per_size - 1
            ws.merge_cells(
                f"{get_column_letter(start_col)}2:{get_column_letter(end_col)}2"
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


    ws["A1"].fill = timestamp_fill
    ws["A1"].font = Font(bold=True, color="111827", size=12)
    ws["A1"].alignment = Alignment(
        horizontal="center",
        vertical="center",
    )
    ws.row_dimensions[1].height = 18

    for row in ws.iter_rows(
        min_row=2,
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
