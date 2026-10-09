"""
Artifacts Router (Codename: Kestrel)
Implements IMPLEMENTATION_SPEC.md §5.8, §6.2, & §9.1.
"""

from __future__ import annotations

import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.db.session import get_db
from backend.app.services.artifact_service import default_artifact_service

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


class UpdateArtifactRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    expected_version: int | None = None


class ArtifactResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    kind: str
    title: str
    content: str
    preview_content: str | None = None
    version: int
    created_at: datetime.datetime
    updated_at: datetime.datetime


@router.get("/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve artifact by ID."""
    artifact = await default_artifact_service.get_artifact(db=db, artifact_id=artifact_id)
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact {artifact_id} not found",
        )
    return ArtifactResponse(
        id=artifact.id,
        session_id=artifact.session_id,
        kind=artifact.kind,
        title=artifact.title,
        content=artifact.content,
        preview_content=artifact.preview_content,
        version=artifact.version,
        created_at=artifact.created_at,
        updated_at=artifact.updated_at,
    )


@router.patch("/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact(
    artifact_id: uuid.UUID,
    payload: UpdateArtifactRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update artifact with optimistic version checking and sandbox preview regeneration."""
    try:
        updated = await default_artifact_service.update_artifact(
            db=db,
            artifact_id=artifact_id,
            title=payload.title,
            content=payload.content,
            expected_version=payload.expected_version,
        )
        return ArtifactResponse(
            id=updated.id,
            session_id=updated.session_id,
            kind=updated.kind,
            title=updated.title,
            content=updated.content,
            preview_content=updated.preview_content,
            version=updated.version,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact {artifact_id} not found",
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
