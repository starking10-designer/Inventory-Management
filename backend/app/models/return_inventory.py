from sqlalchemy import (
    Column,
    Integer,
    String
)

from app.database.database import Base


class ReturnInventory(Base):

    __tablename__ = "return_inventory"

    id = Column(
        Integer,
        primary_key=True,
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

    qty = Column(
        Integer,
        default=0
    )