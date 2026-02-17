from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.debt import Debt
from app.models.user import User
from app.schemas.debt import DebtCreate, DebtOut, DebtPayoffResponse, DebtUpdate

router = APIRouter()


def _calculate_payoff(balance: float, interest_rate: float | None, min_payment: float | None) -> DebtPayoffResponse:
    if balance <= 0:
        return DebtPayoffResponse(months_to_payoff=0, total_interest_paid=0.0, monthly_payment=min_payment)
    if not min_payment or min_payment <= 0:
        return DebtPayoffResponse(months_to_payoff=None, total_interest_paid=0.0, monthly_payment=min_payment)
    if not interest_rate:
        months = int((balance + min_payment - 1) // min_payment)
        return DebtPayoffResponse(
            months_to_payoff=months,
            total_interest_paid=0.0,
            monthly_payment=min_payment,
        )
    monthly_rate = (interest_rate / 100) / 12
    months = 0
    total_interest = 0.0
    remaining = balance
    while remaining > 0 and months < 1200:
        interest = remaining * monthly_rate
        total_interest += interest
        remaining = remaining + interest - min_payment
        months += 1
        if remaining < 0:
            remaining = 0
    if months >= 1200:
        return DebtPayoffResponse(months_to_payoff=None, total_interest_paid=total_interest, monthly_payment=min_payment)
    return DebtPayoffResponse(months_to_payoff=months, total_interest_paid=total_interest, monthly_payment=min_payment)


@router.get("", response_model=list[DebtOut])
def list_debts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DebtOut]:
    return db.query(Debt).filter(Debt.user_id == current_user.id).all()


@router.post("", response_model=DebtOut, status_code=status.HTTP_201_CREATED)
def create_debt(
    debt_in: DebtCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DebtOut:
    debt = Debt(
        user_id=current_user.id,
        name=debt_in.name,
        currency=debt_in.currency,
        balance=debt_in.balance,
        interest_rate=debt_in.interest_rate,
        min_payment=debt_in.min_payment,
        due_day=debt_in.due_day,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return debt


@router.patch("/{debt_id}", response_model=DebtOut)
def update_debt(
    debt_id: int,
    debt_in: DebtUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DebtOut:
    debt = db.query(Debt).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")
    data = debt_in.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(debt, field, value)
    db.commit()
    db.refresh(debt)
    return debt


@router.delete("/{debt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    debt = db.query(Debt).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")
    db.delete(debt)
    db.commit()
    return None


@router.get("/{debt_id}/payoff", response_model=DebtPayoffResponse)
def get_payoff(
    debt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DebtPayoffResponse:
    debt = db.query(Debt).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt not found")
    return _calculate_payoff(
        balance=float(debt.balance),
        interest_rate=float(debt.interest_rate) if debt.interest_rate is not None else None,
        min_payment=float(debt.min_payment) if debt.min_payment is not None else None,
    )
