from datetime import date

from pydantic import BaseModel


class ReportMonthlyCashflowPoint(BaseModel):
    month: date
    inflow: float
    outflow: float
    net: float


class ReportCategorySpendPoint(BaseModel):
    category_id: int | None
    category_name: str | None
    total_spent: float


class ReportSummary(BaseModel):
    currency: str
    months: list[ReportMonthlyCashflowPoint]
    top_expense_categories: list[ReportCategorySpendPoint]

