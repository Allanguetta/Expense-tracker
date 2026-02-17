from tests.conftest import auth_headers


def test_debt_payoff(client):
    headers = auth_headers(client)
    debt = client.post(
        "/debts",
        json={
            "name": "Loan",
            "currency": "EUR",
            "balance": 1200.0,
            "interest_rate": 12.0,
            "min_payment": 100.0,
            "due_day": 5,
        },
        headers=headers,
    )
    assert debt.status_code == 201
    debt_id = debt.json()["id"]

    payoff = client.get(f"/debts/{debt_id}/payoff", headers=headers)
    assert payoff.status_code == 200
    body = payoff.json()
    assert body["months_to_payoff"] is not None
    assert body["total_interest_paid"] >= 0.0
