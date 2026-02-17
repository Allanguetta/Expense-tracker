from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Debt(TimestampMixin, Base):
    __tablename__ = "debts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    currency: Mapped[str] = mapped_column(String(3))
    balance: Mapped[float] = mapped_column(Numeric(16, 2))
    interest_rate: Mapped[float | None] = mapped_column(Numeric(7, 4), nullable=True)
    min_payment: Mapped[float | None] = mapped_column(Numeric(16, 2), nullable=True)
    due_day: Mapped[int | None] = mapped_column(nullable=True)
