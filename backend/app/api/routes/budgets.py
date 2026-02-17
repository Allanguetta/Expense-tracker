from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.budget import Budget, BudgetItem
from app.models.category import Category
from app.models.user import User
from app.schemas.budget import BudgetCreate, BudgetOut, BudgetUpdate

router = APIRouter()


def _load_items(db: Session, user_id: int, budget_ids: list[int]) -> dict[int, list[BudgetItem]]:
    if not budget_ids:
        return {}
    items = (
        db.execute(
            select(BudgetItem)
            .join(Budget, BudgetItem.budget_id == Budget.id)
            .where(Budget.user_id == user_id, BudgetItem.budget_id.in_(budget_ids))
        )
        .scalars()
        .all()
    )
    grouped: dict[int, list[BudgetItem]] = {}
    for item in items:
        grouped.setdefault(item.budget_id, []).append(item)
    return grouped


def _validate_categories(db: Session, user_id: int, category_ids: list[int]) -> None:
    if not category_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget items required")
    existing = (
        db.query(Category.id)
        .filter(Category.user_id == user_id, Category.id.in_(category_ids))
        .all()
    )
    if len(existing) != len(set(category_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category id")


@router.get("", response_model=list[BudgetOut])
def list_budgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    month: date | None = Query(default=None),
) -> list[BudgetOut]:
    query = db.query(Budget).filter(Budget.user_id == current_user.id)
    if month:
        query = query.filter(Budget.month == month)
    budgets = query.order_by(Budget.month.desc()).all()
    budget_ids = [budget.id for budget in budgets]
    grouped_items = _load_items(db, current_user.id, budget_ids)
    result: list[BudgetOut] = []
    for budget in budgets:
        result.append(
            BudgetOut.model_validate(
                {**budget.__dict__, "items": grouped_items.get(budget.id, [])},
                from_attributes=True,
            )
        )
    return result


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
def create_budget(
    budget_in: BudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BudgetOut:
    category_ids = [item.category_id for item in budget_in.items]
    _validate_categories(db, current_user.id, category_ids)
    budget = Budget(
        user_id=current_user.id,
        name=budget_in.name,
        month=budget_in.month,
        currency=budget_in.currency,
    )
    db.add(budget)
    db.flush()
    items = [
        BudgetItem(
            budget_id=budget.id,
            category_id=item.category_id,
            limit_amount=item.limit_amount,
        )
        for item in budget_in.items
    ]
    db.add_all(items)
    db.commit()
    db.refresh(budget)
    return BudgetOut.model_validate({**budget.__dict__, "items": items}, from_attributes=True)


@router.patch("/{budget_id}", response_model=BudgetOut)
def update_budget(
    budget_id: int,
    budget_in: BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BudgetOut:
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")
    data = budget_in.model_dump(exclude_unset=True)
    items_in = data.pop("items", None)
    for field, value in data.items():
        setattr(budget, field, value)
    if items_in is not None:
        category_ids = [item["category_id"] for item in items_in]
        _validate_categories(db, current_user.id, category_ids)
        db.query(BudgetItem).filter(BudgetItem.budget_id == budget.id).delete()
        items = [
            BudgetItem(
                budget_id=budget.id,
                category_id=item["category_id"],
                limit_amount=item["limit_amount"],
            )
            for item in items_in
        ]
        db.add_all(items)
    db.commit()
    db.refresh(budget)
    items = (
        db.query(BudgetItem).filter(BudgetItem.budget_id == budget.id).all()
        if items_in is None
        else db.query(BudgetItem).filter(BudgetItem.budget_id == budget.id).all()
    )
    return BudgetOut.model_validate({**budget.__dict__, "items": items}, from_attributes=True)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")
    db.query(BudgetItem).filter(BudgetItem.budget_id == budget.id).delete()
    db.delete(budget)
    db.commit()
    return None
