from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    String,
    UniqueConstraint
)

from app.database.database import Base


class SalesUpload(Base):

    __tablename__ = "sales_upload"
    __table_args__ = (
        UniqueConstraint(
            "platform",
            "file_hash",
            name="uq_sales_upload_platform_file_hash"
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    platform = Column(
        String,
        index=True
    )

    file_name = Column(String)

    file_hash = Column(
        String,
        index=True
    )

    report_date = Column(
        Date,
        index=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )
