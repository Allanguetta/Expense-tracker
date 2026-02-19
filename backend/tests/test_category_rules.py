from datetime import datetime

from tests.conftest import auth_headers


def _create_account(client, headers) -> int:
    response = client.post(
        "/accounts",
        json={
            "name": "Main Account",
            "account_type": "cash",
            "currency": "EUR",
            "balance": 1000.0,
            "is_manual": True,
        },
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


def _create_category(client, headers, name: str, kind: str) -> int:
    response = client.post(
        "/categories",
        json={"name": name, "kind": kind, "color": "#10B981"},
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_category_rule_crud_and_validation(client):
    headers = auth_headers(client, email="rules@example.com")
    expense_category_id = _create_category(client, headers, "Groceries", "expense")
    income_category_id = _create_category(client, headers, "Salary", "income")

    bad_kind = client.post(
        "/category-rules",
        json={
            "category_id": expense_category_id,
            "pattern": "Payroll",
            "match_type": "contains",
            "applies_to_kind": "income",
        },
        headers=headers,
    )
    assert bad_kind.status_code == 400

    bad_regex = client.post(
        "/category-rules",
        json={
            "category_id": income_category_id,
            "pattern": "(",
            "match_type": "regex",
            "applies_to_kind": "income",
        },
        headers=headers,
    )
    assert bad_regex.status_code == 400
    assert "Invalid regex" in bad_regex.text

    created = client.post(
        "/category-rules",
        json={
            "category_id": expense_category_id,
            "pattern": "LIDL",
            "match_type": "contains",
            "applies_to_kind": "expense",
            "priority": 25,
        },
        headers=headers,
    )
    assert created.status_code == 201
    created_payload = created.json()
    rule_id = created_payload["id"]
    assert created_payload["priority"] == 25

    listed = client.get("/category-rules", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == rule_id

    updated = client.patch(
        f"/category-rules/{rule_id}",
        json={"priority": 5, "is_active": False},
        headers=headers,
    )
    assert updated.status_code == 200
    updated_payload = updated.json()
    assert updated_payload["priority"] == 5
    assert updated_payload["is_active"] is False

    deleted = client.delete(f"/category-rules/{rule_id}", headers=headers)
    assert deleted.status_code == 204

    listed_after_delete = client.get("/category-rules", headers=headers)
    assert listed_after_delete.status_code == 200
    assert listed_after_delete.json() == []


def test_category_rule_auto_assigns_on_transaction_create(client):
    headers = auth_headers(client, email="autocategory@example.com")
    account_id = _create_account(client, headers)

    groceries_id = _create_category(client, headers, "Groceries", "expense")
    salary_id = _create_category(client, headers, "Salary", "income")
    special_id = _create_category(client, headers, "Special", "expense")

    create_generic_rule = client.post(
        "/category-rules",
        json={
            "category_id": groceries_id,
            "pattern": "LIDL",
            "match_type": "contains",
            "applies_to_kind": "expense",
            "priority": 100,
        },
        headers=headers,
    )
    assert create_generic_rule.status_code == 201

    create_priority_rule = client.post(
        "/category-rules",
        json={
            "category_id": special_id,
            "pattern": "LIDL City Market",
            "match_type": "equals",
            "applies_to_kind": "expense",
            "priority": 1,
        },
        headers=headers,
    )
    assert create_priority_rule.status_code == 201

    create_income_rule = client.post(
        "/category-rules",
        json={
            "category_id": salary_id,
            "pattern": "Payroll",
            "match_type": "starts_with",
            "applies_to_kind": "income",
            "priority": 50,
        },
        headers=headers,
    )
    assert create_income_rule.status_code == 201

    matched_expense = client.post(
        "/transactions",
        json={
            "account_id": account_id,
            "description": "LIDL City Market",
            "currency": "EUR",
            "amount": -35.2,
            "occurred_at": datetime.utcnow().isoformat(),
            "is_manual": True,
        },
        headers=headers,
    )
    assert matched_expense.status_code == 201
    assert matched_expense.json()["category_id"] == special_id

    unmatched_kind = client.post(
        "/transactions",
        json={
            "account_id": account_id,
            "description": "LIDL cashback",
            "currency": "EUR",
            "amount": 12.0,
            "occurred_at": datetime.utcnow().isoformat(),
            "is_manual": True,
        },
        headers=headers,
    )
    assert unmatched_kind.status_code == 201
    assert unmatched_kind.json()["category_id"] is None

    matched_income = client.post(
        "/transactions",
        json={
            "account_id": account_id,
            "description": "Payroll ACME GmbH",
            "currency": "EUR",
            "amount": 2500.0,
            "occurred_at": datetime.utcnow().isoformat(),
            "is_manual": True,
        },
        headers=headers,
    )
    assert matched_income.status_code == 201
    assert matched_income.json()["category_id"] == salary_id

