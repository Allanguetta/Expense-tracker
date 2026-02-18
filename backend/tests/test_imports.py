from tests.conftest import auth_headers


def test_statement_import_preview_and_commit_csv(client):
    headers = auth_headers(client)
    account_response = client.post(
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
    assert account_response.status_code == 201
    account_id = account_response.json()["id"]

    existing_transaction = client.post(
        "/transactions",
        json={
            "account_id": account_id,
            "description": "Coffee Shop",
            "note": "Morning coffee",
            "currency": "EUR",
            "amount": -3.5,
            "occurred_at": "2026-02-01T09:00:00Z",
            "is_manual": True,
        },
        headers=headers,
    )
    assert existing_transaction.status_code == 201

    csv_content = """Date,Description,Amount,Currency,Reference,Note
2026-02-01,Coffee Shop,-3.50,EUR,tx-001,Morning coffee
2026-02-02,Rent,-500.00,EUR,tx-002,Monthly rent
,Broken Row,,EUR,tx-003,
"""

    preview = client.post(
        "/imports/transactions/preview",
        headers=headers,
        data={"account_id": str(account_id)},
        files={"file": ("statement.csv", csv_content, "text/csv")},
    )
    assert preview.status_code == 200
    preview_data = preview.json()
    assert preview_data["source_type"] == "csv"
    assert preview_data["total_rows"] == 3
    assert preview_data["valid_rows"] == 1
    assert preview_data["duplicate_rows"] == 1
    assert preview_data["invalid_rows"] == 1

    commit_rows = preview_data["rows"]
    for row in commit_rows:
        row["selected"] = True

    commit = client.post(
        "/imports/transactions/commit",
        headers=headers,
        json={"account_id": account_id, "rows": commit_rows},
    )
    assert commit.status_code == 201
    commit_data = commit.json()
    assert commit_data["imported_count"] == 1
    assert commit_data["skipped_duplicates"] == 1
    assert commit_data["skipped_invalid"] == 1

    search_rent = client.get("/transactions?search=rent", headers=headers)
    assert search_rent.status_code == 200
    rent_transactions = search_rent.json()
    assert len(rent_transactions) == 1
    assert rent_transactions[0]["description"] == "Rent"
    assert rent_transactions[0]["note"] == "Monthly rent"


def test_statement_import_preview_rejects_unsupported_files(client):
    headers = auth_headers(client, email="files@example.com")
    account_response = client.post(
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
    assert account_response.status_code == 201
    account_id = account_response.json()["id"]

    preview = client.post(
        "/imports/transactions/preview",
        headers=headers,
        data={"account_id": str(account_id)},
        files={"file": ("statement.txt", "invalid", "text/plain")},
    )
    assert preview.status_code == 400
    assert "Unsupported file type" in preview.text


def test_statement_import_preview_accepts_pdf(monkeypatch, client):
    from datetime import UTC, datetime

    from app.api.routes import imports as imports_route

    headers = auth_headers(client, email="pdf@example.com")
    account_response = client.post(
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
    assert account_response.status_code == 201
    account_id = account_response.json()["id"]

    def fake_pdf_parser(_raw: bytes, default_currency: str):
        row = imports_route._base_row(1)
        row.update(
            {
                "description": "Utility bill",
                "currency": default_currency,
                "amount": -42.2,
                "occurred_at": datetime(2026, 2, 3, tzinfo=UTC),
            }
        )
        return [row], ["Mocked parser warning"]

    monkeypatch.setattr(imports_route, "_parse_pdf_rows", fake_pdf_parser)

    preview = client.post(
        "/imports/transactions/preview",
        headers=headers,
        data={"account_id": str(account_id)},
        files={"file": ("statement.pdf", b"%PDF-1.4 dummy", "application/pdf")},
    )
    assert preview.status_code == 200
    payload = preview.json()
    assert payload["source_type"] == "pdf"
    assert payload["valid_rows"] == 1
    assert payload["rows"][0]["description"] == "Utility bill"
