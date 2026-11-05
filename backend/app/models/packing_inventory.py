from sqlalchemy import (
    Column,
    Integer,
    String,
    UniqueConstraint,
    Date
)
from datetime import date

from app.database.database import Base


class PackingInventory(Base):

    __tablename__ = "packing_inventory"

    __table_args__ = (
        UniqueConstraint(
            "item_type",
            "platform",
            "name",
            name="uq_packing_inventory_type_platform_name",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    item_type = Column(
        String,
        index=True,
    )

    platform = Column(
        String,
        index=True,
        nullable=True,
    )

    name = Column(
        String,
        index=True,
    )

    qty = Column(
        Integer,
        default=0,
    )


class PackingInventoryAnalysis(Base):
    __tablename__ = "packing_inventory_analysis"

    __table_args__ = (
        UniqueConstraint(
            "date", "item_type", "platform", "name",
            name="uq_packing_analysis_date_type_platform_name"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, default=date.today, index=True)
    item_type = Column(String, index=True)
    platform = Column(String, index=True, nullable=True)
    name = Column(String, index=True)
    qty = Column(Integer, default=0)
