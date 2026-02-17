from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CryptoHoldingCreate(BaseModel):
    symbol: str
    name: str | None = None
    quantity: float = Field(gt=0)
    buy_price: float | None = Field(default=None, ge=0)
    cost_basis: float | None = Field(default=None, ge=0)
    source: str = "manual"

    @model_validator(mode="after")
    def normalize_cost_basis(self):
        if self.buy_price is None and self.cost_basis is not None:
            self.buy_price = self.cost_basis
        if self.cost_basis is None and self.buy_price is not None:
            self.cost_basis = self.buy_price
        return self


class CryptoHoldingUpdate(BaseModel):
    symbol: str | None = None
    name: str | None = None
    quantity: float | None = Field(default=None, gt=0)
    buy_price: float | None = Field(default=None, ge=0)
    cost_basis: float | None = Field(default=None, ge=0)
    source: str | None = None

    @model_validator(mode="after")
    def normalize_cost_basis(self):
        if self.buy_price is None and self.cost_basis is not None:
            self.buy_price = self.cost_basis
        if self.cost_basis is None and self.buy_price is not None:
            self.cost_basis = self.buy_price
        return self


class CryptoHoldingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    symbol: str
    name: str
    quantity: float
    cost_basis: float | None
    buy_price: float | None = None
    source: str
    current_price: float | None = None
    current_value: float | None = None
    cost_value: float | None = None
    gain_loss: float | None = None
    gain_loss_pct: float | None = None
    currency: str = "EUR"
    created_at: datetime
    updated_at: datetime


class PriceCacheOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    currency: str
    price: float
    as_of: datetime


class PriceRefreshRequest(BaseModel):
    symbols: list[str]
    currency: str = "EUR"


class PriceRefreshResponse(BaseModel):
    updated: list[PriceCacheOut]


class SyncQueuedResponse(BaseModel):
    sync_id: int
    status: str


class CryptoSymbolCreate(BaseModel):
    symbol: str
    coingecko_id: str | None = None


class CryptoSymbolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    coingecko_id: str
    created_at: datetime
    updated_at: datetime
