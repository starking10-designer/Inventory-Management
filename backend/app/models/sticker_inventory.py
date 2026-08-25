from sqlalchemy import (
    Column,
    Integer,
    String,
    UniqueConstraint,
)

from app.database.database import Base


class StickerInventory(Base):

    __tablename__ = "sticker_inventory"

    __table_args__ = (
        UniqueConstraint(
            "style",
            "color",
            name="uq_sticker_inventory_style_color",
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

    qty = Column(
        Integer,
        default=0,
    )
