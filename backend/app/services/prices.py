from datetime import datetime, timezone

import httpx


def fetch_prices(symbols: list[str], currency: str) -> dict[str, float]:
    if not symbols:
        return {}

    normalized_symbols = sorted({symbol.strip().upper() for symbol in symbols if symbol.strip()})
    quote_currency = currency.strip().upper()
    results: dict[str, float] = {}

    with httpx.Client(timeout=10.0) as client:
        for symbol in normalized_symbols:
            pair = f"{symbol}-{quote_currency}"
            url = f"https://api.coinbase.com/v2/prices/{pair}/spot"
            try:
                response = client.get(url)
                response.raise_for_status()
                payload = response.json()
                amount = payload.get("data", {}).get("amount")
                if amount is None:
                    continue
                results[symbol] = float(amount)
            except (httpx.HTTPError, TypeError, ValueError):
                continue

    return results


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
