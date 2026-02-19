from datetime import datetime, timedelta

from tests.conftest import auth_headers


def test_goals_crud_and_contribution_flow(client):
    headers = auth_headers(client, email="goals@example.com")

    create = client.post(
        "/goals",
        json={
            "name": "Emergency Fund",
            "currency": "eur",
            "target_amount": 5000,
            "current_amount": 1200,
            "kind": "savings",
            "status": "active",
        },
        headers=headers,
    )
    assert create.status_code == 201, create.text
    goal = create.json()
    goal_id = goal["id"]
    assert goal["currency"] == "EUR"
    assert goal["progress_pct"] == 24.0

    listed = client.get("/goals", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    contribute = client.post(
        f"/goals/{goal_id}/contribute",
        json={"amount": 4300},
        headers=headers,
    )
    assert contribute.status_code == 200
    contributed_goal = contribute.json()
    assert contributed_goal["current_amount"] == 5500.0
    assert contributed_goal["status"] == "completed"

    updated = client.patch(
        f"/goals/{goal_id}",
        json={"notes": "Keep building the buffer"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Keep building the buffer"

    deleted = client.delete(f"/goals/{goal_id}", headers=headers)
    assert deleted.status_code == 204


def test_reports_summary_returns_months_and_top_categories(client):
    headers = auth_headers(client, email="reports@example.com")

    account = client.post(
        "/accounts",
        json={
            "name": "Main",
            "account_type": "cash",
            "currency": "EUR",
            "balance": 1000.0,
            "is_manual": True,
        },
        headers=headers,
    )
    assert account.status_code == 201
    account_id = account.json()["id"]

    food = client.post(
        "/categories",
        json={"name": "Food", "kind": "expense"},
        headers=headers,
    )
    assert food.status_code == 201
    food_id = food.json()["id"]

    salary = client.post(
        "/categories",
        json={"name": "Salary", "kind": "income"},
        headers=headers,
    )
    assert salary.status_code == 201
    salary_id = salary.json()["id"]

    now = datetime.utcnow()
    prev_month = now - timedelta(days=32)

    txns = [
        {
            "account_id": account_id,
            "description": "Groceries",
            "currency": "EUR",
            "amount": -120.0,
            "occurred_at": now.isoformat(),
            "category_id": food_id,
            "is_manual": True,
        },
        {
            "account_id": account_id,
            "description": "Payroll",
            "currency": "EUR",
            "amount": 1800.0,
            "occurred_at": now.isoformat(),
            "category_id": salary_id,
            "is_manual": True,
        },
        {
            "account_id": account_id,
            "description": "Groceries old",
            "currency": "EUR",
            "amount": -90.0,
            "occurred_at": prev_month.isoformat(),
            "category_id": food_id,
            "is_manual": True,
        },
    ]

    for txn in txns:
        create_txn = client.post("/transactions", json=txn, headers=headers)
        assert create_txn.status_code == 201, create_txn.text

    summary = client.get("/reports/summary?months=3", headers=headers)
    assert summary.status_code == 200
    payload = summary.json()
    assert payload["currency"] == "EUR"
    assert len(payload["months"]) == 3
    assert any(point["outflow"] > 0 for point in payload["months"])
    assert any(item["category_name"] == "Food" for item in payload["top_expense_categories"])

