from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime
)

from datetime import datetime

from app.database.database import Base


class DailyReport(Base):

    __tablename__ = "daily_report"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    report_date = Column(
        Date,
        index=True
    )

    style = Column(
        String,
        index=True
    )

    color = Column(
        String,
        index=True
    )

    size = Column(
        String,
        index=True
    )

    total_order_qty = Column(
        Integer,
        default=0
    )

    platform = Column(
        String,
        index=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )
