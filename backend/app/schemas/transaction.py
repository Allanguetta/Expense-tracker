from datetime import datetime

from pydantic import BaseModel


class TransactionCreate(BaseModel):
    account_id: int
    category_id: int | None = None
    description: str
    note: str | None = None
    currency: str
    amount: float
    occurred_at: datetime
    external_id: str | None = None
    is_manual: bool = False


class TransactionOut(BaseModel):
    id: int
    user_id: int
    account_id: int
    category_id: int | None
    external_id: str | None
    description: str
    note: str | None
    currency: str
    amount: float
    occurred_at: datetime
    is_manual: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    description: str | None = None
    note: str | None = None
    currency: str | None = None
    amount: float | None = None
    occurred_at: datetime | None = None
