from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    String,
)

from datetime import datetime

from app.database.database import Base


class SalesAnalyticsDetail(Base):

    __tablename__ = "sales_analytics_detail"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    report_date = Column(
        Date,
        index=True,
    )

    platform = Column(
        String,
        index=True,
    )

    order_id = Column(String)

    sku = Column(
        String,
        index=True,
    )

    style = Column(
        String,
        index=True,
    )

    main_product_type = Column(
        String,
        index=True,
    )

    color = Column(
        String,
        index=True,
    )

    size = Column(
        String,
        index=True,
    )

    pack_of = Column(
        String,
        index=True,
    )

    order_qty = Column(
        Integer,
        default=0,
    )

    piece_qty = Column(
        Integer,
        default=0,
    )

    invoice_amount = Column(
        Float,
        default=0,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )
