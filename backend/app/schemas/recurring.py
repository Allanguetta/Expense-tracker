from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


VALID_KINDS = {"expense", "income"}
VALID_FREQUENCIES = {"weekly", "monthly"}


class RecurringPaymentCreate(BaseModel):
    account_id: int
    category_id: int | None = None
    name: str = Field(min_length=1, max_length=255)
    note: str | None = None
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    amount: float = Field(gt=0)
    kind: str = "expense"
    frequency: str = "monthly"
    interval: int = Field(default=1, ge=1, le=60)
    next_due_date: date
    is_active: bool = True

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("kind")
    @classmethod
    def normalize_kind(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in VALID_KINDS:
            raise ValueError("kind must be one of: expense, income")
        return normalized

    @field_validator("frequency")
    @classmethod
    def normalize_frequency(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in VALID_FREQUENCIES:
            raise ValueError("frequency must be one of: weekly, monthly")
        return normalized


class RecurringPaymentUpdate(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    note: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    amount: float | None = Field(default=None, gt=0)
    kind: str | None = None
    frequency: str | None = None
    interval: int | None = Field(default=None, ge=1, le=60)
    next_due_date: date | None = None
    is_active: bool | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().upper()

    @field_validator("kind")
    @classmethod
    def normalize_kind(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in VALID_KINDS:
            raise ValueError("kind must be one of: expense, income")
        return normalized

    @field_validator("frequency")
    @classmethod
    def normalize_frequency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in VALID_FREQUENCIES:
            raise ValueError("frequency must be one of: weekly, monthly")
        return normalized


class RecurringPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    account_id: int
    category_id: int | None
    name: str
    note: str | None
    currency: str
    amount: float
    kind: str
    frequency: str
    interval: int
    next_due_date: date
    is_active: bool
    days_until_due: int | None = None
    created_at: datetime
    updated_at: datetime


class RecurringRecordPaymentRequest(BaseModel):
    occurred_at: datetime | None = None
    note: str | None = None


class RecurringRecordPaymentResponse(BaseModel):
    recurring_payment: RecurringPaymentOut
    transaction_id: int
