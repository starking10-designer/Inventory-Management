"""Exercise the preview handler without opening the application's database."""
import ast
import asyncio
import copy
from pathlib import Path
import unittest


class PreviewOrderDeletionTests(unittest.TestCase):
    def preview(self, deleted_ids=None, manual_orders=None):
        source = Path(__file__).parents[1] / "app/routes/upload_routes.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        handler = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "preview_final_report")
        handler.decorator_list = []
        handler.returns = None
        for argument in handler.args.args:
            argument.annotation = None
        handler.args.defaults = [ast.Constant(None) for _ in handler.args.args]
        isolated = ast.fix_missing_locations(ast.Module(body=[handler], type_ignores=[]))
        platforms = {
            "Amazon": [{"order_id": "A1", "quantity": 2}, {"order_id": "A2", "quantity": 3}],
            "Ajio": [{"order_id": "J1", "quantity": 4}],
        }
        def collect(*args):
            orders = copy.deepcopy(platforms)
            return [row for rows in orders.values() for row in rows], orders

        namespace = {
            "_collect_marketplace_orders": collect,
            "aggregate_orders": lambda rows: rows,
            "expand_inventory": lambda rows, db: rows,
            "generate_daily_report": lambda rows, db: [{"total_order_qty": sum(row["quantity"] for row in rows)}],
        }
        exec(compile(isolated, str(source), "exec"), namespace)
        return asyncio.run(namespace["preview_final_report"](deleted_row_ids=deleted_ids, manual_orders=manual_orders))

    def test_selected_order_removed_from_details_and_totals(self):
        result = self.preview('["Amazon_0"]')
        self.assertEqual([row["row_id"] for row in result["raw_orders"]], ["Amazon_1", "Ajio_0"])
        self.assertEqual(result["report"][0]["total_order_qty"], 7)
        self.assertEqual(result["summary"][0], {"platform": "Amazon", "total_orders": 1, "piece_qty": 3})

    def test_repeated_deletion_preserves_original_row_ids(self):
        result = self.preview('["Amazon_0", "Amazon_1", "manual_0"]', '[{"platform":"Amazon","order_id":"M1","quantity":5}]')
        self.assertEqual([row["order_id"] for row in result["raw_orders"]], ["J1"])
        self.assertEqual(result["report"][0]["total_order_qty"], 4)

    def test_delete_all_leaves_empty_details_and_zero_totals(self):
        result = self.preview('["Amazon_0", "Amazon_1", "Ajio_0"]')
        self.assertEqual(result["raw_orders"], [])
        self.assertEqual(result["report"][0]["total_order_qty"], 0)
        self.assertTrue(all(row["total_orders"] == 0 for row in result["summary"]))


if __name__ == "__main__":
    unittest.main()
