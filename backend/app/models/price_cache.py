from sqlalchemy import DateTime, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PriceCache(Base):
    __tablename__ = "price_cache"
    __table_args__ = (UniqueConstraint("symbol", "currency", name="uq_price_symbol_currency"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    currency: Mapped[str] = mapped_column(String(3))
    price: Mapped[float] = mapped_column(Numeric(24, 8))
    as_of: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
