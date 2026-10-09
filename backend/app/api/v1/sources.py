"""
Sources & Evidence Inspection API Endpoints.
Implements GET /api/v1/sources/{source_id}, GET /api/v1/chunks/{chunk_id}, and GET /api/v1/ingestion/status.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.db.session import get_db
from backend.app.models.entities import TranscriptChunk, TranscriptSource

router = APIRouter(tags=["sources"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


class SourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_key: str
    title: str
    guest: str | None = None
    episode_url: str | None = None
    video_id: str | None = None
    publish_date: str | None = None
    description: str | None = None
    is_active: bool
    total_chunks: int = 0
    ingested_at: str | None = None


class ChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    chunk_index: int
    episode_title: str
    guest: str | None = None
    episode_url: str | None = None
    content: str
    token_count: int
    char_start: int | None = None
    char_end: int | None = None


class IngestionStatusResponse(BaseModel):
    total_sources: int
    active_sources: int
    total_chunks: int
    latest_commit: str | None = None
    last_ingested_at: str | None = None


@router.get("/sources/{source_id}", response_model=SourceResponse)
async def get_source(source_id: uuid.UUID, db: DbSession) -> SourceResponse:
    """Retrieve canonical metadata and episode URL for a specific transcript source."""
    stmt = select(TranscriptSource).where(TranscriptSource.id == source_id)
    result = await db.execute(stmt)
    source = result.scalar_one_or_none()

    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source with ID '{source_id}' was not found.",
        )

    # Count chunks
    chunk_count_stmt = select(func.count(TranscriptChunk.id)).where(
        TranscriptChunk.source_id == source_id
    )
    count_result = await db.execute(chunk_count_stmt)
    total_chunks = count_result.scalar() or 0

    return SourceResponse(
        id=source.id,
        source_key=source.source_key,
        title=source.title,
        guest=source.guest,
        episode_url=source.episode_url,
        video_id=source.video_id,
        publish_date=source.publish_date.isoformat() if source.publish_date else None,
        description=source.description,
        is_active=source.is_active,
        total_chunks=total_chunks,
        ingested_at=source.ingested_at.isoformat() if source.ingested_at else None,
    )


@router.get("/chunks/{chunk_id}", response_model=ChunkResponse)
async def get_chunk(chunk_id: uuid.UUID, db: DbSession) -> ChunkResponse:
    """Retrieve exact stored chunk text and episode metadata for evidence inspection."""
    stmt = (
        select(TranscriptChunk, TranscriptSource)
        .join(TranscriptSource, TranscriptChunk.source_id == TranscriptSource.id)
        .where(TranscriptChunk.id == chunk_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chunk with ID '{chunk_id}' was not found.",
        )

    chunk, source = row
    return ChunkResponse(
        id=chunk.id,
        source_id=chunk.source_id,
        chunk_index=chunk.chunk_index,
        episode_title=source.title,
        guest=source.guest,
        episode_url=source.episode_url,
        content=chunk.content,
        token_count=chunk.token_count,
        char_start=chunk.char_start,
        char_end=chunk.char_end,
    )


@router.get("/ingestion/status", response_model=IngestionStatusResponse)
async def get_ingestion_status(
    db: DbSession,
) -> IngestionStatusResponse:
    """Return status summary of the transcript knowledge base."""
    total_sources = await db.scalar(select(func.count(TranscriptSource.id))) or 0
    active_sources = (
        await db.scalar(
            select(func.count(TranscriptSource.id)).where(
                TranscriptSource.is_active.is_(True)
            )
        )
        or 0
    )
    total_chunks = await db.scalar(select(func.count(TranscriptChunk.id))) or 0

    latest_source_stmt = (
        select(TranscriptSource.repo_commit, TranscriptSource.ingested_at)
        .order_by(TranscriptSource.ingested_at.desc())
        .limit(1)
    )
    latest_row = (await db.execute(latest_source_stmt)).first()

    latest_commit = latest_row[0] if latest_row else None
    last_ingested_at = (
        latest_row[1].isoformat() if latest_row and latest_row[1] else None
    )

    return IngestionStatusResponse(
        total_sources=total_sources,
        active_sources=active_sources,
        total_chunks=total_chunks,
        latest_commit=latest_commit,
        last_ingested_at=last_ingested_at,
    )
