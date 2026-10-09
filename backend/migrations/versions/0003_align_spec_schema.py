"""align schema with IMPLEMENTATION_SPEC.md §5

Revision ID: 0003_align_spec_schema
Revises: 0002_add_users
Create Date: 2026-10-09 18:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_align_spec_schema"
down_revision: str | None = "0002_add_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. users table alignments
    op.add_column(
        "users",
        sa.Column("display_name", sa.Text(), nullable=False, server_default="User"),
    )
    op.alter_column(
        "users", "email", existing_type=sa.String(length=255), nullable=True
    )
    op.add_column(
        "users",
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    # Populate display_name from existing full_name if present
    op.execute(
        "UPDATE users SET display_name = COALESCE(full_name, 'User') WHERE display_name = 'User';"
    )

    # 2. chat_sessions table alignments
    op.add_column(
        "chat_sessions",
        sa.Column(
            "provider_preference", sa.Text(), nullable=False, server_default="local"
        ),
    )
    op.add_column(
        "chat_sessions",
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "chat_sessions",
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_check_constraint(
        "chk_chat_sessions_provider_preference",
        "chat_sessions",
        "provider_preference IN ('local', 'cloud')",
    )

    # 3. messages table alignments
    op.add_column(
        "messages",
        sa.Column("workflow_mode", sa.Text(), nullable=True, server_default="research"),
    )
    op.add_column("messages", sa.Column("error_code", sa.Text(), nullable=True))
    op.add_column(
        "messages", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "messages",
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_check_constraint(
        "chk_messages_role",
        "messages",
        "role IN ('user', 'assistant')",
    )
    op.create_check_constraint(
        "chk_messages_status",
        "messages",
        "status IN ('pending', 'complete', 'failed', 'cancelled')",
    )
    op.create_check_constraint(
        "chk_messages_provider",
        "messages",
        "provider IS NULL OR provider IN ('local', 'cloud')",
    )

    # 4. transcript_sources table alignments
    op.add_column(
        "transcript_sources",
        sa.Column("upstream_path", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column("transcript_sources", sa.Column("video_id", sa.Text(), nullable=True))
    op.add_column(
        "transcript_sources", sa.Column("description", sa.Text(), nullable=True)
    )
    op.add_column(
        "transcript_sources", sa.Column("repo_commit", sa.Text(), nullable=True)
    )
    op.add_column(
        "transcript_sources",
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # 5. transcript_chunks table alignments
    op.add_column(
        "transcript_chunks", sa.Column("char_start", sa.Integer(), nullable=True)
    )
    op.add_column(
        "transcript_chunks", sa.Column("char_end", sa.Integer(), nullable=True)
    )
    op.create_unique_constraint(
        "uq_transcript_chunks_source_chunk",
        "transcript_chunks",
        ["source_id", "chunk_index"],
    )

    # Add TSVECTOR computed stored search_vector column and GIN index
    op.execute(
        "ALTER TABLE transcript_chunks ADD COLUMN search_vector tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', COALESCE(content, ''))) STORED;"
    )
    op.execute(
        "CREATE INDEX ix_transcript_chunks_search_vector ON transcript_chunks USING gin(search_vector);"
    )


def downgrade() -> None:
    # 5. transcript_chunks
    op.execute("DROP INDEX IF EXISTS ix_transcript_chunks_search_vector;")
    op.drop_column("transcript_chunks", "search_vector")
    op.drop_constraint(
        "uq_transcript_chunks_source_chunk", "transcript_chunks", type_="unique"
    )
    op.drop_column("transcript_chunks", "char_end")
    op.drop_column("transcript_chunks", "char_start")

    # 4. transcript_sources
    op.drop_column("transcript_sources", "ingested_at")
    op.drop_column("transcript_sources", "repo_commit")
    op.drop_column("transcript_sources", "description")
    op.drop_column("transcript_sources", "video_id")
    op.drop_column("transcript_sources", "upstream_path")

    # 3. messages
    op.drop_constraint("chk_messages_provider", "messages", type_="check")
    op.drop_constraint("chk_messages_status", "messages", type_="check")
    op.drop_constraint("chk_messages_role", "messages", type_="check")
    op.drop_column("messages", "metadata")
    op.drop_column("messages", "completed_at")
    op.drop_column("messages", "error_code")
    op.drop_column("messages", "workflow_mode")

    # 2. chat_sessions
    op.drop_constraint(
        "chk_chat_sessions_provider_preference", "chat_sessions", type_="check"
    )
    op.drop_column("chat_sessions", "metadata")
    op.drop_column("chat_sessions", "last_message_at")
    op.drop_column("chat_sessions", "provider_preference")

    # 1. users
    op.drop_column("users", "metadata")
    op.alter_column(
        "users", "email", existing_type=sa.String(length=255), nullable=False
    )
    op.drop_column("users", "display_name")
