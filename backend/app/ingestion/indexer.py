"""
Idempotent Transcript Indexing Pipeline.
Parses, chunks, embeds, and updates PostgreSQL pgvector store.
Preserves existing chunks if content hash is unchanged.
Marks deleted upstream episodes as inactive rather than deleting records.
"""

from __future__ import annotations

import datetime
import logging
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.db.session import async_session_factory
from backend.app.ingestion.chunker import TranscriptChunker
from backend.app.ingestion.parser import TranscriptParser
from backend.app.ingestion.syncer import discover_transcripts, get_canonical_source_key
from backend.app.models.entities import TranscriptChunk, TranscriptSource
from backend.app.retrieval.embedder import EmbeddingProvider, get_embedding_provider

logger = logging.getLogger(__name__)


@dataclass
class IngestionStats:
    """Summary metrics of an ingestion or re-index run."""

    discovered: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    failed: int = 0
    inactive: int = 0
    repo_commit: str | None = None
    duration_seconds: float = 0.0
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "discovered": self.discovered,
            "created": self.created,
            "updated": self.updated,
            "skipped": self.skipped,
            "failed": self.failed,
            "inactive": self.inactive,
            "repo_commit": self.repo_commit,
            "duration_seconds": round(self.duration_seconds, 2),
            "errors": self.errors,
        }


class TranscriptIndexer:
    """Orchestrates parsing, chunking, embedding, and database persistence."""

    def __init__(
        self,
        embedder: EmbeddingProvider | None = None,
        chunker: TranscriptChunker | None = None,
        session_factory=None,
    ) -> None:
        self.embedder = embedder or get_embedding_provider()
        self.chunker = chunker or TranscriptChunker()
        self.session_factory = session_factory or async_session_factory

    async def index_directory(
        self,
        base_dir: Path,
        repo_commit: str | None = None,
        force_reindex: bool = False,
        limit: int | None = None,
    ) -> IngestionStats:
        """
        Idempotently index all discovered transcripts in base_dir.

        Args:
            base_dir: Local path to transcripts repository root.
            repo_commit: Git commit SHA of upstream data.
            force_reindex: If True, re-embed and overwrite even if content hash matches.
            limit: Maximum number of transcripts to process (useful for tests and previews).
        """
        start_time = time.monotonic()
        stats = IngestionStats(repo_commit=repo_commit)

        # 1. Discover all files
        files = discover_transcripts(base_dir)
        stats.discovered = len(files)
        logger.info("Discovered %d transcript files in %s", stats.discovered, base_dir)

        if limit and limit > 0:
            files = files[:limit]

        discovered_source_keys: set[str] = set()

        async with self.session_factory() as session:
            # 2. Process each transcript file
            for file_path in files:
                source_key = get_canonical_source_key(file_path, base_dir)
                discovered_source_keys.add(source_key)

                try:
                    await self._index_single_file(
                        session=session,
                        file_path=file_path,
                        source_key=source_key,
                        repo_commit=repo_commit,
                        force_reindex=force_reindex,
                        stats=stats,
                    )
                except Exception as e:
                    stats.failed += 1
                    err_msg = f"Failed to index {source_key}: {e}"
                    logger.exception(err_msg)
                    stats.errors.append(err_msg)

            # 3. Mark inactive any sources in DB no longer present upstream
            if not limit:  # Only reconcile inactive sources during full sync
                inactive_count = await self._reconcile_inactive_sources(
                    session=session,
                    discovered_keys=discovered_source_keys,
                )
                stats.inactive = inactive_count

        stats.duration_seconds = time.monotonic() - start_time
        logger.info(
            "Ingestion complete in %.2fs: %d created, %d updated, %d skipped, %d failed, %d inactive",
            stats.duration_seconds,
            stats.created,
            stats.updated,
            stats.skipped,
            stats.failed,
            stats.inactive,
        )
        return stats

    async def _index_single_file(
        self,
        session: AsyncSession,
        file_path: Path,
        source_key: str,
        repo_commit: str | None,
        force_reindex: bool,
        stats: IngestionStats,
    ) -> None:
        raw_text = file_path.read_text(encoding="utf-8")
        parsed = TranscriptParser.parse(raw_text, source_path=source_key)

        # Check existing source in DB
        stmt = select(TranscriptSource).where(TranscriptSource.source_key == source_key)
        res = await session.execute(stmt)
        existing_source = res.scalar_one_or_none()

        # Idempotency check: hash match & not force_reindex
        if (
            existing_source
            and existing_source.content_hash == parsed.content_hash
            and not force_reindex
        ):
            stats.skipped += 1
            logger.debug("Skipped unchanged source: %s", source_key)
            return

        # Split body into semantic chunks
        chunks = self.chunker.chunk(parsed.body)
        if not chunks:
            logger.warning("No chunks produced for transcript: %s", source_key)
            stats.skipped += 1
            return

        # Compute embeddings outside DB transaction
        chunk_texts = [c.content for c in chunks]
        embeddings = await self.embedder.embed_texts(chunk_texts)

        # Transactional update
        async with session.begin_nested():
            now = datetime.datetime.now(datetime.timezone.utc)
            if existing_source:
                # Update existing source metadata
                existing_source.title = parsed.title
                existing_source.guest = parsed.guest
                existing_source.episode_url = parsed.episode_url
                existing_source.video_id = parsed.video_id
                existing_source.publish_date = parsed.publish_date
                existing_source.description = parsed.description
                existing_source.content_hash = parsed.content_hash
                existing_source.repo_commit = repo_commit
                existing_source.is_active = True
                existing_source.updated_at = now
                source_id = existing_source.id

                # Delete old chunks
                await session.execute(
                    delete(TranscriptChunk).where(
                        TranscriptChunk.source_id == source_id
                    )
                )
                stats.updated += 1
            else:
                # Create new source
                new_source = TranscriptSource(
                    id=uuid.uuid4(),
                    source_key=source_key,
                    title=parsed.title,
                    guest=parsed.guest,
                    episode_url=parsed.episode_url,
                    video_id=parsed.video_id,
                    publish_date=parsed.publish_date,
                    description=parsed.description,
                    upstream_path=str(file_path),
                    content_hash=parsed.content_hash,
                    repo_commit=repo_commit,
                    is_active=True,
                    ingested_at=now,
                    created_at=now,
                    updated_at=now,
                )
                session.add(new_source)
                source_id = new_source.id
                stats.created += 1

            # Insert new chunks
            chunk_entities = [
                TranscriptChunk(
                    id=uuid.uuid4(),
                    source_id=source_id,
                    chunk_index=c.chunk_index,
                    content=c.content,
                    token_count=c.token_count,
                    embedding=embeddings[i],
                    content_hash=c.content_hash,
                    char_start=c.char_start,
                    char_end=c.char_end,
                    created_at=now,
                )
                for i, c in enumerate(chunks)
            ]
            session.add_all(chunk_entities)

        await session.commit()
        logger.info("Indexed %s with %d chunks", source_key, len(chunk_entities))

    async def _reconcile_inactive_sources(
        self,
        session: AsyncSession,
        discovered_keys: set[str],
    ) -> int:
        """Mark sources that are in the database but no longer in the discovered files as inactive."""
        stmt = (
            update(TranscriptSource)
            .where(
                TranscriptSource.is_active.is_(True),
                TranscriptSource.source_key.not_in(discovered_keys),
            )
            .values(is_active=False)
        )
        res = await session.execute(stmt)
        await session.commit()
        rowcount = getattr(res, "rowcount", 0)
        return int(rowcount) if rowcount is not None else 0

