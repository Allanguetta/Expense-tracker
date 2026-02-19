from datetime import date, datetime
from calendar import monthrange

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.report import ReportCategorySpendPoint, ReportMonthlyCashflowPoint, ReportSummary

router = APIRouter()


def _month_start(value: date) -> datetime:
    return datetime(value.year, value.month, 1)


def _month_end(value: date) -> datetime:
    last_day = monthrange(value.year, value.month)[1]
    return datetime(value.year, value.month, last_day, 23, 59, 59, 999999)


def _shift_months(source: date, delta: int) -> date:
    year = source.year + ((source.month - 1 + delta) // 12)
    month = ((source.month - 1 + delta) % 12) + 1
    return date(year, month, 1)


@router.get("/summary", response_model=ReportSummary)
def get_reports_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    months: int = Query(default=6, ge=1, le=24),
    currency: str = Query(default="EUR", min_length=3, max_length=3),
) -> ReportSummary:
    today = date.today().replace(day=1)
    month_points: list[ReportMonthlyCashflowPoint] = []
    start_month = _shift_months(today, -(months - 1))

    inflow_expr = func.coalesce(
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)),
        0,
    )
    outflow_expr = func.coalesce(
        func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)),
        0,
    )

    for step in range(months):
        month_date = _shift_months(start_month, step)
        inflow, outflow = (
            db.query(inflow_expr, outflow_expr)
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.occurred_at >= _month_start(month_date),
                Transaction.occurred_at <= _month_end(month_date),
            )
            .first()
        )
        inflow_value = float(inflow or 0)
        outflow_value = float(outflow or 0)
        month_points.append(
            ReportMonthlyCashflowPoint(
                month=month_date,
                inflow=inflow_value,
                outflow=outflow_value,
                net=inflow_value - outflow_value,
            )
        )

    range_start = _month_start(start_month)
    range_end = _month_end(today)
    top_rows = (
        db.query(
            Transaction.category_id,
            Category.name,
            func.coalesce(
                func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)),
                0,
            ),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.occurred_at >= range_start,
            Transaction.occurred_at <= range_end,
        )
        .group_by(Transaction.category_id, Category.name)
        .order_by(func.coalesce(func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0).desc())
        .limit(5)
        .all()
    )
    top_expense_categories = [
        ReportCategorySpendPoint(
            category_id=row[0],
            category_name=row[1],
            total_spent=float(row[2]),
        )
        for row in top_rows
        if float(row[2]) > 0
    ]

    return ReportSummary(
        currency=currency.upper(),
        months=month_points,
        top_expense_categories=top_expense_categories,
    )

