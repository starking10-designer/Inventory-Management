from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    String,
    UniqueConstraint,
)

from app.database.database import Base


class FlipkartZoneReport(Base):

    __tablename__ = "flipkart_zone_report"

    __table_args__ = (
        UniqueConstraint(
            "report_date",
            "zone",
            name="uq_flipkart_zone_report_date_zone",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    report_date = Column(
        Date,
        index=True,
    )

    zone = Column(
        String,
        index=True,
    )

    label_count = Column(
        Integer,
        default=0,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )


class FlipkartZoneBatch(Base):

    __tablename__ = "flipkart_zone_batch"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    report_date = Column(
        Date,
        index=True,
    )

    source_filename = Column(
        String,
        nullable=True,
    )

    platform = Column(
        String,
        default="Flipkart",
    )

    label_count = Column(
        Integer,
        default=0,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )


class FlipkartZoneBatchItem(Base):

    __tablename__ = "flipkart_zone_batch_item"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    batch_id = Column(
        Integer,
        index=True,
    )

    report_date = Column(
        Date,
        index=True,
    )

    zone = Column(
        String,
        index=True,
    )

    platform = Column(
        String,
        default="Flipkart",
    )

    label_count = Column(
        Integer,
        default=0,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )
