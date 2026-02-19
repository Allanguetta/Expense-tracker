from datetime import date

from pydantic import BaseModel
from typing import Literal


class DashboardCategorySpend(BaseModel):
    category_id: int | None
    category_name: str | None
    total_spent: float


class DashboardCashflow(BaseModel):
    inflow: float
    outflow: float
    net: float


class DashboardNetWorth(BaseModel):
    accounts_total: float
    debts_total: float
    crypto_total: float
    net_worth: float
    currency: str


class DashboardBudgetItemStatus(BaseModel):
    category_id: int
    limit_amount: float
    spent: float


class DashboardBudgetStatus(BaseModel):
    id: int
    name: str
    month: date
    currency: str
    items: list[DashboardBudgetItemStatus]


class DashboardUpcomingRecurring(BaseModel):
    id: int
    name: str
    amount: float
    currency: str
    kind: str
    frequency: str
    next_due_date: date
    days_until_due: int


class DashboardInsight(BaseModel):
    id: str
    level: Literal["danger", "warning", "info", "success"]
    title: str
    message: str


class DashboardSummary(BaseModel):
    cashflow: DashboardCashflow
    spend_by_category: list[DashboardCategorySpend]
    net_worth: DashboardNetWorth
    budgets: list[DashboardBudgetStatus]
    upcoming_recurring: list[DashboardUpcomingRecurring]
    insights: list[DashboardInsight]
