from datetime import date

from tests.conftest import auth_headers


def test_categories_and_budgets(client):
    headers = auth_headers(client)
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
    budget_id = budget.json()["id"]

    listed = client.get("/budgets", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    updated = client.patch(
        f"/budgets/{budget_id}",
        json={"items": [{"category_id": category_id, "limit_amount": 250.0}]},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["items"][0]["limit_amount"] == 250.0
