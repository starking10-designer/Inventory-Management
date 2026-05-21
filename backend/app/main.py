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

from app.models.daily_report import (
    DailyReport
)

from app.models.sales_upload import (
    SalesUpload
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
        "http://localhost:5173"
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
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
