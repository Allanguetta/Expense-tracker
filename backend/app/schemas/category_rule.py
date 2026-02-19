from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.category_rules import normalize_rule_pattern

CategoryRuleMatchType = Literal["contains", "starts_with", "equals", "regex"]
CategoryRuleAppliesToKind = Literal["all", "expense", "income"]


class CategoryRuleCreate(BaseModel):
    category_id: int
    pattern: str = Field(min_length=1, max_length=160)
    match_type: CategoryRuleMatchType = "contains"
    applies_to_kind: CategoryRuleAppliesToKind = "all"
    priority: int = Field(default=100, ge=0, le=1000)
    case_sensitive: bool = False
    is_active: bool = True

    @field_validator("pattern")
    @classmethod
    def normalize_pattern(cls, value: str) -> str:
        normalized = normalize_rule_pattern(value)
        if not normalized:
            raise ValueError("Pattern cannot be empty")
        return normalized


class CategoryRuleUpdate(BaseModel):
    category_id: int | None = None
    pattern: str | None = Field(default=None, min_length=1, max_length=160)
    match_type: CategoryRuleMatchType | None = None
    applies_to_kind: CategoryRuleAppliesToKind | None = None
    priority: int | None = Field(default=None, ge=0, le=1000)
    case_sensitive: bool | None = None
    is_active: bool | None = None

    @field_validator("pattern")
    @classmethod
    def normalize_pattern(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = normalize_rule_pattern(value)
        if not normalized:
            raise ValueError("Pattern cannot be empty")
        return normalized


class CategoryRuleOut(BaseModel):
    id: int
    user_id: int
    category_id: int
    pattern: str
    match_type: CategoryRuleMatchType
    applies_to_kind: CategoryRuleAppliesToKind
    priority: int
    case_sensitive: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

