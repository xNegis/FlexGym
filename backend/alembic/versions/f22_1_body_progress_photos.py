"""Add body progress photo metadata and deletion-retry persistence.

Revision ID: f22_1_body_progress_photos
Revises: f22_body_weight
Create Date: 2026-08-14 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f22_1_body_progress_photos"
down_revision: Union[str, Sequence[str], None] = "f22_body_weight"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("photo_storage_namespace", sa.Uuid(), nullable=True),
        )
        batch_op.create_unique_constraint(
            "uq_users_photo_storage_namespace",
            ["photo_storage_namespace"],
        )

    op.create_table(
        "body_progress_photos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "measurement_id",
            sa.Integer(),
            sa.ForeignKey("body_weight_measurements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "measurement_id",
            "display_order",
            name="uq_body_progress_photo_measurement_order",
        ),
        sa.UniqueConstraint("object_key", name="uq_body_progress_photos_object_key"),
        sa.CheckConstraint(
            "display_order >= 0 AND display_order <= 4",
            name="ck_body_progress_photos_display_order",
        ),
    )
    op.create_index(
        "ix_body_progress_photos_measurement_id",
        "body_progress_photos",
        ["measurement_id"],
    )

    op.create_table(
        "photo_deletions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_key", name="uq_photo_deletions_object_key"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("photo_deletions")
    op.drop_table("body_progress_photos")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("uq_users_photo_storage_namespace", type_="unique")
        batch_op.drop_column("photo_storage_namespace")
