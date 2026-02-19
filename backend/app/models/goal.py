from datetime import date

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    currency: Mapped[str] = mapped_column(String(3))
    target_amount: Mapped[float] = mapped_column(Numeric(16, 2))
    current_amount: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="savings")
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

