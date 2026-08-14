"""Allow collision-free photo ordering and compact existing gaps.

Revision ID: f22_1_photo_order_fix
Revises: f22_1_body_progress_photos
Create Date: 2026-08-14 00:00:01.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f22_1_photo_order_fix"
down_revision: Union[str, Sequence[str], None] = "f22_1_body_progress_photos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Permit internal temporary slots and repair any pre-fix order gaps."""
    with op.batch_alter_table("body_progress_photos") as batch_op:
        batch_op.drop_constraint("ck_body_progress_photos_display_order", type_="check")
        batch_op.create_check_constraint(
            "ck_body_progress_photos_display_order",
            "display_order >= 0 AND display_order <= 9",
        )

    # Existing versions could leave gaps after deletion. Move every value into
    # the internal range first so the unique constraint cannot collide while
    # rows are compacted back to their public zero-based order.
    op.execute(sa.text("UPDATE body_progress_photos SET display_order = display_order + 5"))
    op.execute(
        sa.text(
            "WITH ranked AS ("
            " SELECT id, ROW_NUMBER() OVER ("
            "  PARTITION BY measurement_id ORDER BY display_order, id"
            " ) - 1 AS new_order"
            " FROM body_progress_photos"
            ") "
            "UPDATE body_progress_photos "
            "SET display_order = ("
            " SELECT ranked.new_order FROM ranked WHERE ranked.id = body_progress_photos.id"
            ")"
        )
    )


def downgrade() -> None:
    """Restore the original persisted-order constraint."""
    with op.batch_alter_table("body_progress_photos") as batch_op:
        batch_op.drop_constraint("ck_body_progress_photos_display_order", type_="check")
        batch_op.create_check_constraint(
            "ck_body_progress_photos_display_order",
            "display_order >= 0 AND display_order <= 4",
        )
