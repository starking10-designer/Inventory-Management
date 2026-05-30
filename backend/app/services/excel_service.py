import pandas as pd
from datetime import datetime, timedelta
import re

from app.models.sku_master import SKUMaster
from app.models.return_inventory import ReturnInventory


# =========================
# COMMON HELPERS
# =========================

def normalize_column_name(column_name):

    return (
        str(column_name)
        .strip()
        .lower()
        .replace(" ", "")
    )


def normalize_sku(sku):

    return (
        str(sku)
        .strip()
        .upper()
        .replace("-", "_")
    )


def clean_color_name(color_name):

    color_name = str(color_name).strip()

    color_name = re.sub(r"^\d+\s*", "", color_name)

    return color_name.strip()


def parse_money(value):

    if value is None or pd.isna(value):
        return 0

    cleaned = re.sub(
        r"[^0-9.\-]",
        "",
        str(value)
    )

    if cleaned in ("", "-", ".", "-."):
        return 0

    try:
        return float(cleaned)
    except ValueError:
        return 0


def enrich_order_rows(df, order_id_col, price_col, meesho_fee=0):

    orders = df.copy()
    order_values = (
        orders[order_id_col]
        if order_id_col in orders.columns
        else ""
    )
    price_values = (
        orders[price_col]
        if price_col in orders.columns
        else 0
    )

    orders["order_id"] = (
        pd.Series(order_values, index=orders.index)
        .astype(str)
        .str.strip()
    )

    orders["price"] = (
        pd.Series(price_values, index=orders.index)
        .apply(parse_money)
        + meesho_fee
    )

    return orders


# =========================
# FILE READERS
# =========================

def read_excel_file(file_path):

    excel_file = pd.ExcelFile(file_path)

    return excel_file.sheet_names


def read_sheet_columns(file_path, sheet_name):

    df = pd.read_excel(file_path, sheet_name=sheet_name)

    columns = df.columns.tolist()

    sample_data = df.head(5).fillna("").to_dict(
        orient="records"
    )

    return {
        "columns": columns,
        "sample_data": sample_data
    }


def read_csv_columns(file_path):

    df = pd.read_csv(file_path)

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    return {
        "columns": df.columns.tolist(),
        "sample_data": df.head(5)
        .fillna("")
        .to_dict(orient="records")
    }


def read_sku_sheet(file_path, sheet_name):

    df = pd.read_excel(file_path, sheet_name=sheet_name)

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    return df


# =========================
# PLATFORM FILTERS
# =========================

def filter_flipkart_orders(file_path):

    df = pd.read_csv(file_path)

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    current_hour = datetime.now().hour

    if current_hour < 12:
        target_date = datetime.now()

    else:
        target_date = datetime.now() + timedelta(days=1)

    target_date = target_date.strftime("%Y-%m-%d")

    df["dispatchbydate"] = pd.to_datetime(
        df["dispatchbydate"],
        errors="coerce"
    ).dt.strftime("%Y-%m-%d")

    valid_states = [
        "Approved",
        "Packed",
        "Ready To Ship",
        "Unpacked"
    ]

    filtered_df = df[
        (df["dispatchbydate"] == target_date)
        &
        (df["orderstate"].isin(valid_states))
    ]

    enriched_df = enrich_order_rows(
        filtered_df,
        "orderid",
        "invoiceamount"
    )

    return enriched_df[
        ["sku", "quantity", "order_id", "price"]
    ].fillna("").to_dict(orient="records")


def filter_amazon_orders(file_path):

    df = pd.read_csv(file_path, sep="\t")

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    filtered_df = df[
        df["order-status"]
        .astype(str)
        .str.lower() == "pending"
    ]

    enriched_df = enrich_order_rows(
        filtered_df,
        "amazon-order-id",
        "item-price"
    )

    return enriched_df[
        ["sku", "quantity", "order_id", "price"]
    ].fillna("").to_dict(orient="records")


def filter_ajio_orders(file_path):

    df = pd.read_excel(file_path)

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    filtered_df = df[
        df["status"]
        .astype(str)
        .str.lower() == "new"
    ]

    enriched_df = enrich_order_rows(
        filtered_df,
        "custorderno",
        "sellingprice"
    )

    return enriched_df[
        ["sellersku", "orderqty", "order_id", "price"]
    ].rename(
        columns={
            "sellersku": "sku",
            "orderqty": "quantity"
        }
    ).fillna("").to_dict(
        orient="records"
    )


def filter_meesho_orders(file_path):

    df = pd.read_csv(file_path)

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    filtered_df = df[
        (
            df["reasonforcreditentry"]
            .astype(str)
            .str.upper() == "PENDING"
        )
    ].copy()

    filtered_df["sku"] = (
        filtered_df["sku"]
        .astype(str)
        .str.strip()
        +
        "_"
        +
        filtered_df["size"]
        .astype(str)
        .str.strip()
    )

    enriched_df = enrich_order_rows(
        filtered_df,
        "suborderno",
        "supplierdiscountedprice(inclgstandcommission)",
        meesho_fee=55
    )

    return enriched_df[
        ["sku", "quantity", "order_id", "price"]
    ].fillna("").to_dict(
        orient="records"
    )

def filter_myntra_orders(file_path):

    if file_path.endswith(".csv"):

        df = pd.read_csv(file_path)

    else:

        df = pd.read_excel(
            file_path,
            engine="openpyxl"
        )

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    orders = []

    for _, row in df.iterrows():

        sku = str(
            row.get("sellerskucode", "")
        ).strip()

        qty = 1

        if sku and qty > 0:

            orders.append({
                "sku": sku,
                "quantity": qty,
                "order_id": str(
                    row.get("orderid", "")
                ).strip(),
                "price": parse_money(
                    row.get("sellingvalue", 0)
                )
            })

    return orders


# =========================
# ORDER AGGREGATION
# =========================

def aggregate_orders(order_list):

    if not order_list:
        return []

    df = pd.DataFrame(order_list)

    aggregated_df = (
        df.groupby("sku", as_index=False)["quantity"]
        .sum()
    )

    return aggregated_df.rename(
        columns={
            "quantity": "total_qty"
        }
    ).to_dict(orient="records")


# =========================
# INVENTORY EXPANSION
# =========================

def expand_inventory(aggregated_orders, db):

    final_inventory = {}

    sku_master_list = db.query(
        SKUMaster
    ).all()

    for order in aggregated_orders:


        sku_code = normalize_sku(
            order["sku"]
        )

        order_qty = int(
            order["total_qty"]
        )

        sku_master = None

        for item in sku_master_list:

            db_sku = normalize_sku(
                item.sku
            )

            if db_sku == sku_code:

                sku_master = item
 

                break

        if not sku_master:
            continue

        for piece in sku_master.pieces:

            if (
                not piece.color
                or
                not piece.qty
            ):
                continue

            clean_color = clean_color_name(
                piece.color

            )

            final_piece_qty = (
                int(piece.qty)
                * order_qty
            )

            inventory_key = (

                sku_master.style,

                clean_color,

                sku_master.size
            )

            if inventory_key not in final_inventory:

                final_inventory[
                    inventory_key
                ] = 0

            final_inventory[
                inventory_key
            ] += final_piece_qty

    result = []

    for key, qty in final_inventory.items():

        style, color, size = key

        result.append({

            "style": style,

            "color": color,

            "size": size,

            "qty": qty
        })

    return result

# =========================
# RETURNS PROCESSING
# =========================

def merge_return_inventory_rows(db):
    rows = db.query(ReturnInventory).order_by(
        ReturnInventory.id.asc()
    ).all()
    rows_by_key = {}
    merged_rows = 0

    for row in rows:
        key = (
            row.style,
            row.color,
            row.size,
        )

        if key not in rows_by_key:
            rows_by_key[key] = row
            continue

        kept_row = rows_by_key[key]
        kept_row.qty = int(kept_row.qty or 0) + int(row.qty or 0)
        db.delete(row)
        merged_rows += 1

    if merged_rows:
        db.flush()

    return merged_rows


def process_returns(return_orders, db):

    merge_return_inventory_rows(db)

    sku_master_list = db.query(SKUMaster).all()

    updated_items = 0

    for row in return_orders:

        sku_code = normalize_sku(row["sku"])

        try:
            order_qty = int(row["quantity"])
        except (TypeError, ValueError):
            continue

        if order_qty <= 0:
            continue

        sku_master = None

        for item in sku_master_list:

            db_sku = normalize_sku(item.sku)

            if db_sku == sku_code:
                sku_master = item
                break

        if not sku_master:
            continue

        for piece in sku_master.pieces:

            if not piece.qty:
                continue

            clean_piece_color = clean_color_name(piece.color)

            if (
                not clean_piece_color
                or clean_piece_color == "nan"
                or clean_piece_color == "-"
            ):
                continue

            final_qty = order_qty * int(piece.qty)

            existing_inventory = db.query(
                ReturnInventory
            ).filter(
                ReturnInventory.style == sku_master.style,
                ReturnInventory.color == clean_piece_color,
                ReturnInventory.size == sku_master.size
            ).first()

            if existing_inventory:

                existing_inventory.qty += final_qty

            else:

                new_inventory = ReturnInventory(
                    style=sku_master.style,
                    color=clean_piece_color,
                    size=sku_master.size,
                    qty=final_qty
                )

                db.add(new_inventory)

            updated_items += 1

    db.commit()

    return {
        "message": "Returns updated successfully",
        "updated_items": updated_items
    }


# =========================
# DAILY REPORT COLOR (LSDS / SN styles)
# =========================

_NUMBERED_COLORS = {
    "black": "1 black",
    "white": "2 white",
    "grey": "3 grey",
    "gray": "3 grey",
    "sandal": "4 sandal",
    "navy": "5 navy",
    "pink": "6 pink",
    "brown": "7 brown",
    "olive": "8 olive",
    "cream": "9 cream",
    "grey melange": "10 grey melange",
    "gray melange": "10 grey melange",
    "charcoal melange": "11 charcoal melange",
    "dark grey": "12 dark grey",
    "dark gray": "12 dark grey",
}


def _style_uses_numbered_colors(style):

    if not style:
        return False

    upper = str(style).upper()

    if "LSDS" in upper:
        return True

    # SN450, SN451, SN452, SN 450, etc.
    if re.search(r"SN\s*\d", upper):
        return True

    return False


def format_daily_report_color(style, color):

    if color is None or str(color).strip() == "":
        return color

    if not _style_uses_numbered_colors(style):
        return color

    normalized = " ".join(
        str(color).strip().lower().split()
    )

    return _NUMBERED_COLORS.get(normalized, color)


# =========================
# DAILY REPORT
# =========================

def generate_daily_report(expanded_inventory, db):

    final_report = []

    for item in expanded_inventory:

        style = item["style"]
        color = item["color"]
        size = item["size"]

        total_order_qty = item["qty"]

        return_inventory = db.query(
            ReturnInventory
        ).filter(
            ReturnInventory.style == style,
            ReturnInventory.color == color,
            ReturnInventory.size == size
        ).first()

        available_return_qty = 0

        if return_inventory:
            available_return_qty = return_inventory.qty

        used_return_qty = min(
            total_order_qty,
            available_return_qty
        )

        need_from_stock = (
            total_order_qty - used_return_qty
        )

        display_color = format_daily_report_color(style, color)

        final_report.append({
            "style": style,
            "color": display_color,
            "size": size,
            "total_order_qty": total_order_qty,
            "used_return_qty": used_return_qty,
            "need_from_stock": need_from_stock,
            "return_inventory": used_return_qty,
            "stock_inventory": need_from_stock,
        })

    return final_report


def deduct_return_inventory(expanded_inventory, db):

    merge_return_inventory_rows(db)

    lines_updated = 0
    total_qty_deducted = 0
    deductions = []

    for item in expanded_inventory:

        style = item["style"]
        color = item["color"]
        size = item["size"]

        try:
            order_qty = int(item["qty"])
        except (TypeError, ValueError):
            continue

        if order_qty <= 0:
            continue

        return_row = db.query(ReturnInventory).filter(
            ReturnInventory.style == style,
            ReturnInventory.color == color,
            ReturnInventory.size == size,
        ).first()

        if not return_row or return_row.qty <= 0:
            continue

        used_qty = min(order_qty, return_row.qty)

        if used_qty <= 0:
            continue

        return_row.qty -= used_qty
        lines_updated += 1
        total_qty_deducted += used_qty

        deductions.append({
            "style": style,
            "color": color,
            "size": size,
            "deducted_qty": used_qty,
            "remaining_qty": return_row.qty,
        })

    db.commit()

    return {
        "message": "Return inventory deducted after final report generation",
        "lines_updated": lines_updated,
        "total_qty_deducted": total_qty_deducted,
        "deductions": deductions,
    }


def read_return_orders_csv(file_path):
    """
    Read a returns CSV with normalized headers.
    Maps common marketplace column names to sku + quantity.
    """

    df = pd.read_csv(file_path)

    df.columns = [
        normalize_column_name(col)
        for col in df.columns
    ]

    sku_candidates = [
        "sku",
        "sellersku",
        "merchantsku",
        "fsnsku",
        "productsku",
        "productid",
    ]

    qty_candidates = [
        "quantity",
        "qty",
        "returnqty",
        "returnquantity",
        "units",
        "orderqty",
        "returnedqty",
    ]

    sku_col = next(
        (c for c in sku_candidates if c in df.columns),
        None
    )

    qty_col = next(
        (c for c in qty_candidates if c in df.columns),
        None
    )

    if not sku_col or not qty_col:
        raise ValueError(
            "Returns file must include recognizable SKU and quantity "
            f"columns. Found columns: {list(df.columns)}"
        )

    orders = []

    for _, row in df.iterrows():

        sku = str(row.get(sku_col, "")).strip()

        if not sku or sku.lower() == "nan":
            continue

        try:
            qty = int(float(row.get(qty_col, 0)))
        except (TypeError, ValueError):
            qty = 0

        if qty <= 0:
            continue

        orders.append({
            "sku": sku,
            "quantity": qty
        })

    return orders


def read_flipkart_return_file(file_path):

    return read_return_orders_csv(file_path)
