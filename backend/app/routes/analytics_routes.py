from fastapi import APIRouter, Depends

from sqlalchemy.orm import Session

from sqlalchemy import func

from typing import List, Dict, Any

from app.database.database import get_db

from app.models.return_analytics import ReturnAnalytics

from app.models.missing_return_piece import MissingReturnPiece

from app.models.inventory_deduction_log import InventoryDeductionLog

from app.models.sticker_analysis import StickerAnalysis

from datetime import date

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])



@router.get("/return-analytics")

def get_return_analytics(db: Session = Depends(get_db)):

    records = db.query(ReturnAnalytics).order_by(ReturnAnalytics.return_date.desc()).all()

    

    result = []

    for r in records:

        result.append({

            "id": r.id,

            "platform": r.platform,

            "return_date": r.return_date,

            "status": r.status,

            "order_id": r.order_id,

            "sku": r.sku,

            "qty": r.qty,

            "return_type": r.return_type,

            "return_reason": r.return_reason,

            "amount": r.amount,

            "style": r.style,

            "color": r.color,

            "size": r.size,

            "pack_of": r.pack_of

        })

        

    return {"data": result}



@router.get("/missing-return-pieces")

def get_missing_return_pieces(db: Session = Depends(get_db)):

    records = db.query(MissingReturnPiece).order_by(MissingReturnPiece.id.desc()).all()



    result = []

    for r in records:

        result.append({

            "id": r.id,

            "platform": r.platform,

            "return_date": r.return_date,

            "status": r.status,

            "order_id": r.order_id,

            "sku": r.sku,

            "qty": r.qty,

            "return_type": r.return_type,

            "return_reason": r.return_reason,

            "amount": r.amount,

            "style": r.style,

            "color": r.color,

            "size": r.size,

            "pack_of": r.pack_of

        })



    return {"data": result}



from app.models.damaged_return_piece import DamagedReturnPiece

@router.get("/damaged-return-pieces")

def get_damaged_return_pieces(db: Session = Depends(get_db)):

    records = db.query(DamagedReturnPiece).order_by(DamagedReturnPiece.id.desc()).all()



    result = []

    for r in records:

        result.append({

            "id": r.id,

            "platform": r.platform,

            "return_date": r.return_date,

            "status": r.status,

            "order_id": r.order_id,

            "sku": r.sku,

            "qty": r.qty,

            "return_type": r.return_type,

            "return_reason": r.return_reason,

            "amount": r.amount,

            "style": r.style,

            "color": r.color,

            "size": r.size,

            "pack_of": r.pack_of

        })



    return {"data": result}



from typing import Optional as Opt



from datetime import datetime



@router.get("/inventory-deductions/today")

def get_today_inventory_deductions(inventory_type: Opt[str] = "stock", query_date: Opt[str] = None, db: Session = Depends(get_db)):

    if query_date:

        target_date = datetime.strptime(query_date, "%Y-%m-%d").date()

    else:

        target_date = date.today()

        

    query = db.query(InventoryDeductionLog).filter(

        InventoryDeductionLog.report_date == target_date,

        InventoryDeductionLog.inventory_type == inventory_type

    ).order_by(InventoryDeductionLog.id.desc())

    records = query.all()



    result = []

    for r in records:

        result.append({

            "id": r.id,

            "report_date": str(r.report_date),

            "platform": r.platform,

            "style": r.style,

            "color": r.color,

            "size": r.size,

            "qty": r.qty,

        })

    return {"data": result}



@router.get("/todays-deducted-qty/{inv_type}")

def get_todays_deducted_qty(inv_type: str, db: Session = Depends(get_db)):

    today = date.today()

    total = db.query(func.sum(InventoryDeductionLog.qty)).filter(

        InventoryDeductionLog.report_date == today,

        InventoryDeductionLog.inventory_type == inv_type

    ).scalar()

    

    return {"total": int(total or 0)}



from app.models.stock_analysis import StockAnalysis

from sqlalchemy import desc



@router.get("/stock-analysis")
def get_stock_analysis_data(db: Session = Depends(get_db)):
    latest_record = db.query(StockAnalysis).order_by(desc(StockAnalysis.created_at)).first()
    updated_on = latest_record.created_at if latest_record else None

    total_pieces = db.query(func.sum(StockAnalysis.qty)).scalar() or 0

    top_styles_query = db.query(
        StockAnalysis.style,
        func.sum(StockAnalysis.qty).label('total_qty')
    ).group_by(StockAnalysis.style).order_by(desc('total_qty')).limit(10).all()
    
    top_styles = [{"style": r.style, "qty": r.total_qty} for r in top_styles_query]

    stock_by_date_query = db.query(
        func.date(StockAnalysis.created_at).label('upload_date'),
        func.sum(StockAnalysis.qty).label('total_qty')
    ).group_by(func.date(StockAnalysis.created_at)).order_by('upload_date').limit(30).all()

    stock_by_date = [{"date": r.upload_date, "qty": r.total_qty} for r in stock_by_date_query]

    upload_history = db.query(StockAnalysis).order_by(desc(StockAnalysis.created_at)).limit(1000).all()
    history_data = [
        {
            "id": h.id,
            "style": h.style,
            "color": h.color,
            "size": h.size,
            "qty": h.qty,
            "created_at": h.created_at.isoformat() if h.created_at else None
        }
        for h in upload_history
    ]

    return {
        "updated_on": updated_on.isoformat() if updated_on else None,
        "total_pieces": total_pieces,
        "top_styles": top_styles,
        "stock_by_date": stock_by_date,
        "history": history_data
    }

@router.get("/sticker-analysis")

def get_sticker_analysis_data(db: Session = Depends(get_db)):

    latest_record = db.query(StickerAnalysis).order_by(desc(StickerAnalysis.created_at)).first()

    updated_on = latest_record.created_at if latest_record else None



    from app.models.sticker_inventory import StickerInventory

    total_pieces = db.query(func.sum(StickerInventory.qty)).scalar() or 0



    # Top styles qty wise

    top_styles_query = db.query(

        StickerAnalysis.style,

        func.sum(StickerAnalysis.qty).label('total_qty')

    ).group_by(StickerAnalysis.style).order_by(desc('total_qty')).limit(10).all()

    

    top_styles = [{"style": r.style, "qty": r.total_qty} for r in top_styles_query]



    # Stock by Date

    stock_by_date_query = db.query(

        func.date(StickerAnalysis.created_at).label('upload_date'),

        func.sum(StickerAnalysis.qty).label('total_qty')

    ).group_by(func.date(StickerAnalysis.created_at)).order_by('upload_date').limit(30).all()



    stock_by_date = [{"date": r.upload_date, "qty": r.total_qty} for r in stock_by_date_query]



    upload_history = db.query(StickerAnalysis).order_by(desc(StickerAnalysis.created_at)).limit(1000).all()

    history_data = [

        {

            "id": h.id,

            "style": h.style,

            "color": h.color,

            "qty": h.qty,

            "created_at": h.created_at.isoformat() if h.created_at else None

        }

        for h in upload_history

    ]



    return {

        "updated_on": updated_on.isoformat() if updated_on else None,

        "total_pieces": total_pieces,

        "top_styles": top_styles,

        "stock_by_date": stock_by_date,

        "history": history_data

    }

