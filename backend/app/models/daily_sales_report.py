from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    String
)

from datetime import datetime

from app.database.database import Base


class DailySalesReport(Base):

    __tablename__ = "daily_sales_report"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    report_date = Column(
        Date,
        index=True
    )

    platform = Column(
        String,
        index=True
    )

    total_orders = Column(
        Integer,
        default=0
    )

    total_piece_qty = Column(
        Integer,
        default=0
    )

    total_invoice_amount = Column(
        Float,
        default=0
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )
