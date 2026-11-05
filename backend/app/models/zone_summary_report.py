from datetime import datetime
from sqlalchemy import Column, Date, DateTime, Integer, String, UniqueConstraint
from app.database.database import Base

class ZoneSummaryReport(Base):
    __tablename__ = 'zone_summary_report'

    __table_args__ = (
        UniqueConstraint(
            'report_date',
            'platform',
            'zone',
            'source_filename',
            name='uq_zone_summary_date_platform_zone_file',
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, index=True, default='Flipkart')
    report_date = Column(Date, index=True)
    zone = Column(String, index=True)
    label_count = Column(Integer, default=0)
    source_filename = Column(String, nullable=True, default='')
    created_at = Column(DateTime, default=datetime.utcnow)

