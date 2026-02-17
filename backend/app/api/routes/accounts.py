from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.account import Account
from app.models.user import User
from app.schemas.account import AccountCreate, AccountOut, AccountUpdate

router = APIRouter()


@router.get("", response_model=list[AccountOut])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AccountOut]:
    return db.query(Account).filter(Account.user_id == current_user.id).all()


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    account_in: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountOut:
    if account_in.is_manual and account_in.institution_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manual accounts cannot be linked to an institution",
        )
    account = Account(
        user_id=current_user.id,
        institution_id=account_in.institution_id,
        external_id=account_in.external_id,
        name=account_in.name,
        account_type=account_in.account_type,
        currency=account_in.currency,
        balance=account_in.balance,
        is_manual=account_in.is_manual,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    account_in: AccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountOut:
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    data = account_in.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    db.delete(account)
    db.commit()
    return None
