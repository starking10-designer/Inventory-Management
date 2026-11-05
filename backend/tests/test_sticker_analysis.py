from datetime import datetime
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.sticker_analysis import StickerAnalysis
from app.models.sticker_inventory import StickerInventory
from app.routes.analytics_routes import get_sticker_analysis_data


class StickerAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        StickerAnalysis.__table__.create(self.engine)
        StickerInventory.__table__.create(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_empty_database_returns_empty_analytics(self):
        self.assertEqual(get_sticker_analysis_data(self.db), {
            "updated_on": None, "total_pieces": 0, "top_styles": [],
            "stock_by_date": [], "history": [],
        })

    def test_inventory_total_and_upload_history_use_their_own_models(self):
        self.db.add_all([
            StickerInventory(style="Plain", color="navy", qty=7),
            StickerAnalysis(style="Plain", color="navy", qty=10,
                            created_at=datetime(2026, 10, 20, 10)),
            StickerAnalysis(style="Print", color="black", qty=5,
                            created_at=datetime(2026, 10, 21, 11)),
        ])
        self.db.commit()

        result = get_sticker_analysis_data(self.db)
        self.assertEqual(result["total_pieces"], 7)
        self.assertEqual(result["updated_on"], "2026-10-21T11:00:00")
        self.assertEqual(result["top_styles"], [
            {"style": "Plain", "qty": 10}, {"style": "Print", "qty": 5},
        ])
        self.assertEqual(result["stock_by_date"], [
            {"date": "2026-10-20", "qty": 10},
            {"date": "2026-10-21", "qty": 5},
        ])
        self.assertEqual([row["style"] for row in result["history"]], ["Print", "Plain"])


if __name__ == "__main__":
    unittest.main()
