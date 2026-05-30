from sqlalchemy import (
    Column,
    Integer,
    String,
    UniqueConstraint,
)

from app.database.database import Base


class StockInventory(Base):

    __tablename__ = "stock_inventory"

    __table_args__ = (
        UniqueConstraint(
            "style",
            "color",
            "size",
            name="uq_stock_inventory_style_color_size",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
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
    )

    qty = Column(
        Integer,
        default=0,
    )
