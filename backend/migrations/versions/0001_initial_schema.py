"""initial schema with pgvector and persistent entities

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-09 14:05:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector  # type: ignore[import-not-found,import-untyped]
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Table: chat_sessions
    op.create_table(
        'chat_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False, server_default='New Chat'),
        sa.Column('provider', sa.String(length=32), nullable=False, server_default='local'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # 3. Table: messages
    op.create_table(
        'messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('mode', sa.String(length=32), nullable=False, server_default='research'),
        sa.Column('provider', sa.String(length=32), nullable=False, server_default='local'),
        sa.Column('model_id', sa.String(length=64), nullable=False, server_default='qwen2.5:1.5b'),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='complete'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_messages_session_id', 'messages', ['session_id'])
    op.create_index('ix_messages_created_at', 'messages', ['created_at'])

    # 4. Table: transcript_sources
    op.create_table(
        'transcript_sources',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('source_key', sa.String(length=255), unique=True, nullable=False),
        sa.Column('title', sa.String(length=512), nullable=False),
        sa.Column('guest', sa.String(length=255), nullable=True),
        sa.Column('episode_url', sa.Text(), nullable=True),
        sa.Column('publish_date', sa.Date(), nullable=True),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_transcript_sources_source_key', 'transcript_sources', ['source_key'])

    # 5. Table: transcript_chunks
    op.create_table(
        'transcript_chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('transcript_sources.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('token_count', sa.Integer(), nullable=False),
        sa.Column('embedding', Vector(768), nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_transcript_chunks_source_id', 'transcript_chunks', ['source_id'])

    # 6. Table: message_sources
    op.create_table(
        'message_sources',
        sa.Column('message_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chunk_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('transcript_chunks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('evidence_id', sa.String(length=16), nullable=False),
        sa.Column('supports', sa.Text(), nullable=True),
        sa.Column('retrieval_rank', sa.Integer(), nullable=False),
        sa.Column('semantic_score', sa.Float(), nullable=True),
        sa.Column('keyword_score', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('message_id', 'chunk_id'),
    )

    # 7. Table: growth_briefs
    op.create_table(
        'growth_briefs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_message_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('messages.id', ondelete='SET NULL'), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='draft'),
        sa.Column('product_context', sa.Text(), nullable=True),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_growth_briefs_session_id', 'growth_briefs', ['session_id'])

    # 8. Table: artifacts
    op.create_table(
        'artifacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_message_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('messages.id', ondelete='SET NULL'), nullable=True),
        sa.Column('growth_brief_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('growth_briefs.id', ondelete='SET NULL'), nullable=True),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('preview_content', sa.Text(), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_artifacts_session_id', 'artifacts', ['session_id'])


def downgrade() -> None:
    op.drop_table('artifacts')
    op.drop_table('growth_briefs')
    op.drop_table('message_sources')
    op.drop_table('transcript_chunks')
    op.drop_table('transcript_sources')
    op.drop_table('messages')
    op.drop_table('chat_sessions')
    op.execute("DROP EXTENSION IF EXISTS vector;")
