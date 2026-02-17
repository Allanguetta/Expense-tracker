from datetime import date, timedelta

from tests.conftest import auth_headers


def test_recurring_payment_flow_and_dashboard_alert(client):
    headers = auth_headers(client, email="recurring@example.com")

    account = client.post(
        "/accounts",
        json={"name": "Main Account", "account_type": "checking", "currency": "EUR", "balance": 2000.0},
        headers=headers,
    )
    assert account.status_code == 201
    account_id = account.json()["id"]

    due_date = date.today() + timedelta(days=3)
    create = client.post(
        "/recurring-payments",
        json={
            "name": "Rent",
            "account_id": account_id,
            "currency": "EUR",
            "amount": 850.0,
            "kind": "expense",
            "frequency": "monthly",
            "interval": 1,
            "next_due_date": due_date.isoformat(),
        },
        headers=headers,
    )
    assert create.status_code == 201, create.text
    payment_id = create.json()["id"]

    list_due = client.get("/recurring-payments?due_within_days=3", headers=headers)
    assert list_due.status_code == 200
    rows = list_due.json()
    assert len(rows) == 1
    assert rows[0]["name"] == "Rent"
    assert rows[0]["days_until_due"] == 3

    dashboard = client.get("/dashboard/summary", headers=headers)
    assert dashboard.status_code == 200
    upcoming = dashboard.json()["upcoming_recurring"]
    assert len(upcoming) == 1
    assert upcoming[0]["name"] == "Rent"
    assert upcoming[0]["days_until_due"] == 3

    record = client.post(f"/recurring-payments/{payment_id}/record-payment", json={}, headers=headers)
    assert record.status_code == 200, record.text
    body = record.json()
    assert body["transaction_id"] > 0
    assert body["recurring_payment"]["next_due_date"] != due_date.isoformat()

    transactions = client.get(f"/transactions?account_id={account_id}", headers=headers)
    assert transactions.status_code == 200
    data = transactions.json()
    assert len(data) == 1
    assert data[0]["description"] == "Rent"
    assert float(data[0]["amount"]) == -850.0

    delete = client.delete(f"/recurring-payments/{payment_id}", headers=headers)
    assert delete.status_code == 204
