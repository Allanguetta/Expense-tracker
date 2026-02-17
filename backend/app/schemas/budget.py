from datetime import date, datetime

from pydantic import BaseModel


class BudgetItemCreate(BaseModel):
    category_id: int
    limit_amount: float


class BudgetItemOut(BaseModel):
    id: int
    budget_id: int
    category_id: int
    limit_amount: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetCreate(BaseModel):
    name: str
    month: date
    currency: str
    items: list[BudgetItemCreate]


class BudgetUpdate(BaseModel):
    name: str | None = None
    month: date | None = None
    currency: str | None = None
    items: list[BudgetItemCreate] | None = None


class BudgetOut(BaseModel):
    id: int
    user_id: int
    name: str
    month: date
    currency: str
    created_at: datetime
    updated_at: datetime
    items: list[BudgetItemOut]

    class Config:
        from_attributes = True
