from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey
)

from sqlalchemy.orm import relationship

from app.database.database import Base


# =====================================
# SKU MASTER
# =====================================

class SKUMaster(Base):

    __tablename__ = "sku_master"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    platform = Column(String)

    sku = Column(
        String,
        unique=True,
        index=True
    )

    style = Column(String)

    size = Column(String)

    pieces = relationship(
        "SKUPiece",
        back_populates="sku_master",
        cascade="all, delete-orphan"
    )


# =====================================
# SKU PIECES
# =====================================

class SKUPiece(Base):

    __tablename__ = "sku_piece"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    sku_master_id = Column(
        Integer,
        ForeignKey("sku_master.id")
    )

    color = Column(String)

    qty = Column(Integer)

    sku_master = relationship(
        "SKUMaster",
        back_populates="pieces"
    )