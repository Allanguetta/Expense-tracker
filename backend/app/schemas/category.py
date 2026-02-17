from datetime import datetime

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    kind: str
    color: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None
    color: str | None = None


class CategoryOut(BaseModel):
    id: int
    user_id: int
    name: str
    kind: str
    color: str | None
    is_system: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
