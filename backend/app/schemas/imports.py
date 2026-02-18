from datetime import datetime

from pydantic import BaseModel, Field


class TransactionImportRow(BaseModel):
    line_number: int
    category_id: int | None = None
    description: str
    note: str | None = None
    currency: str
    amount: float | None = None
    occurred_at: datetime | None = None
    external_id: str | None = None
    is_duplicate: bool = False
    duplicate_reason: str | None = None
    error: str | None = None
    selected: bool = True


class TransactionImportPreviewResponse(BaseModel):
    source_type: str
    filename: str
    total_rows: int
    parsed_rows: int
    valid_rows: int
    duplicate_rows: int
    invalid_rows: int
    warnings: list[str] = Field(default_factory=list)
    rows: list[TransactionImportRow]


class TransactionImportCommitRequest(BaseModel):
    account_id: int
    rows: list[TransactionImportRow]


class TransactionImportCommitResponse(BaseModel):
    imported_count: int
    skipped_duplicates: int
    skipped_invalid: int
    transaction_ids: list[int]
