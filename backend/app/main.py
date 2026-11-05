from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.database import (
    Base,
    engine
)

# =========================
# IMPORT MODELS
# =========================

from app.models.sku_master import (
    SKUMaster,
    SKUPiece
)

from app.models.return_inventory import (
    ReturnInventory
)

from app.models.stock_inventory import (
    StockInventory
)

from app.models.sticker_inventory import (
    StickerInventory
)

from app.models.packing_inventory import (
    PackingInventory
)

from app.models.daily_report import (
    DailyReport
)

from app.models.daily_sales_report import (
    DailySalesReport
)

from app.models.sales_upload import (
    SalesUpload
)

from app.models.inventory_deduction_log import (
    InventoryDeductionLog
)

from app.models.sales_analytics_detail import (
    SalesAnalyticsDetail
)

from app.models.zone_summary_report import ZoneSummaryReport

from app.models.system_auth import (
    AdminUser,
    BrandProfile,
    SystemConfig,
    ActivationOTP,
)

from app.models.marketplace_column_mappings import (
    MarketplaceColumnMapping
)

from app.models.return_column_mappings import (
    ReturnColumnMapping
)

from app.models.missing_return_piece import MissingReturnPiece
from app.models.damaged_return_piece import DamagedReturnPiece
from app.models.stock_analysis import StockAnalysis
from app.models.sticker_analysis import StickerAnalysis

# =========================
# IMPORT ROUTES
# =========================

from app.routes.upload_routes import (
    router as upload_router
)

from app.routes.auth_routes import (
    router as auth_router
)

from app.routes.analytics_routes import (
    router as analytics_router
)

# =========================
# CREATE TABLES
# =========================

Base.metadata.create_all(bind=engine)


def ensure_column(table_name: str, column_name: str, column_type: str):
    with engine.connect() as connection:
        existing_columns = [
            row[1]
            for row in connection.exec_driver_sql(
                f"PRAGMA table_info({table_name})"
            ).fetchall()
        ]
        if column_name not in existing_columns:
            connection.exec_driver_sql(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
            )
            connection.commit()


ensure_column("sku_master", "main_product_type", "VARCHAR")
ensure_column("sales_analytics_detail", "main_product_type", "VARCHAR")

from sqlalchemy.orm import Session
from app.database.database import SessionLocal

def seed_marketplace_column_mappings():
    db: Session = SessionLocal()
    try:
        if db.query(MarketplaceColumnMapping).count() == 0:
            seed_data = [
                {"purpose": "order_id", "flipkart": "orderid", "amazon": "amazon-order-id", "ajio": "custorderno", "meesho": "suborderno", "myntra": "orderid", "flipkart_warehouse": "itemid"},
                {"purpose": "sku", "flipkart": "sku", "amazon": "sku", "ajio": "sellersku", "meesho": "sku", "myntra": "seller_sku_code", "flipkart_warehouse": "sku"},
                {"purpose": "price", "flipkart": "invoiceamount", "amazon": "item-price", "ajio": "sellingprice", "meesho": "supplierdiscountedprice(inclgstandcommision)", "myntra": "sellingvalue", "flipkart_warehouse": "listingprice"},
                {"purpose": "quantity", "flipkart": "quantity", "amazon": "quantity", "ajio": "orderqty", "meesho": "quantity", "myntra": "quantity", "flipkart_warehouse": "quantity"},
                {"purpose": "status_1", "flipkart": "orderstate", "amazon": "order-status", "ajio": "status", "meesho": "reasonforcreditentry", "myntra": None, "flipkart_warehouse": "orderstatus"},
                {"purpose": "status_2", "flipkart": "dispatchbydate", "amazon": None, "ajio": "custinvoiceno", "meesho": None, "myntra": None, "flipkart_warehouse": None},
                {"purpose": "status_3", "flipkart": None, "amazon": None, "ajio": "custinvoicedate", "meesho": None, "myntra": None, "flipkart_warehouse": None},
                {"purpose": "size", "flipkart": None, "amazon": None, "ajio": None, "meesho": "size", "myntra": None, "flipkart_warehouse": None},
                {"purpose": "date", "flipkart": None, "amazon": None, "ajio": None, "meesho": None, "myntra": None, "flipkart_warehouse": "orderdate"},
            ]
            for data in seed_data:
                db.add(MarketplaceColumnMapping(**data))
            db.commit()
    except Exception as e:
        print(f"Error seeding marketplace column mappings: {e}")
    finally:
        db.close()

def seed_return_column_mappings():
    db: Session = SessionLocal()
    try:
        if db.query(ReturnColumnMapping).count() == 0:
            seed_data = [
                {"platform": "Flipkart", "date_col": None, "status_col": None, "status_val": None, "order_id_col": "Order ID", "sku_col": "SKU", "qty_col": "Quantity", "return_type_col": "Return Type", "return_reason_col": "Return Reason", "amount_col": "Total Price"},
                {"platform": "Amazon", "date_col": "Return delivery date", "status_col": "Return request status", "status_val": "approved", "order_id_col": "Order ID", "sku_col": "Merchant SKU", "qty_col": "Order quantity", "return_type_col": "Return type", "return_reason_col": "Return reason", "amount_col": "Refunded Amount"},
                {"platform": "Ajio", "date_col": "Return Delivered Date", "status_col": "Return Status", "status_val": "RETURN_DELIVERED", "order_id_col": "Cust Order No", "sku_col": "SELLER SKU", "qty_col": "Return QTY", "return_type_col": None, "return_reason_col": "Cust Return Reason", "amount_col": "Return Value"},
                {"platform": "Meesho", "date_col": "Delivered Date", "status_col": None, "status_val": None, "order_id_col": "Order Number", "sku_col": "SKU", "qty_col": "Qty", "return_type_col": "Type of Return", "return_reason_col": "Return Reason", "amount_col": None},
                {"platform": "Myntra", "date_col": "order_rto_date", "status_col": None, "status_val": None, "order_id_col": "order_id", "sku_col": "seller_sku_code", "qty_col": "quantity", "return_type_col": None, "return_reason_col": "return_reason", "amount_col": None},
            ]
            for data in seed_data:
                db.add(ReturnColumnMapping(**data))
            db.commit()
    except Exception as e:
        print(f"Error seeding return column mappings: {e}")
    finally:
        db.close()

seed_marketplace_column_mappings()
seed_return_column_mappings()

# =========================
# FASTAPI APP
# =========================

app = FastAPI(
    title="Inventory Management API",
    version="1.0.0"
)

app.add_middleware(

    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

    expose_headers=[
        "Content-Disposition",
        "X-Flipkart-Zone-Summary",
    ],
)

# =========================
# INCLUDE ROUTERS
# =========================

from app.routes.system_routes import router as system_router
from app.routes.return_routes import router as return_router

app.include_router(upload_router)
app.include_router(return_router)
app.include_router(auth_router)
app.include_router(system_router)
app.include_router(analytics_router)

# =========================
# ROOT API
# =========================

@app.get("/")
def root():
    return {
        "message":
        "Inventory Management API Running"
    }
