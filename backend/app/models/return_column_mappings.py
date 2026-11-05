from sqlalchemy import Column, Integer, String
from app.database.database import Base

class ReturnColumnMapping(Base):
    __tablename__ = "return_column_mappings"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, index=True, unique=True)
    date_col = Column(String)
    status_col = Column(String, nullable=True)
    status_val = Column(String, nullable=True)
    order_id_col = Column(String)
    sku_col = Column(String)
    qty_col = Column(String, nullable=True)
    return_type_col = Column(String, nullable=True)
    return_reason_col = Column(String, nullable=True)
    amount_col = Column(String, nullable=True)
