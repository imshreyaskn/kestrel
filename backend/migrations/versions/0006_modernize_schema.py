"""Modernize schema: monotonic message seq, idempotency key, purge legacy duplicate columns

Revision ID: 0006_modernize_schema
Revises: 0005_hnsw_and_chunk_soft_delete
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_modernize_schema"
down_revision: str | None = "0005_hnsw_and_chunk_soft_delete"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Monotonic message sequence column (BA17 / spec §5.3)
    op.add_column(
        "messages",
        sa.Column(
            "seq",
            sa.BigInteger(),
            sa.Identity(start=1),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_messages_session_seq",
        "messages",
        ["session_id", "seq"],
    )

    # 2. Idempotency key support for message turn creation (BA15)
    op.add_column(
        "messages",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_messages_session_idempotency",
        "messages",
        ["session_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    # 3. Purge legacy duplicate columns (BA16)
    # - messages.mode is redundant with messages.workflow_mode (spec §5.3)
    op.drop_column("messages", "mode")
    # - chat_sessions.provider is redundant with chat_sessions.provider_preference (spec §5.2)
    op.drop_column("chat_sessions", "provider")
    # - users.full_name is redundant with users.display_name (spec §5.1)
    op.drop_column("users", "full_name")


def downgrade() -> None:
    # Re-add purged columns
    op.add_column(
        "users",
        sa.Column("full_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "chat_sessions",
        sa.Column(
            "provider", sa.String(length=32), nullable=False, server_default="local"
        ),
    )
    op.add_column(
        "messages",
        sa.Column(
            "mode", sa.String(length=32), nullable=False, server_default="research"
        ),
    )

    # Drop idempotency key
    op.drop_index(
        "ix_messages_session_idempotency",
        table_name="messages",
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.drop_column("messages", "idempotency_key")

    # Drop seq column
    op.drop_index("ix_messages_session_seq", table_name="messages")
    op.drop_column("messages", "seq")
