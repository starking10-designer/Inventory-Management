import json
import os
import tempfile
import time
from typing import Any, Dict, List, Optional


SNAPSHOT_DIR = os.path.join(tempfile.gettempdir(), "inventory_snapshot_cache")


def _snapshot_path(inventory_type: str) -> str:
    safe_type = "".join(ch for ch in str(inventory_type or "").lower() if ch.isalnum() or ch in ("-", "_"))
    return os.path.join(SNAPSHOT_DIR, f"{safe_type}.json")


def _ensure_dir() -> None:
    os.makedirs(SNAPSHOT_DIR, exist_ok=True)


def read_inventory_snapshot(inventory_type: str) -> Optional[Dict[str, Any]]:
    path = _snapshot_path(inventory_type)
    if not os.path.exists(path):
        return None
        
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'inventory.db')
    if os.path.exists(db_path):
        try:
            db_mtime = os.path.getmtime(db_path)
            cache_mtime = os.path.getmtime(path)
            if db_mtime > cache_mtime:
                # Database is newer than cache, invalidate cache!
                invalidate_inventory_snapshot(inventory_type)
                return None
        except Exception:
            pass


    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            return None
        rows = payload.get("rows")
        if not isinstance(rows, list):
            return None
        return payload
    except Exception:
        return None


def write_inventory_snapshot(
    inventory_type: str,
    rows: List[Dict[str, Any]],
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    _ensure_dir()
    payload: Dict[str, Any] = {
        "inventory_type": str(inventory_type or "").lower(),
        "saved_at": time.time(),
        "rows": rows if isinstance(rows, list) else [],
        "count": len(rows or []),
    }
    if extra:
        payload.update(extra)

    path = _snapshot_path(inventory_type)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    os.replace(tmp_path, path)


def invalidate_inventory_snapshot(inventory_type: str) -> None:
    path = _snapshot_path(inventory_type)
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass
