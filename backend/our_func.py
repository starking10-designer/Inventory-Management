def _save_flipkart_zone_report(
    report_date,
    zone_counts,
    label_count=None,
    source_filename=None,
    platform="Flipkart",
):
    db: Session = SessionLocal()
    try:
        if source_filename:
            db.query(ZoneSummaryReport).filter(
                ZoneSummaryReport.report_date == report_date,
                ZoneSummaryReport.source_filename == source_filename,
                ZoneSummaryReport.platform == platform
            ).delete()
            db.flush()

        for zone, count in sorted(zone_counts.items()):
            db.add(ZoneSummaryReport(
                platform=platform,
                report_date=report_date,
                zone=zone,
                label_count=int(count or 0),
                source_filename=source_filename
            ))

        db.commit()
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

