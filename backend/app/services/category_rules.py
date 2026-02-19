import re

from sqlalchemy.orm import Session

from app.models.category_rule import CategoryRule

ALLOWED_MATCH_TYPES = {"contains", "starts_with", "equals", "regex"}
ALLOWED_APPLIES_TO_KIND = {"all", "expense", "income"}


def normalize_rule_pattern(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def transaction_kind_from_amount(amount: float) -> str:
    return "expense" if float(amount) < 0 else "income"


def validate_rule_pattern(pattern: str, match_type: str) -> str:
    normalized = normalize_rule_pattern(pattern)
    if not normalized:
        raise ValueError("Pattern cannot be empty")
    if match_type not in ALLOWED_MATCH_TYPES:
        raise ValueError("Unsupported match_type")
    if match_type == "regex":
        try:
            re.compile(normalized)
        except re.error as exc:
            raise ValueError("Invalid regex pattern") from exc
    return normalized


def _rule_matches_text(rule: CategoryRule, text: str) -> bool:
    if not text:
        return False

    pattern = rule.pattern
    target = text
    if not rule.case_sensitive:
        pattern = pattern.lower()
        target = target.lower()

    if rule.match_type == "contains":
        return pattern in target
    if rule.match_type == "starts_with":
        return target.startswith(pattern)
    if rule.match_type == "equals":
        return target == pattern
    if rule.match_type == "regex":
        flags = 0 if rule.case_sensitive else re.IGNORECASE
        try:
            return re.search(rule.pattern, text, flags=flags) is not None
        except re.error:
            return False
    return False


def _candidate_texts(description: str, note: str | None) -> list[str]:
    values: list[str] = []
    normalized_description = normalize_rule_pattern(description)
    if normalized_description:
        values.append(normalized_description)
    if note:
        normalized_note = normalize_rule_pattern(note)
        if normalized_note:
            values.append(normalized_note)
    if values:
        values.append(" ".join(values))
    return values


def find_matching_category_id(
    db: Session,
    user_id: int,
    *,
    description: str,
    note: str | None,
    amount: float,
) -> int | None:
    texts = _candidate_texts(description, note)
    if not texts:
        return None

    txn_kind = transaction_kind_from_amount(amount)
    rules = (
        db.query(CategoryRule)
        .filter(CategoryRule.user_id == user_id, CategoryRule.is_active.is_(True))
        .order_by(CategoryRule.priority.asc(), CategoryRule.id.asc())
        .all()
    )
    for rule in rules:
        if rule.applies_to_kind != "all" and rule.applies_to_kind != txn_kind:
            continue
        for text in texts:
            if _rule_matches_text(rule, text):
                return rule.category_id
    return None

