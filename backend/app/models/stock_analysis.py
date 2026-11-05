from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database.database import Base

class StockAnalysis(Base):
    __tablename__ = 'stock_analysis'

    id = Column(Integer, primary_key=True, index=True)
    style = Column(String, index=True)
    color = Column(String)
    size = Column(String)
    qty = Column(Integer)
    created_at = Column(DateTime, server_default=func.now(), index=True)

