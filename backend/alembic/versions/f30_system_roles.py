"""Add the closed system role to users.

Revision ID: f30_system_roles
Revises: f27_auto_start
Create Date: 2026-08-31 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f30_system_roles"
down_revision: Union[str, Sequence[str], None] = "f27_auto_start"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a non-null role column defaulting to 'user' for existing accounts."""
    op.execute(
        "ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'user' "
        "CHECK (role IN ('user', 'admin'))"
    )


def downgrade() -> None:
    """Remove the system role column."""
    op.execute("ALTER TABLE users DROP COLUMN role")
