import importlib.util
import ast
from datetime import date, datetime
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

import pymupdf as fitz
from fastapi import HTTPException
from starlette.responses import FileResponse


spec = importlib.util.spec_from_file_location("label_output", Path(__file__).parents[1] / "app/services/label_output_service.py")
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class LabelOutputTests(unittest.TestCase):
    def load_handler(self, folder, source, calls):
        code = (Path(__file__).parents[1] / "app/routes/upload_routes.py").read_text(encoding="utf-8")
        handler = next(node for node in ast.parse(code).body if isinstance(node, ast.FunctionDef) and node.name == "label_cropper")
        handler.decorator_list = []
        for argument in handler.args.args:
            argument.annotation = None
        handler.args.defaults = [ast.Constant(None) for _ in handler.args.args]
        module = ast.fix_missing_locations(ast.Module(body=[handler], type_ignores=[]))

        def original_processor(*args, **kwargs):
            calls.append("original")
            output = args[2] if len(args) == 3 else args[1]
            self.make_pdf(output, [("B", "one"), ("A", "two"), ("C", "three")])
            return {"missing_pages": [], "report_date": date.today(), "zone_counts": {"A": 3}, "label_count": 3}

        def sorter(*args):
            calls.append("sorted")
            return service.build_flipkart_sku_sorted_pdf(*args)

        namespace = dict(
            os=os, json=json, datetime=datetime, HTTPException=HTTPException, FileResponse=FileResponse,
            UPLOAD_FOLDER=str(folder), _save_upload=lambda upload: str(source),
            _cropped_output_filename=lambda upload: "output.pdf", _meesho_sorted_output_filename=lambda uploads: "output.pdf",
            _build_amazon_label_cropper_pdf=original_processor, _build_flipkart_label_cropper_pdf=original_processor,
            _build_ajio_label_cropper_pdf=original_processor, _build_meesho_label_sorted_pdf=original_processor,
            build_flipkart_sku_sorted_pdf=sorter, label_output_filename=service.label_output_filename,
            _save_zone_summary_report=lambda *args, **kwargs: None, _clean_upload_filename=lambda name: name,
        )
        exec(compile(module, "label_cropper_handler", "exec"), namespace)
        return namespace["label_cropper"]

    def make_pdf(self, path, skus):
        with fitz.open() as doc:
            for sku, marker in skus:
                page = doc.new_page(width=300, height=420)
                page.insert_text((20, 40), "SKU ID")
                page.insert_text((20, 65), f"1 {sku} | XL | 1")
                page.insert_text((20, 360), marker)
            doc.save(path)

    def test_all_platform_names_and_output_count(self):
        for platform in ["Flipkart", "Amazon", "Meesho", "Ajio"]:
            self.assertEqual(service.label_output_filename(platform, 10, date(2026, 10, 21)), f"21-10 - {platform} - 10 orders.pdf")

    def test_alphabetic_sort_is_stable_and_keeps_full_pages(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            source, output = Path(folder) / "in.pdf", Path(folder) / "out.pdf"
            self.make_pdf(source, [("Z99", "last"), ("a2", "first duplicate"), ("A10", "lexical first"), ("a2", "second duplicate")])
            self.assertEqual(service.build_flipkart_sku_sorted_pdf(source, output), 4)
            with fitz.open(output) as doc:
                self.assertEqual([service.extract_flipkart_sku(p, i + 1) for i, p in enumerate(doc)], ["A10", "a2", "a2", "Z99"])
                self.assertIn("first duplicate", doc[1].get_text())
                self.assertIn("second duplicate", doc[2].get_text())
                self.assertTrue(all(p.rect.width == 300 and p.rect.height == 420 for p in doc))
                for page in doc:
                    dx, dy = service.flipkart_ink_translation(page)
                    self.assertLessEqual(abs(dx), 0.5)
                    self.assertLessEqual(abs(dy), 0.5)

    def test_unreadable_sku_does_not_generate_partial_pdf(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            source, output = Path(folder) / "in.pdf", Path(folder) / "out.pdf"
            with fitz.open() as doc:
                doc.new_page().insert_text((20, 40), "Unreadable label")
                doc.save(source)
            with self.assertRaisesRegex(ValueError, "Turn off Sort by SKU"):
                service.build_flipkart_sku_sorted_pdf(source, output)
            self.assertFalse(output.exists())

    def test_alignment_detects_graphics_as_well_as_text(self):
        with fitz.open() as doc:
            page = doc.new_page(width=300, height=420)
            # A barcode-like block extends beyond the text bounds.
            page.insert_text((100, 100), "SKU ID")
            page.draw_rect(fitz.Rect(20, 30, 270, 350), fill=(0, 0, 0))
            dx, dy = service.flipkart_ink_translation(page)
            self.assertAlmostEqual(dx, 5, delta=0.5)
            self.assertAlmostEqual(dy, 20, delta=0.5)

    def test_download_names_for_all_platforms_and_legacy_flipkart_path(self):
        for platform, field in [("Amazon", "amazon_file"), ("Flipkart", "flipkart_file"), ("Ajio", "ajio_label_files"), ("Meesho", "meesho_files")]:
            with self.subTest(platform=platform), tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
                source = Path(folder) / "source.pdf"
                calls = []
                handler = self.load_handler(folder, source, calls)
                upload = SimpleNamespace(filename="input.pdf")
                args = {field: [upload] if field.endswith("files") else upload, "flipkart_sort_by_sku": False}
                if platform == "Ajio":
                    args["ajio_invoice_files"] = [upload]
                response = handler(**args)
                self.assertEqual(response.filename, service.label_output_filename(platform, 3))
                self.assertEqual(calls, ["original"])

    def test_enabled_toggle_uses_sku_sorter_and_names_actual_label_count(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            source = Path(folder) / "source.pdf"
            self.make_pdf(source, [("Z", "last"), ("A", "first")])
            calls = []
            handler = self.load_handler(folder, source, calls)
            response = handler(flipkart_file=SimpleNamespace(filename="input.pdf"), flipkart_sort_by_sku=True)
            self.assertEqual(calls, ["sorted"])
            self.assertEqual(response.filename, service.label_output_filename("Flipkart", 2))


if __name__ == "__main__":
    unittest.main()
