from datetime import datetime

from pydantic import BaseModel


class DebtCreate(BaseModel):
    name: str
    currency: str
    balance: float
    interest_rate: float | None = None
    min_payment: float | None = None
    due_day: int | None = None


class DebtUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    balance: float | None = None
    interest_rate: float | None = None
    min_payment: float | None = None
    due_day: int | None = None


class DebtOut(BaseModel):
    id: int
    user_id: int
    name: str
    currency: str
    balance: float
    interest_rate: float | None
    min_payment: float | None
    due_day: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DebtPayoffResponse(BaseModel):
    months_to_payoff: int | None
    total_interest_paid: float
    monthly_payment: float | None
