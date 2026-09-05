from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database.database import Base

class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    display_name = Column(String, default="Admin")
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    mobile_number = Column(String, nullable=True)

class BrandProfile(Base):
    __tablename__ = "brand_profiles"

    id = Column(Integer, primary_key=True, index=True)
    brand_name = Column(String)
    gst_number = Column(String, nullable=True)
    address = Column(String, nullable=True)
    app_icon = Column(String, nullable=True)  # Store base64 or path

class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    is_registered = Column(Boolean, default=False)
    registration_date = Column(DateTime, nullable=True)

class ActivationOTP(Base):
    __tablename__ = "activation_otp"

    id = Column(Integer, primary_key=True, index=True)
    otp_key = Column(String, index=True)
    expires_at = Column(DateTime)
