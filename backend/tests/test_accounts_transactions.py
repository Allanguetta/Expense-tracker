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

    category = client.post(
        "/categories",
        json={"name": "Groceries", "kind": "expense", "color": "#10B981"},
        headers=headers,
    )
    assert category.status_code == 201
    category_id = category.json()["id"]

    categorized = client.post(
        "/transactions",
        json={
            "account_id": account_id,
            "category_id": category_id,
            "description": "Weekly market",
            "note": "Fruit and vegetables",
            "currency": "EUR",
            "amount": -40.0,
            "occurred_at": datetime.utcnow().isoformat(),
            "is_manual": True,
        },
        headers=headers,
    )
    assert categorized.status_code == 201

    search_by_note = client.get("/transactions?search=vegetables", headers=headers)
    assert search_by_note.status_code == 200
    search_data = search_by_note.json()
    assert len(search_data) == 1
    assert search_data[0]["description"] == "Weekly market"

    uncategorized_only = client.get("/transactions?uncategorized=true", headers=headers)
    assert uncategorized_only.status_code == 200
    uncategorized_data = uncategorized_only.json()
    assert len(uncategorized_data) == 1
    assert uncategorized_data[0]["description"] == "Groceries"

    categorized_only = client.get("/transactions?uncategorized=false", headers=headers)
    assert categorized_only.status_code == 200
    categorized_data = categorized_only.json()
    assert len(categorized_data) == 1
    assert categorized_data[0]["description"] == "Weekly market"

    export_csv = client.get("/transactions/export?search=market", headers=headers)
    assert export_csv.status_code == 200
    assert export_csv.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=transactions.csv" == export_csv.headers["content-disposition"]
    body = export_csv.text
    assert "description,note,currency,amount,occurred_at" in body
    assert "Weekly market,Fruit and vegetables,EUR,-40.0" in body

    updated = client.patch(
        f"/accounts/{account_id}",
        json={"name": "Wallet"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Wallet"

    deleted = client.delete(f"/accounts/{account_id}", headers=headers)
    assert deleted.status_code == 204
