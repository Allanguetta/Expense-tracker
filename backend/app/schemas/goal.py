from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

GoalKind = Literal["savings", "debt_payoff", "purchase"]
GoalStatus = Literal["active", "completed", "archived"]


class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    currency: str = Field(min_length=3, max_length=3)
    target_amount: float = Field(gt=0)
    current_amount: float = Field(default=0, ge=0)
    target_date: date | None = None
    kind: GoalKind = "savings"
    status: GoalStatus = "active"
    notes: str | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.strip().upper()


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    target_amount: float | None = Field(default=None, gt=0)
    current_amount: float | None = Field(default=None, ge=0)
    target_date: date | None = None
    kind: GoalKind | None = None
    status: GoalStatus | None = None
    notes: str | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().upper()


class GoalContributeRequest(BaseModel):
    amount: float


class GoalOut(BaseModel):
    id: int
    user_id: int
    name: str
    currency: str
    target_amount: float
    current_amount: float
    target_date: date | None
    kind: GoalKind
    status: GoalStatus
    notes: str | None
    progress_pct: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

