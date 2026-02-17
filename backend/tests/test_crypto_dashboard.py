from datetime import date, datetime

from tests.conftest import auth_headers


def test_crypto_symbols_price_refresh_and_dashboard(client, monkeypatch):
    headers = auth_headers(client)

    from app.api.routes import crypto as crypto_routes

    def fake_fetch_prices(symbols, currency):
        return {"BTC": 50000.0}

    monkeypatch.setattr(crypto_routes, "fetch_prices", fake_fetch_prices)

    refresh = client.post(
        "/crypto/prices/refresh",
        json={"symbols": ["BTC"], "currency": "EUR"},
        headers=headers,
    )
    assert refresh.status_code == 200
    assert len(refresh.json()["updated"]) == 1

    account = client.post(
        "/accounts",
        json={"name": "Bank", "account_type": "checking", "currency": "EUR", "balance": 1000.0},
        headers=headers,
    )
    assert account.status_code == 201

    holding = client.post(
        "/crypto/holdings",
        json={"symbol": "BTC", "name": "Bitcoin", "quantity": 0.1, "source": "manual"},
        headers=headers,
    )
    assert holding.status_code == 201

    debt = client.post(
        "/debts",
        json={"name": "Card", "currency": "EUR", "balance": 200.0},
        headers=headers,
    )
    assert debt.status_code == 201

    category = client.post(
        "/categories",
        json={"name": "Food", "kind": "expense"},
        headers=headers,
    )
    assert category.status_code == 201
    category_id = category.json()["id"]

    budget = client.post(
        "/budgets",
        json={
            "name": "Monthly",
            "month": date.today().replace(day=1).isoformat(),
            "currency": "EUR",
            "items": [{"category_id": category_id, "limit_amount": 300.0}],
        },
        headers=headers,
    )
    assert budget.status_code == 201

    transaction = client.post(
        "/transactions",
        json={
            "account_id": account.json()["id"],
            "description": "Groceries",
            "currency": "EUR",
            "amount": -50.0,
            "occurred_at": datetime.utcnow().isoformat(),
            "category_id": category_id,
            "is_manual": True,
        },
        headers=headers,
    )
    assert transaction.status_code == 201

    dashboard = client.get("/dashboard/summary", headers=headers)
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert "cashflow" in body
    assert "net_worth" in body
    assert "spend_by_category" in body
    assert "budgets" in body


def test_crypto_holdings_include_buy_price_and_gain_loss(client, monkeypatch):
    headers = auth_headers(client, email="portfolio@example.com")

    from app.api.routes import crypto as crypto_routes

    def fake_fetch_prices(symbols, currency):
        return {"ETH": 3000.0}

    monkeypatch.setattr(crypto_routes, "fetch_prices", fake_fetch_prices)

    create_holding = client.post(
        "/crypto/holdings",
        json={"symbol": "eth", "quantity": 2, "buy_price": 2500},
        headers=headers,
    )
    assert create_holding.status_code == 201, create_holding.text

    list_holdings = client.get("/crypto/holdings", headers=headers)
    assert list_holdings.status_code == 200, list_holdings.text
    holdings = list_holdings.json()
    assert len(holdings) == 1

    holding = holdings[0]
    assert holding["symbol"] == "ETH"
    assert holding["buy_price"] == 2500.0
    assert holding["current_price"] == 3000.0
    assert holding["current_value"] == 6000.0
    assert holding["gain_loss"] == 1000.0
    assert round(holding["gain_loss_pct"], 2) == 20.0
