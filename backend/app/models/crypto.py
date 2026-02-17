from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CryptoHolding(TimestampMixin, Base):
    __tablename__ = "crypto_holdings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[float] = mapped_column(Numeric(24, 8))
    cost_basis: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    source: Mapped[str] = mapped_column(String(30))
