"""baseline

Revision ID: 8f13a4df09b5
Revises:
Create Date: 2026-08-10 22:58:24.701350

"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "8f13a4df09b5"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
