"""Add is_active to transcript_chunks, replace unique constraint with active partial index, and create HNSW vector index

Implements Findings BA1 & BA2:
- Soft-deletion flag on transcript_chunks to preserve historical citations in message_sources
- Partial unique index allowing active/inactive chunk versions to coexist
- HNSW cosine index on transcript_chunks.embedding for accelerated vector retrieval

Revision ID: 0005_hnsw_and_chunk_soft_delete
Revises: 0004_deliverable_constraints
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_hnsw_and_chunk_soft_delete"
down_revision: str | None = "0004_deliverable_constraints"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add is_active column with default True (BA1)
    op.add_column(
        "transcript_chunks",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    # 2. Drop unconditioned unique constraint so re-indexed chunks can coexist with inactive ones
    op.drop_constraint(
        "uq_transcript_chunks_source_chunk",
        "transcript_chunks",
        type_="unique",
    )

    # 3. Partial unique index enforcing uniqueness ONLY among active chunks
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_transcript_chunks_source_chunk_active "
        "ON transcript_chunks (source_id, chunk_index) WHERE is_active = TRUE"
    )

    # 4. Partial index for fast active chunk lookup by source_id
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_transcript_chunks_active "
        "ON transcript_chunks (source_id) WHERE is_active = TRUE"
    )

    # 5. HNSW vector index for cosine distance similarity search (BA2)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_transcript_chunks_embedding_hnsw "
        "ON transcript_chunks USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_transcript_chunks_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_transcript_chunks_active")
    op.execute("DROP INDEX IF EXISTS uq_transcript_chunks_source_chunk_active")
    op.create_unique_constraint(
        "uq_transcript_chunks_source_chunk",
        "transcript_chunks",
        ["source_id", "chunk_index"],
    )
    op.drop_column("transcript_chunks", "is_active")
