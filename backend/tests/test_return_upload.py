from datetime import date
from io import BytesIO
import unittest

import pandas as pd
from fastapi import FastAPI, UploadFile, HTTPException
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.database import Base, get_db
from app.models.sku_master import SKUMaster, SKUPiece
from app.routes import return_routes as returns


class ReturnUploadTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(SKUMaster(platform='Amazon', sku='SKU-1', style='Plain', size='M', pack_of='2',
                              pieces=[SKUPiece(color='Black', qty=1), SKUPiece(color='White', qty=1)]))
        self.mapping = returns.ReturnColumnMapping(platform='Amazon', date_col='Return delivery date',
            status_col='Return request status', status_val='approved', order_id_col='Order ID',
            sku_col='Merchant SKU', qty_col='Order quantity')
        self.db.add(self.mapping)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def frame(self):
        return pd.DataFrame([
            {'Order ID': 'A1', 'Merchant SKU': 'SKU-1', 'Order quantity': '2',
             'Return delivery date': '2026-10-22', 'Return request status': 'approved'},
            {'Order ID': 'A2', 'Merchant SKU': 'SKU-1', 'Order quantity': '1',
             'Return delivery date': '2026-10-21', 'Return request status': 'approved'},
            {'Order ID': 'A3', 'Merchant SKU': 'SKU-1', 'Order quantity': '1',
             'Return delivery date': '2026-10-22', 'Return request status': 'pending'},
        ])

    def test_date_status_and_pack_expansion_without_stock_writes(self):
        rows = returns.build_preview(self.frame(), self.mapping, date(2026, 10, 22), self.db)['rows']
        self.assertEqual([(r['return_order_id'], r['color'], r['return_qty']) for r in rows],
                         [('A1', 'Black', 2), ('A1', 'White', 2)])
        self.assertEqual(self.db.query(returns.ReturnInventory).count(), 0)

    def test_commit_categories_and_duplicate_reupload(self):
        rows = returns.build_preview(self.frame(), self.mapping, date(2026, 10, 22), self.db)['rows']
        body = returns.ReturnCommit(valid_orders=[rows[0]], damaged_orders=[rows[1]],
            missing_orders=[dict(rows[0], return_order_id='M1')])
        self.assertEqual(returns.commit_pieces(body, self.db)['total_added'], 2)
        self.assertEqual(self.db.query(returns.ReturnInventory).one().qty, 2)
        self.assertEqual(self.db.query(returns.MissingReturnPiece).count(), 1)
        self.assertEqual(self.db.query(returns.DamagedReturnPiece).count(), 1)
        self.assertEqual(returns.commit_pieces(body, self.db), {'total_added': 0, 'skipped_duplicates': 3})

    def test_unknown_sku_and_required_columns(self):
        frame = self.frame().iloc[:1].copy()
        frame['Merchant SKU'] = 'UNKNOWN'
        self.assertEqual(returns.build_preview(frame, self.mapping, date(2026, 10, 22), self.db)['rows'][0]['_status'], 'missing')
        with self.assertRaises(HTTPException):
            returns.build_preview(frame.drop(columns=['Order ID']), self.mapping, date(2026, 10, 22), self.db)
        frame['Order quantity'] = '-1'
        with self.assertRaises(HTTPException):
            returns.build_preview(frame, self.mapping, date(2026, 10, 22), self.db)

    def test_all_platform_mappings_and_normalized_headers(self):
        for platform, date_col, status_col, status_val in [
            ('Flipkart', None, None, None), ('Amazon', 'Return delivery date', 'Return request status', 'approved'),
            ('Ajio', 'Return Delivered Date', 'Return Status', 'RETURN_DELIVERED'),
            ('Meesho', 'Delivered Date', None, None), ('Myntra', 'order_rto_date', None, None)]:
            mapping = returns.ReturnColumnMapping(platform=platform, date_col=date_col, status_col=status_col,
                status_val=status_val, order_id_col='Order ID', sku_col='SKU', qty_col='Qty')
            row = {' Order ID\n': '1', 'SKU': 'UNKNOWN', 'Qty': 1}
            if date_col:
                row[date_col] = '2026-10-22'
            if status_col:
                row[status_col] = status_val
            result = returns.build_preview(pd.DataFrame([row]), mapping, date(2026, 10, 22), self.db)
            self.assertEqual(len(result['rows']), 1, platform)

    def test_preview_http_route_is_registered_and_reads_excel(self):
        app = FastAPI()
        app.include_router(returns.router)
        app.dependency_overrides[get_db] = lambda: self.db
        content = BytesIO()
        self.frame().to_excel(content, index=False)
        self.assertIn('/v2/preview-returns', app.openapi()['paths'])
        self.assertIn('/v2/commit-returns-json', app.openapi()['paths'])
        upload_buffer = BytesIO(content.getvalue())
        upload_buffer._rolled = False  # Match Starlette's in-memory multipart upload.
        with patch.object(returns, 'check_admin'):
            coroutine = returns.preview_returns(
                file=UploadFile(filename='returns.xlsx', file=upload_buffer),
                platform='Amazon', return_date=date(2026, 10, 22), db=self.db, x_admin_key='test')
            try:
                coroutine.send(None)
            except StopIteration as completed:
                result = completed.value
            else:
                self.fail('In-memory upload unexpectedly suspended')
        self.assertEqual(len(result['rows']), 2)



if __name__ == '__main__':
    unittest.main()
