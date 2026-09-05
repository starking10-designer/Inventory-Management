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

from app.models.flipkart_zone_report import (
    FlipkartZoneBatch,
    FlipkartZoneBatchItem,
    FlipkartZoneReport,
)

from app.models.system_auth import (
    AdminUser,
    BrandProfile,
    SystemConfig,
    ActivationOTP,
)

from app.models.marketplace_column_mappings import (
    MarketplaceColumnMapping
)

# =========================
# IMPORT ROUTES
# =========================

from app.routes.upload_routes import (
    router as upload_router
)

from app.routes.auth_routes import (
    router as auth_router
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

seed_marketplace_column_mappings()

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
        "X-Flipkart-Zone-Summary",
    ],
)

# =========================
# INCLUDE ROUTERS
# =========================

from app.routes.system_routes import router as system_router

app.include_router(upload_router)
app.include_router(auth_router)
app.include_router(system_router)

# =========================
# ROOT API
# =========================

@app.get("/")
def root():
    return {
        "message":
        "Inventory Management API Running"
    }
