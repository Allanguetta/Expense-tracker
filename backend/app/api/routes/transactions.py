from datetime import datetime
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionOut, TransactionUpdate
from app.services.category_rules import find_matching_category_id

router = APIRouter()


def _build_transactions_query(
    db: Session,
    user_id: int,
    start_date: datetime | None,
    end_date: datetime | None,
    account_id: int | None,
    category_id: int | None,
    search: str | None,
    uncategorized: bool | None,
):
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if start_date:
        query = query.filter(Transaction.occurred_at >= start_date)
    if end_date:
        query = query.filter(Transaction.occurred_at <= end_date)
    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    if uncategorized is True:
        query = query.filter(Transaction.category_id.is_(None))
    elif uncategorized is False:
        query = query.filter(Transaction.category_id.is_not(None))
    if search:
        search_text = search.strip()
        if search_text:
            like_pattern = f"%{search_text}%"
            query = query.filter(
                or_(
                    Transaction.description.ilike(like_pattern),
                    Transaction.note.ilike(like_pattern),
                )
            )
    return query


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    account_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    uncategorized: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[TransactionOut]:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be before or equal to end_date",
        )
    query = _build_transactions_query(
        db=db,
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
        account_id=account_id,
        category_id=category_id,
        search=search,
        uncategorized=uncategorized,
    )
    return query.order_by(Transaction.occurred_at.desc()).offset(offset).limit(limit).all()


@router.get("/export")
def export_transactions_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    account_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    uncategorized: bool | None = Query(default=None),
) -> Response:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be before or equal to end_date",
        )

    rows = (
        _build_transactions_query(
            db=db,
            user_id=current_user.id,
            start_date=start_date,
            end_date=end_date,
            account_id=account_id,
            category_id=category_id,
            search=search,
            uncategorized=uncategorized,
        )
        .order_by(Transaction.occurred_at.desc())
        .all()
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "account_id",
            "category_id",
            "description",
            "note",
            "currency",
            "amount",
            "occurred_at",
            "is_manual",
            "external_id",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.id,
                row.account_id,
                row.category_id if row.category_id is not None else "",
                row.description,
                row.note or "",
                row.currency,
                float(row.amount),
                row.occurred_at.isoformat(),
                "true" if row.is_manual else "false",
                row.external_id or "",
            ]
        )

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction_in: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    account = (
        db.query(Account)
        .filter(Account.id == transaction_in.account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if not transaction_in.is_manual and account.is_manual:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Linked transactions cannot target manual accounts",
        )
    category_id = transaction_in.category_id
    if category_id is not None:
        category = (
            db.query(Category)
            .filter(Category.id == category_id, Category.user_id == current_user.id)
            .first()
        )
        if not category:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    else:
        category_id = find_matching_category_id(
            db,
            current_user.id,
            description=transaction_in.description,
            note=transaction_in.note,
            amount=transaction_in.amount,
        )
    transaction = Transaction(
        user_id=current_user.id,
        account_id=transaction_in.account_id,
        category_id=category_id,
        external_id=transaction_in.external_id,
        description=transaction_in.description,
        note=transaction_in.note,
        currency=transaction_in.currency,
        amount=transaction_in.amount,
        occurred_at=transaction_in.occurred_at,
        is_manual=transaction_in.is_manual,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int,
    transaction_in: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    data = transaction_in.model_dump(exclude_unset=True)
    if "account_id" in data:
        account = (
            db.query(Account)
            .filter(Account.id == data["account_id"], Account.user_id == current_user.id)
            .first()
        )
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
        if not transaction.is_manual and account.is_manual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Linked transactions cannot target manual accounts",
            )
    if "category_id" in data and data["category_id"] is not None:
        category = (
            db.query(Category)
            .filter(Category.id == data["category_id"], Category.user_id == current_user.id)
            .first()
        )
        if not category:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    for field, value in data.items():
        setattr(transaction, field, value)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    db.delete(transaction)
    db.commit()
    return None
