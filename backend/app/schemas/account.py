from datetime import datetime

from pydantic import BaseModel


class AccountCreate(BaseModel):
    name: str
    account_type: str
    currency: str
    balance: float | None = None
    institution_id: int | None = None
    external_id: str | None = None
    is_manual: bool = False


class AccountOut(BaseModel):
    id: int
    user_id: int
    institution_id: int | None
    external_id: str | None
    name: str
    account_type: str
    currency: str
    balance: float | None
    is_manual: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AccountUpdate(BaseModel):
    name: str | None = None
    account_type: str | None = None
    currency: str | None = None
    balance: float | None = None
