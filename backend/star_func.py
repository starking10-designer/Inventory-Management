def _save_zone_summary_report(
    report_date,
    zone_counts,
    label_count=None,
    source_filename=None,
    platform="Flipkart",
):
    db = SessionLocal()
    try:
        total_labels = sum(int(val or 0) for val in zone_counts.values())
        if total_labels == 0 and label_count is not None:
            # If we don't have zone breakdown, put everything under 'UNKNOWN'
            zone_counts = {'UNKNOWN': int(label_count)}
            
        for zone, count in zone_counts.items():
            count = int(count or 0)
            if count == 0: continue
            
            existing = db.query(ZoneSummaryReport).filter(
                ZoneSummaryReport.report_date == report_date,
                ZoneSummaryReport.platform == platform,
                ZoneSummaryReport.zone == zone
            ).first()
            
            if existing:
                existing.label_count += count
            else:
                db.add(ZoneSummaryReport(
                    report_date=report_date,
                    platform=platform,
                    zone=zone,
                    label_count=count
                ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error saving zone summary report: {e}")
    finally:
        db.close()

def _save_zone_summary_report(
    report_date,
    zone_counts,
    label_count=None,
    source_filename=None,
    platform="Flipkart",
):
    db: Session = SessionLocal()
    sf = source_filename or ""

    try:
        # If same file is re-uploaded for same platform+date, delete existing rows for it
        if sf:
            db.query(ZoneSummaryReport).filter(
                ZoneSummaryReport.report_date == report_date,
                ZoneSummaryReport.platform == platform,
                ZoneSummaryReport.source_filename == sf,
            ).delete()

        for zone, count in sorted(zone_counts.items()):
            db.add(ZoneSummaryReport(
                report_date=report_date,
                platform=platform,
                zone=zone,
                label_count=int(count or 0),
                source_filename=sf,
            ))

        db.commit()

    except Exception as e:
        db.rollback()
        print(f"Error saving zone summary report: {e}")
    finally:
        db.close()


