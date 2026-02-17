from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.db.session import get_db
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import GoogleAuthRequest, RefreshTokenRequest, Token, TokenPair
from app.schemas.user import UserCreate, UserOut

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    user = User(email=user_in.email, hashed_password=get_password_hash(user_in.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/token", response_model=TokenPair)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenPair:
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    access_token = create_access_token(subject=user.email)
    refresh_token, jti, expires_at = create_refresh_token(subject=user.email)
    db.add(RefreshToken(user_id=user.id, jti=jti, expires_at=expires_at, revoked=False))
    db.commit()
    return TokenPair(access_token=access_token, refresh_token=refresh_token, token_type="bearer")


@router.post("/refresh", response_model=TokenPair)
def refresh_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> TokenPair:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
    )
    try:
        decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if decoded.get("type") != "refresh":
            raise credentials_exception
        email = decoded.get("sub")
        jti = decoded.get("jti")
        if not email or not jti:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise credentials_exception
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.jti == jti, RefreshToken.user_id == user.id)
        .first()
    )
    if not token_record or token_record.revoked:
        raise credentials_exception

    token_record.revoked = True
    new_access = create_access_token(subject=user.email)
    new_refresh, new_jti, new_expiry = create_refresh_token(subject=user.email)
    db.add(RefreshToken(user_id=user.id, jti=new_jti, expires_at=new_expiry, revoked=False))
    db.commit()
    return TokenPair(access_token=new_access, refresh_token=new_refresh, token_type="bearer")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> None:
    try:
        decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if decoded.get("type") != "refresh":
            return None
        jti = decoded.get("jti")
    except JWTError:
        return None
    if not jti:
        return None
    token_record = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if token_record and not token_record.revoked:
        token_record.revoked = True
        db.commit()
    return None


@router.post("/google", response_model=TokenPair, status_code=status.HTTP_501_NOT_IMPLEMENTED)
def google_login(payload: GoogleAuthRequest) -> TokenPair:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Google login is not configured yet.",
    )
