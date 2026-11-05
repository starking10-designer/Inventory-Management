import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location("product_trend_service", Path(__file__).parents[1] / "app/services/product_trend_service.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ProductTrendTests(unittest.TestCase):
    def test_daily_style_totals_match_marketplace_and_warehouse_sources(self):
        reports = [SimpleNamespace(report_date="2026-10-01", style=" A ", total_order_qty=3), SimpleNamespace(report_date="2026-10-01", style="A", total_order_qty=2), SimpleNamespace(report_date="2026-10-02", style="B", total_order_qty=4)]
        details = [SimpleNamespace(report_date="2026-10-01", style="A", piece_qty=5, platform="Amazon"), SimpleNamespace(report_date="2026-10-01", style="A", piece_qty=7, platform="Flipkart Warehouse")]
        self.assertEqual(module.build_style_daily(reports, details), [{"date":"2026-10-01","style":"A","qty":12}, {"date":"2026-10-02","style":"B","qty":4}])

    def test_missing_dates_and_nonpositive_quantities_are_ignored(self):
        rows = [SimpleNamespace(report_date=None, style="A", total_order_qty=4), SimpleNamespace(report_date="2026-10-01", style="A", total_order_qty=0)]
        self.assertEqual(module.build_style_daily(rows, []), [])

if __name__ == "__main__":
    unittest.main()
