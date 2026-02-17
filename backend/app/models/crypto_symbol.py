from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CryptoSymbol(Base, TimestampMixin):
    __tablename__ = "crypto_symbols"
    __table_args__ = (UniqueConstraint("symbol", name="uq_crypto_symbols_symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    coingecko_id: Mapped[str] = mapped_column(String(120), index=True)
