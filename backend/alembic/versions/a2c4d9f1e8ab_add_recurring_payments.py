"""add recurring payments

Revision ID: a2c4d9f1e8ab
Revises: 9ed5a4dda75e
Create Date: 2026-02-17 22:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a2c4d9f1e8ab"
down_revision = "9ed5a4dda75e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recurring_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount", sa.Numeric(precision=16, scale=2), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("interval", sa.Integer(), nullable=False),
        sa.Column("next_due_date", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recurring_payments_user_id"), "recurring_payments", ["user_id"], unique=False)
    op.create_index(op.f("ix_recurring_payments_account_id"), "recurring_payments", ["account_id"], unique=False)
    op.create_index(op.f("ix_recurring_payments_next_due_date"), "recurring_payments", ["next_due_date"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_recurring_payments_next_due_date"), table_name="recurring_payments")
    op.drop_index(op.f("ix_recurring_payments_account_id"), table_name="recurring_payments")
    op.drop_index(op.f("ix_recurring_payments_user_id"), table_name="recurring_payments")
    op.drop_table("recurring_payments")
