from pydantic import BaseModel
from typing import List


class SKUPieceCreate(BaseModel):
    color: str
    qty: int


class SKUMasterCreate(BaseModel):
    platform: str
    sku: str
    style: str
    size: str

    pieces: List[SKUPieceCreate]