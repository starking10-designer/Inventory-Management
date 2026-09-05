from sqlalchemy import Column, Integer, String
from app.database.database import Base

class MarketplaceColumnMapping(Base):
    __tablename__ = "marketplace_column_mappings"

    id = Column(Integer, primary_key=True, index=True)
    purpose = Column(String, index=True)
    flipkart = Column(String)
    amazon = Column(String)
    ajio = Column(String)
    meesho = Column(String)
    myntra = Column(String)
    flipkart_warehouse = Column(String)
