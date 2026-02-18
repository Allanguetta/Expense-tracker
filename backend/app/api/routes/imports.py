import csv
import io
import re
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.imports import (
    TransactionImportCommitRequest,
    TransactionImportCommitResponse,
    TransactionImportPreviewResponse,
)

router = APIRouter()

MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024
DATE_REGEX = re.compile(r"\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[./-]\d{2}[./-]\d{4}\b")
AMOUNT_REGEX = re.compile(
    r"[-+]?\s*(?:EUR|USD|GBP|CHF|\u20AC|\$|\u00A3)?\s*\d[\d\s.,]*\d(?:[.,]\d{1,2})?",
    re.IGNORECASE,
)
DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y")

CURRENCY_SYMBOLS = {"\u20AC": "EUR", "$": "USD", "\u00A3": "GBP"}
CURRENCY_CODES = ("EUR", "USD", "GBP", "CHF")

DATE_HEADER_KEYS = {
    "date",
    "bookingdate",
    "valuedate",
    "transactiondate",
    "buchungstag",
    "datum",
    "createdat",
    "timestamp",
    "time",
}
DESCRIPTION_HEADER_KEYS = {
    "description",
    "merchant",
    "details",
    "reference",
    "payee",
    "counterparty",
    "name",
    "verwendungszweck",
    "bookingtext",
}
AMOUNT_HEADER_KEYS = {"amount", "transactionamount", "sum", "betrag", "value"}
DEBIT_HEADER_KEYS = {"debit", "withdrawal", "outgoing", "paidout", "lastschrift"}
CREDIT_HEADER_KEYS = {"credit", "deposit", "incoming", "paidin", "gutschrift"}
CURRENCY_HEADER_KEYS = {"currency", "ccy", "currencycode", "wahrung"}
NOTE_HEADER_KEYS = {"note", "notes", "memo", "comment", "purpose"}
EXTERNAL_ID_HEADER_KEYS = {"id", "transactionid", "referenceid", "externalid", "bookingid"}


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _resolve_header(
    header_lookup: dict[str, str], preferred: set[str], fallback_contains: set[str] | None = None
) -> str | None:
    for key in preferred:
        if key in header_lookup:
            return header_lookup[key]
    if fallback_contains is None:
        return None
    for normalized, original in header_lookup.items():
        if any(token in normalized for token in fallback_contains):
            return original
    return None


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _parse_date_value(raw: Any) -> datetime | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    try:
        return _ensure_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        pass
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _parse_amount_value(raw: Any) -> float | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None

    negative = False
    if "(" in value and ")" in value:
        negative = True
    if value.endswith("-"):
        negative = True

    cleaned = re.sub(r"[^0-9,.\-]", "", value)
    if not cleaned:
        return None

    if cleaned.count(",") > 0 and cleaned.count(".") > 0:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif cleaned.count(",") > 0:
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            cleaned = ".".join(parts)
        else:
            cleaned = "".join(parts)
    elif cleaned.count(".") > 1:
        cleaned = cleaned.replace(".", "")

    try:
        amount = float(cleaned)
    except ValueError:
        return None

    if negative and amount > 0:
        amount *= -1
    return amount


def _parse_currency_value(raw: Any, default_currency: str) -> str:
    if raw is None:
        return default_currency
    value = str(raw).strip()
    if not value:
        return default_currency
    if value in CURRENCY_SYMBOLS:
        return CURRENCY_SYMBOLS[value]
    letters = re.sub(r"[^A-Za-z]", "", value).upper()
    if len(letters) >= 3:
        return letters[:3]
    return default_currency


def _extract_currency_from_text(text: str, default_currency: str) -> str:
    for symbol, code in CURRENCY_SYMBOLS.items():
        if symbol in text:
            return code
    upper_text = text.upper()
    for code in CURRENCY_CODES:
        if code in upper_text:
            return code
    return default_currency


def _decode_bytes(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unable to decode uploaded file. Please use UTF-8/Latin-1 encoded CSV.",
    )


def _transaction_fingerprint(account_id: int, occurred_at: datetime, amount: float, description: str) -> str:
    payload = f"{account_id}|{occurred_at.date().isoformat()}|{amount:.2f}|{_normalize_space(description).lower()}"
    return sha256(payload.encode("utf-8")).hexdigest()


def _base_row(line_number: int) -> dict[str, Any]:
    return {
        "line_number": line_number,
        "category_id": None,
        "description": "",
        "note": None,
        "currency": "",
        "amount": None,
        "occurred_at": None,
        "external_id": None,
        "is_duplicate": False,
        "duplicate_reason": None,
        "error": None,
        "selected": True,
    }


def _parse_csv_rows(raw: bytes, default_currency: str) -> tuple[list[dict[str, Any]], list[str]]:
    text = _decode_bytes(raw)
    sample = text[:4096]

    delimiter = ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file must include a header row.",
        )

    header_lookup = {_normalize_header(name): name for name in reader.fieldnames if name}
    date_col = _resolve_header(header_lookup, DATE_HEADER_KEYS, {"date", "datum", "time"})
    description_col = _resolve_header(
        header_lookup, DESCRIPTION_HEADER_KEYS, {"description", "merchant", "reference"}
    )
    amount_col = _resolve_header(header_lookup, AMOUNT_HEADER_KEYS, {"amount", "betrag"})
    debit_col = _resolve_header(header_lookup, DEBIT_HEADER_KEYS, {"debit", "withdraw"})
    credit_col = _resolve_header(header_lookup, CREDIT_HEADER_KEYS, {"credit", "deposit", "incoming"})
    currency_col = _resolve_header(header_lookup, CURRENCY_HEADER_KEYS, {"currency", "ccy"})
    note_col = _resolve_header(header_lookup, NOTE_HEADER_KEYS, {"note", "memo", "comment"})
    external_id_col = _resolve_header(header_lookup, EXTERNAL_ID_HEADER_KEYS, {"id", "reference"})

    warnings: list[str] = []
    if amount_col is None and debit_col is None and credit_col is None:
        warnings.append("No amount columns detected. Expected Amount or Debit/Credit columns.")
    if date_col is None:
        warnings.append("No date column detected. Expected Date/Booking Date.")

    rows: list[dict[str, Any]] = []
    for line_number, row in enumerate(reader, start=2):
        parsed = _base_row(line_number)
        errors: list[str] = []

        description_raw = row.get(description_col, "") if description_col else ""
        note_raw = row.get(note_col, "") if note_col else ""
        description = _normalize_space(str(description_raw or ""))
        note = _normalize_space(str(note_raw or ""))
        if not description and note:
            description = note
        if not description:
            errors.append("Description is required")

        occurred_at = _parse_date_value(row.get(date_col) if date_col else None)
        if occurred_at is None:
            errors.append("Unable to parse date")

        amount: float | None = None
        if amount_col:
            amount = _parse_amount_value(row.get(amount_col))
        else:
            debit_raw = _parse_amount_value(row.get(debit_col) if debit_col else None)
            credit_raw = _parse_amount_value(row.get(credit_col) if credit_col else None)
            debit_abs = abs(debit_raw) if debit_raw is not None else None
            credit_abs = abs(credit_raw) if credit_raw is not None else None
            if debit_abs is not None and credit_abs is not None:
                amount = credit_abs - debit_abs
            elif debit_abs is not None:
                amount = -debit_abs
            elif credit_abs is not None:
                amount = credit_abs

        if amount is None or amount == 0:
            errors.append("Unable to parse non-zero amount")

        currency = _parse_currency_value(row.get(currency_col) if currency_col else None, default_currency)
        if len(currency) != 3:
            errors.append("Currency must be a 3-letter code")

        external_id_raw = row.get(external_id_col) if external_id_col else None
        external_id = _normalize_space(str(external_id_raw or "")) or None

        parsed["description"] = description
        parsed["note"] = note or None
        parsed["currency"] = currency
        parsed["amount"] = amount
        parsed["occurred_at"] = occurred_at
        parsed["external_id"] = external_id
        if errors:
            parsed["error"] = "; ".join(errors)
            parsed["selected"] = False

        rows.append(parsed)

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file does not contain any transaction rows.",
        )

    return rows, warnings


def _parse_pdf_rows(raw: bytes, default_currency: str) -> tuple[list[dict[str, Any]], list[str]]:
    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to read PDF file. Please upload a text-based bank statement PDF.",
        ) from exc

    lines: list[tuple[int, str]] = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        for line_index, line in enumerate(text.splitlines(), start=1):
            normalized = _normalize_space(line)
            if normalized:
                lines.append((page_index * 10000 + line_index, normalized))

    if not lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No extractable text found in PDF. For scanned PDFs, OCR support is required.",
        )

    rows: list[dict[str, Any]] = []
    for line_number, line in lines:
        date_match = DATE_REGEX.search(line)
        amount_match = None
        for match in AMOUNT_REGEX.finditer(line):
            amount_match = match
        if not date_match or not amount_match:
            continue

        date_text = date_match.group(0)
        amount_text = amount_match.group(0)
        occurred_at = _parse_date_value(date_text)
        amount = _parse_amount_value(amount_text)
        if occurred_at is None or amount is None or amount == 0:
            continue

        description = _normalize_space(line.replace(date_text, " ").replace(amount_text, " "))
        if not description:
            description = "Statement transaction"

        parsed = _base_row(line_number)
        parsed["description"] = description
        parsed["currency"] = _extract_currency_from_text(line, default_currency)
        parsed["amount"] = amount
        parsed["occurred_at"] = occurred_at
        rows.append(parsed)

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No transactions could be extracted from the PDF. Upload a text-based statement.",
        )

    return rows, ["PDF import is line-based and may require reviewing descriptions before commit."]


def _annotate_duplicate_rows(
    db: Session,
    user_id: int,
    account_id: int,
    rows: list[dict[str, Any]],
    *,
    mutate_selection: bool,
) -> None:
    valid_rows = [
        row
        for row in rows
        if row.get("error") is None and row.get("occurred_at") is not None and row.get("amount") is not None
    ]
    if not valid_rows:
        return

    external_ids = [str(row["external_id"]) for row in valid_rows if row.get("external_id")]
    existing_external_ids: set[str] = set()
    if external_ids:
        existing_external_ids = {
            value
            for (value,) in db.query(Transaction.external_id)
            .filter(
                Transaction.user_id == user_id,
                Transaction.account_id == account_id,
                Transaction.external_id.is_not(None),
                Transaction.external_id.in_(external_ids),
            )
            .all()
            if value
        }

    existing_rows = (
        db.query(Transaction.description, Transaction.amount, Transaction.occurred_at)
        .filter(Transaction.user_id == user_id, Transaction.account_id == account_id)
        .all()
    )
    existing_fingerprints = {
        _transaction_fingerprint(
            account_id=account_id,
            occurred_at=_ensure_utc(occurred_at),
            amount=float(amount),
            description=description,
        )
        for description, amount, occurred_at in existing_rows
    }

    seen_external_ids: set[str] = set()
    seen_fingerprints: set[str] = set()

    for row in rows:
        if row.get("error") is not None:
            if mutate_selection:
                row["selected"] = False
            continue

        occurred_at = row.get("occurred_at")
        amount = row.get("amount")
        description = row.get("description", "")
        if occurred_at is None or amount is None or not description:
            row["error"] = row.get("error") or "Incomplete row data"
            if mutate_selection:
                row["selected"] = False
            continue

        external_id = row.get("external_id")
        if external_id:
            if external_id in seen_external_ids:
                row["is_duplicate"] = True
                row["duplicate_reason"] = "Duplicate in uploaded file (external id)"
                if mutate_selection:
                    row["selected"] = False
                continue
            if external_id in existing_external_ids:
                row["is_duplicate"] = True
                row["duplicate_reason"] = "Already exists (external id)"
                if mutate_selection:
                    row["selected"] = False
                continue

        fingerprint = _transaction_fingerprint(
            account_id=account_id,
            occurred_at=_ensure_utc(occurred_at),
            amount=float(amount),
            description=description,
        )
        if fingerprint in seen_fingerprints:
            row["is_duplicate"] = True
            row["duplicate_reason"] = "Duplicate in uploaded file"
            if mutate_selection:
                row["selected"] = False
            continue
        if fingerprint in existing_fingerprints:
            row["is_duplicate"] = True
            row["duplicate_reason"] = "Already exists"
            if mutate_selection:
                row["selected"] = False
            continue

        if external_id:
            seen_external_ids.add(external_id)
        seen_fingerprints.add(fingerprint)


def _load_account_or_404(db: Session, user_id: int, account_id: int) -> Account:
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == user_id).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


@router.post("/transactions/preview", response_model=TransactionImportPreviewResponse)
async def preview_statement_import(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionImportPreviewResponse:
    account = _load_account_or_404(db, current_user.id, account_id)

    filename = file.filename or "statement"
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(raw) > MAX_IMPORT_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Uploaded file is too large. Max size is 5MB.",
        )

    lower_name = filename.lower()
    if lower_name.endswith(".csv"):
        source_type = "csv"
        rows, warnings = _parse_csv_rows(raw, account.currency)
    elif lower_name.endswith(".pdf"):
        source_type = "pdf"
        rows, warnings = _parse_pdf_rows(raw, account.currency)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Upload a CSV or PDF statement.",
        )

    _annotate_duplicate_rows(
        db,
        current_user.id,
        account.id,
        rows,
        mutate_selection=True,
    )

    return TransactionImportPreviewResponse(
        source_type=source_type,
        filename=filename,
        total_rows=len(rows),
        parsed_rows=len([row for row in rows if row.get("error") is None]),
        valid_rows=len(
            [row for row in rows if row.get("error") is None and row.get("is_duplicate") is False]
        ),
        duplicate_rows=len([row for row in rows if row.get("is_duplicate")]),
        invalid_rows=len([row for row in rows if row.get("error") is not None]),
        warnings=warnings,
        rows=rows,
    )


@router.post(
    "/transactions/commit",
    response_model=TransactionImportCommitResponse,
    status_code=status.HTTP_201_CREATED,
)
def commit_statement_import(
    payload: TransactionImportCommitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionImportCommitResponse:
    account = _load_account_or_404(db, current_user.id, payload.account_id)
    if not payload.rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows provided")

    rows = [row.model_dump() for row in payload.rows]
    _annotate_duplicate_rows(
        db,
        current_user.id,
        account.id,
        rows,
        mutate_selection=False,
    )

    skipped_invalid = 0
    skipped_duplicates = 0
    created: list[Transaction] = []

    for row in rows:
        if not row.get("selected", True):
            continue
        if row.get("error") is not None:
            skipped_invalid += 1
            continue
        if row.get("is_duplicate"):
            skipped_duplicates += 1
            continue

        description = _normalize_space(str(row.get("description") or ""))
        amount = row.get("amount")
        occurred_at = row.get("occurred_at")
        currency = _parse_currency_value(row.get("currency"), account.currency)
        note = _normalize_space(str(row.get("note") or "")) or None
        external_id = _normalize_space(str(row.get("external_id") or "")) or None
        category_id = row.get("category_id")

        if not description or amount is None or amount == 0 or occurred_at is None or len(currency) != 3:
            skipped_invalid += 1
            continue

        transaction = Transaction(
            user_id=current_user.id,
            account_id=account.id,
            category_id=category_id,
            external_id=external_id,
            description=description,
            note=note,
            currency=currency,
            amount=float(amount),
            occurred_at=_ensure_utc(occurred_at),
            is_manual=True,
        )
        db.add(transaction)
        created.append(transaction)

    if created:
        db.commit()
        for transaction in created:
            db.refresh(transaction)
    else:
        db.rollback()

    return TransactionImportCommitResponse(
        imported_count=len(created),
        skipped_duplicates=skipped_duplicates,
        skipped_invalid=skipped_invalid,
        transaction_ids=[transaction.id for transaction in created],
    )
