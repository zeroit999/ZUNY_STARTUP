"""add OJ contests

Revision ID: 9c4a8d1e2f30
Revises: 7b1f5e2c90aa
"""
from alembic import op
import sqlalchemy as sa

revision = "9c4a8d1e2f30"
down_revision = "7b1f5e2c90aa"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "oj_contests",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')", name="ck_oj_contests_status"),
        sa.CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_oj_contests_dates"),
    )
    op.create_index("ix_oj_contests_status", "oj_contests", ["status"])
    op.create_index("ix_oj_contests_created_by", "oj_contests", ["created_by"])
    op.create_table(
        "oj_contest_problems",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("contest_id", sa.BigInteger(), sa.ForeignKey("oj_contests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("problem_id", sa.BigInteger(), sa.ForeignKey("oj_problems.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.UniqueConstraint("contest_id", "problem_id", name="uq_oj_contest_problem"),
        sa.UniqueConstraint("contest_id", "position", name="uq_oj_contest_position"),
    )
    op.create_index("ix_oj_contest_problems_contest_id", "oj_contest_problems", ["contest_id"])
    op.create_index("ix_oj_contest_problems_problem_id", "oj_contest_problems", ["problem_id"])


def downgrade():
    op.drop_table("oj_contest_problems")
    op.drop_index("ix_oj_contests_created_by", table_name="oj_contests")
    op.drop_index("ix_oj_contests_status", table_name="oj_contests")
    op.drop_table("oj_contests")
