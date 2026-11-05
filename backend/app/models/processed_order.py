from sqlalchemy import Column, Integer, String, Date, DateTime
from datetime import datetime
from app.database.database import Base

class ProcessedOrder(Base):
    __tablename__ = "processed_orders"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, index=True)
    order_id = Column(String, index=True)
    sku = Column(String, index=True)
    quantity = Column(Integer, default=0)
    report_date = Column(Date, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
