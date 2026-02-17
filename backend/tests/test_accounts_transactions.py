from datetime import datetime, timedelta

from tests.conftest import auth_headers


def test_accounts_and_transactions_flow(client):
    headers = auth_headers(client)
    account = client.post(
        "/accounts",
        json={"name": "Cash", "account_type": "cash", "currency": "EUR", "balance": 100.0, "is_manual": True},
        headers=headers,
    )
    assert account.status_code == 201
    account_id = account.json()["id"]

    transaction = client.post(
        "/transactions",
        json={
            "account_id": account_id,
            "description": "Groceries",
            "currency": "EUR",
            "amount": -25.5,
            "occurred_at": datetime.utcnow().isoformat(),
            "is_manual": True,
        },
        headers=headers,
    )
    assert transaction.status_code == 201

    bad_transaction = client.post(
        "/transactions",
        json={
            "account_id": account_id,
            "description": "Bad",
            "currency": "EUR",
            "amount": -10,
            "occurred_at": datetime.utcnow().isoformat(),
            "is_manual": False,
        },
        headers=headers,
    )
    assert bad_transaction.status_code == 400

    start = (datetime.utcnow() - timedelta(days=1)).isoformat()
    end = (datetime.utcnow() + timedelta(days=1)).isoformat()
    listed = client.get(
        f"/transactions?start_date={start}&end_date={end}&account_id={account_id}",
        headers=headers,
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    updated = client.patch(
        f"/accounts/{account_id}",
        json={"name": "Wallet"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Wallet"

    deleted = client.delete(f"/accounts/{account_id}", headers=headers)
    assert deleted.status_code == 204
