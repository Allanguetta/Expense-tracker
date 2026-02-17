from calendar import monthrange
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.recurring_payment import RecurringPayment
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.recurring import (
    RecurringPaymentCreate,
    RecurringPaymentOut,
    RecurringPaymentUpdate,
    RecurringRecordPaymentRequest,
    RecurringRecordPaymentResponse,
)

router = APIRouter()


def _add_months(value: date, months: int) -> date:
    year = value.year + (value.month - 1 + months) // 12
    month = (value.month - 1 + months) % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def _advance_due_date(value: date, frequency: str, interval: int) -> date:
    if frequency == "weekly":
        return value + timedelta(days=7 * interval)
    return _add_months(value, interval)


def _next_due_after_record(
    current_due: date,
    frequency: str,
    interval: int,
    occurred_on: date,
) -> date:
    next_due = _advance_due_date(current_due, frequency, interval)
    while next_due <= occurred_on:
        next_due = _advance_due_date(next_due, frequency, interval)
    return next_due


def _serialize_payment(payment: RecurringPayment, today: date | None = None) -> RecurringPaymentOut:
    current_day = today or date.today()
    days_until_due = (payment.next_due_date - current_day).days
    return RecurringPaymentOut(
        id=payment.id,
        user_id=payment.user_id,
        account_id=payment.account_id,
        category_id=payment.category_id,
        name=payment.name,
        note=payment.note,
        currency=payment.currency,
        amount=float(payment.amount),
        kind=payment.kind,
        frequency=payment.frequency,
        interval=payment.interval,
        next_due_date=payment.next_due_date,
        is_active=payment.is_active,
        days_until_due=days_until_due,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


def _validate_refs(
    db: Session,
    user_id: int,
    account_id: int | None,
    category_id: int | None,
) -> None:
    if account_id is not None:
        account = db.query(Account).filter(Account.id == account_id, Account.user_id == user_id).first()
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if category_id is not None:
        category = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
        if not category:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")


@router.get("", response_model=list[RecurringPaymentOut])
def list_recurring_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    include_inactive: bool = Query(default=False),
    due_within_days: int | None = Query(default=None, ge=0, le=365),
) -> list[RecurringPaymentOut]:
    query = db.query(RecurringPayment).filter(RecurringPayment.user_id == current_user.id)
    if not include_inactive:
        query = query.filter(RecurringPayment.is_active.is_(True))

    today = date.today()
    if due_within_days is not None:
        end_date = today + timedelta(days=due_within_days)
        query = query.filter(
            RecurringPayment.next_due_date >= today,
            RecurringPayment.next_due_date <= end_date,
        )

    payments = query.order_by(RecurringPayment.next_due_date.asc(), RecurringPayment.id.asc()).all()
    return [_serialize_payment(payment, today=today) for payment in payments]


@router.post("", response_model=RecurringPaymentOut, status_code=status.HTTP_201_CREATED)
def create_recurring_payment(
    payload: RecurringPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecurringPaymentOut:
    _validate_refs(
        db=db,
        user_id=current_user.id,
        account_id=payload.account_id,
        category_id=payload.category_id,
    )
    payment = RecurringPayment(
        user_id=current_user.id,
        account_id=payload.account_id,
        category_id=payload.category_id,
        name=payload.name.strip(),
        note=payload.note,
        currency=payload.currency,
        amount=payload.amount,
        kind=payload.kind,
        frequency=payload.frequency,
        interval=payload.interval,
        next_due_date=payload.next_due_date,
        is_active=payload.is_active,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return _serialize_payment(payment)


@router.patch("/{payment_id}", response_model=RecurringPaymentOut)
def update_recurring_payment(
    payment_id: int,
    payload: RecurringPaymentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecurringPaymentOut:
    payment = (
        db.query(RecurringPayment)
        .filter(RecurringPayment.id == payment_id, RecurringPayment.user_id == current_user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring payment not found")

    data = payload.model_dump(exclude_unset=True)
    account_id = data.get("account_id", payment.account_id)
    category_id = data.get("category_id", payment.category_id)
    _validate_refs(db=db, user_id=current_user.id, account_id=account_id, category_id=category_id)

    for field, value in data.items():
        setattr(payment, field, value)

    db.commit()
    db.refresh(payment)
    return _serialize_payment(payment)


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    payment = (
        db.query(RecurringPayment)
        .filter(RecurringPayment.id == payment_id, RecurringPayment.user_id == current_user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring payment not found")
    db.delete(payment)
    db.commit()
    return None


@router.post("/{payment_id}/record-payment", response_model=RecurringRecordPaymentResponse)
def record_recurring_payment(
    payment_id: int,
    payload: RecurringRecordPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecurringRecordPaymentResponse:
    payment = (
        db.query(RecurringPayment)
        .filter(RecurringPayment.id == payment_id, RecurringPayment.user_id == current_user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring payment not found")
    if not payment.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recurring payment is inactive",
        )

    occurred_at = payload.occurred_at or datetime.utcnow()
    signed_amount = -abs(float(payment.amount)) if payment.kind == "expense" else abs(float(payment.amount))
    transaction = Transaction(
        user_id=current_user.id,
        account_id=payment.account_id,
        category_id=payment.category_id,
        description=payment.name,
        note=payload.note or payment.note,
        currency=payment.currency,
        amount=signed_amount,
        occurred_at=occurred_at,
        is_manual=True,
    )
    db.add(transaction)

    payment.next_due_date = _next_due_after_record(
        current_due=payment.next_due_date,
        frequency=payment.frequency,
        interval=payment.interval,
        occurred_on=occurred_at.date(),
    )

    db.commit()
    db.refresh(payment)
    db.refresh(transaction)
    return RecurringRecordPaymentResponse(
        recurring_payment=_serialize_payment(payment),
        transaction_id=transaction.id,
    )
