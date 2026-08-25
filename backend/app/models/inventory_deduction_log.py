from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    String,
)

from app.database.database import Base


class InventoryDeductionLog(Base):

    __tablename__ = "inventory_deduction_log"

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

    inventory_type = Column(
        String,
        index=True,
    )

    style = Column(
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
        nullable=True,
    )

    qty = Column(
        Integer,
        default=0,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )
