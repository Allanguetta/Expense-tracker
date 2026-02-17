from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.crypto import CryptoHolding
from app.models.crypto_symbol import CryptoSymbol
from app.models.price_cache import PriceCache
from app.models.user import User
from app.schemas.crypto import (
    CryptoHoldingCreate,
    CryptoHoldingOut,
    CryptoHoldingUpdate,
    CryptoSymbolCreate,
    CryptoSymbolOut,
    PriceCacheOut,
    PriceRefreshRequest,
    PriceRefreshResponse,
    SyncQueuedResponse,
)
from app.services.crypto_sync import queue_coinbase_sync
from app.services.prices import fetch_prices, now_utc

router = APIRouter()

DEFAULT_CURRENCY = "EUR"
PRICE_STALE_AFTER_MINUTES = 5


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def _normalize_currency(currency: str) -> str:
    return currency.strip().upper()


def _serialize_holding(
    holding: CryptoHolding,
    price_map: dict[str, float],
    currency: str,
) -> CryptoHoldingOut:
    quantity = float(holding.quantity)
    buy_price = float(holding.cost_basis) if holding.cost_basis is not None else None
    current_price = price_map.get(holding.symbol)
    current_value = quantity * current_price if current_price is not None else None
    cost_value = quantity * buy_price if buy_price is not None else None

    gain_loss = None
    gain_loss_pct = None
    if current_value is not None and cost_value is not None:
        gain_loss = current_value - cost_value
        if cost_value > 0:
            gain_loss_pct = (gain_loss / cost_value) * 100

    return CryptoHoldingOut(
        id=holding.id,
        user_id=holding.user_id,
        symbol=holding.symbol,
        name=holding.name,
        quantity=quantity,
        cost_basis=buy_price,
        buy_price=buy_price,
        source=holding.source,
        current_price=current_price,
        current_value=current_value,
        cost_value=cost_value,
        gain_loss=gain_loss,
        gain_loss_pct=gain_loss_pct,
        currency=currency,
        created_at=holding.created_at,
        updated_at=holding.updated_at,
    )


def _upsert_prices(
    db: Session,
    symbols: list[str],
    currency: str,
) -> dict[str, float]:
    normalized_symbols = sorted({_normalize_symbol(symbol) for symbol in symbols if symbol.strip()})
    if not normalized_symbols:
        return {}

    quote_currency = _normalize_currency(currency)
    fetched_prices = fetch_prices(normalized_symbols, quote_currency)
    if not fetched_prices:
        return {}

    existing_entries = (
        db.query(PriceCache)
        .filter(
            PriceCache.symbol.in_(list(fetched_prices.keys())),
            PriceCache.currency == quote_currency,
        )
        .all()
    )
    existing_map = {entry.symbol: entry for entry in existing_entries}
    as_of = now_utc()

    for symbol, price in fetched_prices.items():
        entry = existing_map.get(symbol)
        if entry:
            entry.price = price
            entry.as_of = as_of
            continue

        db.add(
            PriceCache(
                symbol=symbol,
                currency=quote_currency,
                price=price,
                as_of=as_of,
            )
        )

    db.commit()
    return fetched_prices


@router.get("/holdings", response_model=list[CryptoHoldingOut])
def list_holdings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    currency: str = Query(default=DEFAULT_CURRENCY, min_length=3, max_length=3),
) -> list[CryptoHoldingOut]:
    holdings = (
        db.query(CryptoHolding)
        .filter(CryptoHolding.user_id == current_user.id)
        .order_by(CryptoHolding.symbol.asc())
        .all()
    )
    if not holdings:
        return []

    quote_currency = _normalize_currency(currency)
    symbols = sorted({holding.symbol for holding in holdings})
    cached_prices = (
        db.query(PriceCache)
        .filter(PriceCache.symbol.in_(symbols), PriceCache.currency == quote_currency)
        .all()
    )
    cache_map = {entry.symbol: entry for entry in cached_prices}
    stale_before = now_utc() - timedelta(minutes=PRICE_STALE_AFTER_MINUTES)
    symbols_to_refresh: list[str] = []
    for symbol in symbols:
        entry = cache_map.get(symbol)
        if entry is None or entry.as_of is None:
            symbols_to_refresh.append(symbol)
            continue
        as_of = entry.as_of
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=timezone.utc)
        if as_of < stale_before:
            symbols_to_refresh.append(symbol)
    if symbols_to_refresh:
        _upsert_prices(db, symbols_to_refresh, quote_currency)
        cached_prices = (
            db.query(PriceCache)
            .filter(PriceCache.symbol.in_(symbols), PriceCache.currency == quote_currency)
            .all()
        )

    price_map = {entry.symbol: float(entry.price) for entry in cached_prices}
    return [_serialize_holding(holding, price_map, quote_currency) for holding in holdings]


@router.post("/holdings", response_model=CryptoHoldingOut, status_code=status.HTTP_201_CREATED)
def create_holding(
    holding_in: CryptoHoldingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CryptoHoldingOut:
    symbol = _normalize_symbol(holding_in.symbol)
    buy_price = holding_in.buy_price if holding_in.buy_price is not None else holding_in.cost_basis
    holding = CryptoHolding(
        user_id=current_user.id,
        symbol=symbol,
        name=(holding_in.name or symbol).strip(),
        quantity=holding_in.quantity,
        cost_basis=buy_price,
        source=(holding_in.source or "manual").strip() or "manual",
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)

    # Try to populate or refresh the just-added symbol price immediately.
    _upsert_prices(db, [holding.symbol], DEFAULT_CURRENCY)
    entry = (
        db.query(PriceCache)
        .filter(PriceCache.symbol == holding.symbol, PriceCache.currency == DEFAULT_CURRENCY)
        .first()
    )
    price_map = {holding.symbol: float(entry.price)} if entry else {}
    return _serialize_holding(holding, price_map, DEFAULT_CURRENCY)


@router.patch("/holdings/{holding_id}", response_model=CryptoHoldingOut)
def update_holding(
    holding_id: int,
    holding_in: CryptoHoldingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CryptoHoldingOut:
    holding = (
        db.query(CryptoHolding)
        .filter(CryptoHolding.id == holding_id, CryptoHolding.user_id == current_user.id)
        .first()
    )
    if not holding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found")

    data = holding_in.model_dump(exclude_unset=True)
    if "symbol" in data and data["symbol"] is not None:
        data["symbol"] = _normalize_symbol(data["symbol"])
    if "buy_price" in data:
        data["cost_basis"] = data["buy_price"]
        data.pop("buy_price")
    if "name" in data and data["name"] is None:
        data["name"] = holding.name

    for field, value in data.items():
        setattr(holding, field, value)

    db.commit()
    db.refresh(holding)
    # Refresh current price for updated symbol so UI gets fresh valuation.
    _upsert_prices(db, [holding.symbol], DEFAULT_CURRENCY)
    entry = (
        db.query(PriceCache)
        .filter(PriceCache.symbol == holding.symbol, PriceCache.currency == DEFAULT_CURRENCY)
        .first()
    )
    price_map = {holding.symbol: float(entry.price)} if entry else {}
    return _serialize_holding(holding, price_map, DEFAULT_CURRENCY)


@router.delete("/holdings/{holding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holding(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    holding = (
        db.query(CryptoHolding)
        .filter(CryptoHolding.id == holding_id, CryptoHolding.user_id == current_user.id)
        .first()
    )
    if not holding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found")
    db.delete(holding)
    db.commit()
    return None


@router.get("/prices", response_model=list[PriceCacheOut])
def list_prices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    symbol: str | None = Query(default=None),
    currency: str | None = Query(default=None),
) -> list[PriceCacheOut]:
    query = db.query(PriceCache)
    if symbol:
        query = query.filter(PriceCache.symbol == _normalize_symbol(symbol))
    if currency:
        query = query.filter(PriceCache.currency == _normalize_currency(currency))
    return query.all()


@router.post("/prices/refresh", response_model=PriceRefreshResponse)
def refresh_prices(
    payload: PriceRefreshRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PriceRefreshResponse:
    normalized_symbols = sorted({_normalize_symbol(symbol) for symbol in payload.symbols if symbol.strip()})
    if not normalized_symbols:
        return PriceRefreshResponse(updated=[])

    quote_currency = _normalize_currency(payload.currency)
    _upsert_prices(db, normalized_symbols, quote_currency)
    updated = (
        db.query(PriceCache)
        .filter(
            PriceCache.symbol.in_(normalized_symbols),
            PriceCache.currency == quote_currency,
        )
        .all()
    )
    return PriceRefreshResponse(updated=updated)


@router.post("/sync/coinbase", response_model=SyncQueuedResponse, status_code=status.HTTP_202_ACCEPTED)
def sync_coinbase(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SyncQueuedResponse:
    sync_log = queue_coinbase_sync(db, current_user.id)
    return SyncQueuedResponse(sync_id=sync_log.id, status=sync_log.status)


@router.get("/symbols", response_model=list[CryptoSymbolOut])
def list_symbols(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CryptoSymbolOut]:
    return db.query(CryptoSymbol).order_by(CryptoSymbol.symbol.asc()).all()


@router.post("/symbols", response_model=CryptoSymbolOut, status_code=status.HTTP_201_CREATED)
def create_symbol(
    payload: CryptoSymbolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CryptoSymbolOut:
    normalized_symbol = _normalize_symbol(payload.symbol)
    existing = db.query(CryptoSymbol).filter(CryptoSymbol.symbol == normalized_symbol).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Symbol already exists")

    # Retain legacy column for compatibility; pricing now uses Coinbase symbol pairs directly.
    reference_id = payload.coingecko_id or normalized_symbol.lower()
    symbol = CryptoSymbol(symbol=normalized_symbol, coingecko_id=reference_id)
    db.add(symbol)
    db.commit()
    db.refresh(symbol)
    return symbol
