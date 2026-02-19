from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CategoryRule(TimestampMixin, Base):
    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    pattern: Mapped[str] = mapped_column(String(160))
    match_type: Mapped[str] = mapped_column(String(20), default="contains")
    applies_to_kind: Mapped[str] = mapped_column(String(20), default="all")
    priority: Mapped[int] = mapped_column(Integer, default=100)
    case_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
