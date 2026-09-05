import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, BASE_DIR)

from app.database.database import SessionLocal
from app.models.sticker_inventory import StickerInventory

def run():
    print("Starting legacy sticker cleanup...")
    db = SessionLocal()
    try:
        legacy_rows = db.query(StickerInventory).filter(
            StickerInventory.style == "lsds",
        ).all()

        if not legacy_rows:
            print("No legacy 'lsds' stickers found. Nothing to do.")
            return

        print(f"Found {len(legacy_rows)} legacy 'lsds' stickers. Deleting...")
        for row in legacy_rows:
            db.delete(row)
        
        db.commit()
        print("Cleanup complete.")
    except Exception as e:
        print(f"An error occurred: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run()
