"""add category rules

Revision ID: d6e2c98f3b1a
Revises: a2c4d9f1e8ab
Create Date: 2026-02-18 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d6e2c98f3b1a"
down_revision = "a2c4d9f1e8ab"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "category_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("pattern", sa.String(length=160), nullable=False),
        sa.Column(
            "match_type",
            sa.String(length=20),
            nullable=False,
            server_default="contains",
        ),
        sa.Column(
            "applies_to_kind",
            sa.String(length=20),
            nullable=False,
            server_default="all",
        ),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("case_sensitive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.CheckConstraint(
            "match_type IN ('contains', 'starts_with', 'equals', 'regex')",
            name="ck_category_rules_match_type",
        ),
        sa.CheckConstraint(
            "applies_to_kind IN ('all', 'expense', 'income')",
            name="ck_category_rules_applies_to_kind",
        ),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_category_rules_user_id"), "category_rules", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_category_rules_category_id"),
        "category_rules",
        ["category_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_category_rules_category_id"), table_name="category_rules")
    op.drop_index(op.f("ix_category_rules_user_id"), table_name="category_rules")
    op.drop_table("category_rules")

