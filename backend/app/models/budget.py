from sqlalchemy import Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Budget(TimestampMixin, Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    month: Mapped[Date] = mapped_column(Date, index=True)
    currency: Mapped[str] = mapped_column(String(3))


class BudgetItem(TimestampMixin, Base):
    __tablename__ = "budget_items"
    __table_args__ = (UniqueConstraint("budget_id", "category_id", name="uq_budget_category"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    limit_amount: Mapped[float] = mapped_column(Numeric(16, 2))
