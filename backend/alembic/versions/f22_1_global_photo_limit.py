"""Serialize installation-wide body-progress photo capacity checks.

Revision ID: f22_1_global_photo_limit
Revises: f22_1_photo_order_fix
Create Date: 2026-08-14 00:00:02.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f22_1_global_photo_limit"
down_revision: Union[str, Sequence[str], None] = "f22_1_photo_order_fix"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the singleton row used to serialize global capacity checks."""
    table = op.create_table(
        "photo_storage_quota_lock",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_photo_storage_quota_lock_singleton"),
        sa.CheckConstraint(
            "revision >= 0", name="ck_photo_storage_quota_lock_revision_nonnegative"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.bulk_insert(table, [{"id": 1, "revision": 0}])


def downgrade() -> None:
    """Remove global upload serialization state."""
    op.drop_table("photo_storage_quota_lock")
