from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.user import User
from app.schemas.category_rule import CategoryRuleCreate, CategoryRuleOut, CategoryRuleUpdate
from app.services.category_rules import validate_rule_pattern

router = APIRouter()


def _get_user_category_or_404(db: Session, user_id: int, category_id: int) -> Category:
    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user_id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


def _validate_kind_alignment(category_kind: str, applies_to_kind: str) -> None:
    if applies_to_kind == "all":
        return
    if category_kind.lower() != applies_to_kind:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule applies_to_kind must match the selected category kind",
        )


@router.get("", response_model=list[CategoryRuleOut])
def list_category_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryRuleOut]:
    return (
        db.query(CategoryRule)
        .filter(CategoryRule.user_id == current_user.id)
        .order_by(CategoryRule.priority.asc(), CategoryRule.id.asc())
        .all()
    )


@router.post("", response_model=CategoryRuleOut, status_code=status.HTTP_201_CREATED)
def create_category_rule(
    payload: CategoryRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryRuleOut:
    category = _get_user_category_or_404(db, current_user.id, payload.category_id)
    _validate_kind_alignment(category.kind, payload.applies_to_kind)
    try:
        pattern = validate_rule_pattern(payload.pattern, payload.match_type)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rule = CategoryRule(
        user_id=current_user.id,
        category_id=payload.category_id,
        pattern=pattern,
        match_type=payload.match_type,
        applies_to_kind=payload.applies_to_kind,
        priority=payload.priority,
        case_sensitive=payload.case_sensitive,
        is_active=payload.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/{rule_id}", response_model=CategoryRuleOut)
def update_category_rule(
    rule_id: int,
    payload: CategoryRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryRuleOut:
    rule = (
        db.query(CategoryRule)
        .filter(CategoryRule.id == rule_id, CategoryRule.user_id == current_user.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category rule not found")

    updates = payload.model_dump(exclude_unset=True)
    next_category_id = updates.get("category_id", rule.category_id)
    next_match_type = updates.get("match_type", rule.match_type)
    next_pattern = updates.get("pattern", rule.pattern)
    next_applies_to_kind = updates.get("applies_to_kind", rule.applies_to_kind)

    category = _get_user_category_or_404(db, current_user.id, next_category_id)
    _validate_kind_alignment(category.kind, next_applies_to_kind)
    try:
        validated_pattern = validate_rule_pattern(next_pattern, next_match_type)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    updates["pattern"] = validated_pattern
    for field, value in updates.items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    rule = (
        db.query(CategoryRule)
        .filter(CategoryRule.id == rule_id, CategoryRule.user_id == current_user.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category rule not found")
    db.delete(rule)
    db.commit()
    return None

