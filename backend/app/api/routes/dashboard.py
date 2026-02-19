from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.account import Account
from app.models.budget import Budget, BudgetItem
from app.models.category import Category
from app.models.crypto import CryptoHolding
from app.models.debt import Debt
from app.models.price_cache import PriceCache
from app.models.recurring_payment import RecurringPayment
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.dashboard import (
    DashboardBudgetItemStatus,
    DashboardBudgetStatus,
    DashboardCashflow,
    DashboardCategorySpend,
    DashboardInsight,
    DashboardNetWorth,
    DashboardSummary,
    DashboardUpcomingRecurring,
)

router = APIRouter()


def _month_bounds(target: date) -> tuple[datetime, datetime]:
    start = datetime(target.year, target.month, 1)
    if target.month == 12:
        end = datetime(target.year + 1, 1, 1)
    else:
        end = datetime(target.year, target.month + 1, 1)
    return start, end


def _format_amount(value: float, currency: str) -> str:
    return f"{currency} {value:.2f}"


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    budget_month: date | None = Query(default=None),
    currency: str = Query(default="EUR", min_length=3, max_length=3),
    due_alert_days: int = Query(default=3, ge=0, le=30),
) -> DashboardSummary:
    today_date = date.today()
    if start_date is None or end_date is None:
        start_date, end_date = _month_bounds(today_date)

    inflow_expr = func.coalesce(
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)),
        0,
    )
    outflow_expr = func.coalesce(
        func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)),
        0,
    )
    inflow, outflow = (
        db.query(inflow_expr, outflow_expr)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.occurred_at >= start_date,
            Transaction.occurred_at < end_date,
        )
        .first()
    )
    net = float(inflow) - float(outflow)
    cashflow = DashboardCashflow(inflow=float(inflow), outflow=float(outflow), net=net)

    spend_rows = (
        db.query(
            Transaction.category_id,
            Category.name,
            func.coalesce(
                func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0
            ),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.occurred_at >= start_date,
            Transaction.occurred_at < end_date,
        )
        .group_by(Transaction.category_id, Category.name)
        .all()
    )
    spend_by_category = [
        DashboardCategorySpend(
            category_id=row[0],
            category_name=row[1],
            total_spent=float(row[2]),
        )
        for row in spend_rows
    ]

    accounts_total = (
        db.query(func.coalesce(func.sum(Account.balance), 0))
        .filter(Account.user_id == current_user.id)
        .scalar()
    )
    debts_total = (
        db.query(func.coalesce(func.sum(Debt.balance), 0))
        .filter(Debt.user_id == current_user.id)
        .scalar()
    )
    holdings = (
        db.query(CryptoHolding.symbol, CryptoHolding.quantity)
        .filter(CryptoHolding.user_id == current_user.id)
        .all()
    )
    symbols = [row[0] for row in holdings]
    prices = (
        db.query(PriceCache.symbol, PriceCache.price)
        .filter(PriceCache.symbol.in_(symbols), PriceCache.currency == currency)
        .all()
        if symbols
        else []
    )
    price_map = {row[0]: float(row[1]) for row in prices}
    crypto_total = 0.0
    for symbol, quantity in holdings:
        price = price_map.get(symbol)
        if price is not None:
            crypto_total += float(quantity) * price

    net_worth_value = float(accounts_total) + crypto_total - float(debts_total)
    net_worth = DashboardNetWorth(
        accounts_total=float(accounts_total),
        debts_total=float(debts_total),
        crypto_total=crypto_total,
        net_worth=net_worth_value,
        currency=currency,
    )

    if budget_month is None:
        budget_month = today_date.replace(day=1)
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == current_user.id, Budget.month == budget_month)
        .all()
    )
    budget_ids = [budget.id for budget in budgets]
    budget_items = (
        db.execute(
            select(BudgetItem)
            .where(BudgetItem.budget_id.in_(budget_ids))
            if budget_ids
            else select(BudgetItem).where(BudgetItem.budget_id == -1)
        )
        .scalars()
        .all()
    )
    budget_item_map: dict[int, list[BudgetItem]] = {}
    for item in budget_items:
        budget_item_map.setdefault(item.budget_id, []).append(item)

    budget_start, budget_end = _month_bounds(budget_month)
    spent_rows = (
        db.query(
            Transaction.category_id,
            func.coalesce(
                func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0
            ),
        )
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.occurred_at >= budget_start,
            Transaction.occurred_at < budget_end,
        )
        .group_by(Transaction.category_id)
        .all()
    )
    spent_by_category = {row[0]: float(row[1]) for row in spent_rows}

    budget_statuses: list[DashboardBudgetStatus] = []
    for budget in budgets:
        items = []
        for item in budget_item_map.get(budget.id, []):
            items.append(
                DashboardBudgetItemStatus(
                    category_id=item.category_id,
                    limit_amount=float(item.limit_amount),
                    spent=spent_by_category.get(item.category_id, 0.0),
                )
            )
        budget_statuses.append(
            DashboardBudgetStatus(
                id=budget.id,
                name=budget.name,
                month=budget.month,
                currency=budget.currency,
                items=items,
            )
        )

    due_cutoff = today_date + timedelta(days=due_alert_days)
    upcoming_rows = (
        db.query(RecurringPayment)
        .filter(
            RecurringPayment.user_id == current_user.id,
            RecurringPayment.is_active.is_(True),
            RecurringPayment.next_due_date >= today_date,
            RecurringPayment.next_due_date <= due_cutoff,
        )
        .order_by(RecurringPayment.next_due_date.asc(), RecurringPayment.id.asc())
        .all()
    )
    upcoming_recurring = [
        DashboardUpcomingRecurring(
            id=item.id,
            name=item.name,
            amount=float(item.amount),
            currency=item.currency,
            kind=item.kind,
            frequency=item.frequency,
            next_due_date=item.next_due_date,
            days_until_due=(item.next_due_date - today_date).days,
        )
        for item in upcoming_rows
    ]

    category_name_rows = (
        db.query(Category.id, Category.name)
        .filter(Category.user_id == current_user.id)
        .all()
    )
    category_name_map = {row[0]: row[1] for row in category_name_rows}

    insights: list[DashboardInsight] = []
    if net_worth_value < 0:
        insights.append(
            DashboardInsight(
                id="net-worth-negative",
                level="danger",
                title="Net worth is negative",
                message=(
                    f"Current net worth is {_format_amount(net_worth_value, currency)}. "
                    "Review debt balances and discretionary spending."
                ),
            )
        )

    period_days = max((end_date - start_date).days, 1)
    prev_start = start_date - timedelta(days=period_days)
    prev_end = start_date
    prev_inflow, prev_outflow = (
        db.query(inflow_expr, outflow_expr)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.occurred_at >= prev_start,
            Transaction.occurred_at < prev_end,
        )
        .first()
    )
    prev_outflow_value = float(prev_outflow)
    if prev_outflow_value > 0:
        outflow_change_pct = ((float(outflow) - prev_outflow_value) / prev_outflow_value) * 100
        if outflow_change_pct >= 20:
            insights.append(
                DashboardInsight(
                    id="spending-trend-up",
                    level="warning",
                    title="Spending trend is rising",
                    message=(
                        f"Outflow is up {outflow_change_pct:.0f}% versus the previous period "
                        f"({_format_amount(prev_outflow_value, currency)})."
                    ),
                )
            )
        elif outflow_change_pct <= -15:
            insights.append(
                DashboardInsight(
                    id="spending-trend-down",
                    level="success",
                    title="Spending improved",
                    message=(
                        f"Outflow is down {abs(outflow_change_pct):.0f}% versus the previous period "
                        f"({_format_amount(prev_outflow_value, currency)})."
                    ),
                )
            )

    budget_insights: list[tuple[float, DashboardInsight]] = []
    for budget in budget_statuses:
        for item in budget.items:
            if item.limit_amount <= 0:
                continue
            ratio = item.spent / item.limit_amount
            category_name = category_name_map.get(item.category_id, "Category")
            if ratio >= 1:
                budget_insights.append(
                    (
                        ratio,
                        DashboardInsight(
                            id=f"budget-over-{budget.id}-{item.category_id}",
                            level="danger",
                            title=f"{category_name} budget exceeded",
                            message=(
                                f"Spent {_format_amount(item.spent, budget.currency)} "
                                f"on a limit of {_format_amount(item.limit_amount, budget.currency)}."
                            ),
                        ),
                    )
                )
            elif ratio >= 0.85:
                budget_insights.append(
                    (
                        ratio,
                        DashboardInsight(
                            id=f"budget-risk-{budget.id}-{item.category_id}",
                            level="warning",
                            title=f"{category_name} budget is close",
                            message=(
                                f"Used {ratio * 100:.0f}% of your limit "
                                f"({_format_amount(item.spent, budget.currency)} / "
                                f"{_format_amount(item.limit_amount, budget.currency)})."
                            ),
                        ),
                    )
                )
    budget_insights.sort(key=lambda item: item[0], reverse=True)
    insights.extend([insight for _, insight in budget_insights[:2]])

    if upcoming_recurring:
        soonest = upcoming_recurring[0]
        insights.append(
            DashboardInsight(
                id="recurring-due-soon",
                level="info",
                title="Recurring payments due soon",
                message=(
                    f"{len(upcoming_recurring)} payment(s) due in the next {due_alert_days} day(s). "
                    f"Next: {soonest.name} in {soonest.days_until_due} day(s)."
                ),
            )
        )

    if not insights:
        insights.append(
            DashboardInsight(
                id="all-clear",
                level="success",
                title="No urgent financial alerts",
                message="Everything looks stable this period. Keep tracking consistently.",
            )
        )

    return DashboardSummary(
        cashflow=cashflow,
        spend_by_category=spend_by_category,
        net_worth=net_worth,
        budgets=budget_statuses,
        upcoming_recurring=upcoming_recurring,
        insights=insights,
    )
