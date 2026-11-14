"""Add immutable OJ review snapshots.

Revision ID: 7b1f5e2c90aa
Revises: 4d452c2958ba
"""
from alembic import op
import sqlalchemy as sa

revision = "7b1f5e2c90aa"
down_revision = "4d452c2958ba"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "oj_problem_reviews",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("problem_id", sa.BigInteger(), sa.ForeignKey("oj_problems.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reviewed_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("state", sa.String(30), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("base_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("review_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("state IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')", name="ck_oj_problem_reviews_state"),
    )
    op.create_index("ix_oj_problem_reviews_problem_id", "oj_problem_reviews", ["problem_id"])
    op.create_index("ix_oj_problem_reviews_state", "oj_problem_reviews", ["state"])

def downgrade():
    op.drop_index("ix_oj_problem_reviews_state", table_name="oj_problem_reviews")
    op.drop_index("ix_oj_problem_reviews_problem_id", table_name="oj_problem_reviews")
    op.drop_table("oj_problem_reviews")
