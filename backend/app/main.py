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

# =========================
# IMPORT ROUTES
# =========================

from app.routes.upload_routes import (
    router as upload_router
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

app.include_router(upload_router)

# =========================
# ROOT API
# =========================

@app.get("/")
def root():

    return {
        "message":
        "Inventory Management API Running"
    }
