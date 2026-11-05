from sqlalchemy import Column, Integer, String, Float
from app.database.database import Base

class MissingReturnPiece(Base):
    __tablename__ = "missing_return_pieces"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, index=True)
    return_date = Column(String)
    status = Column(String)
    order_id = Column(String, index=True)
    sku = Column(String, index=True)
    qty = Column(Integer, default=1)
    return_type = Column(String, nullable=True)
    return_reason = Column(String, nullable=True)
    amount = Column(Float, nullable=True)
    
    style = Column(String, nullable=True)
    color = Column(String, nullable=True)
    size = Column(String, nullable=True)
    pack_of = Column(String, nullable=True)
