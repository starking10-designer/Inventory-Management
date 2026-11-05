"""Dated style quantities from the same sources used by sales pivot totals."""
from collections import defaultdict


def build_style_daily(report_rows, detail_rows):
    totals = defaultdict(int)
    for row in report_rows:
        qty = int(row.total_order_qty or 0)
        if row.report_date and qty > 0:
            style = str(row.style or "Unknown").strip() or "Unknown"
            totals[(str(row.report_date), style)] += qty

    # Marketplace detail rows duplicate DailyReport pieces. Only warehouse
    # details supplement that source, matching the existing style-wise totals.
    for row in detail_rows:
        qty = int(row.piece_qty or 0)
        if row.platform == "Flipkart Warehouse" and row.report_date and qty > 0:
            style = str(row.style or "Unknown").strip() or "Unknown"
            totals[(str(row.report_date), style)] += qty

    return [
        {"date": report_date, "style": style, "qty": qty}
        for (report_date, style), qty in sorted(totals.items())
    ]
