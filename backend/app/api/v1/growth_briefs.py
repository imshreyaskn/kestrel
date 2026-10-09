"""
Growth Briefs Router (Codename: Kestrel)
Implements IMPLEMENTATION_SPEC.md §5.7 & §6.2.
"""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.db.session import get_db
from backend.app.services.growth_brief_service import default_growth_brief_service

router = APIRouter(prefix="/growth-briefs", tags=["growth-briefs"])


class UpdateGrowthBriefRequest(BaseModel):
    title: str | None = None
    status: str | None = None
    data: dict[str, Any] | None = None
    expected_version: int | None = None


class GrowthBriefResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    title: str
    version: int
    status: str
    product_context: str | None = None
    data: dict[str, Any]
    created_at: datetime.datetime
    updated_at: datetime.datetime


@router.get("/{brief_id}", response_model=GrowthBriefResponse)
async def get_growth_brief(
    brief_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve structured growth brief by ID."""
    brief = await default_growth_brief_service.get_growth_brief(db=db, brief_id=brief_id)
    if not brief:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Growth brief {brief_id} not found",
        )
    return GrowthBriefResponse(
        id=brief.id,
        session_id=brief.session_id,
        title=brief.title,
        version=brief.version,
        status=brief.status,
        product_context=brief.product_context,
        data=brief.data,
        created_at=brief.created_at,
        updated_at=brief.updated_at,
    )


@router.patch("/{brief_id}", response_model=GrowthBriefResponse)
async def update_growth_brief(
    brief_id: uuid.UUID,
    payload: UpdateGrowthBriefRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update growth brief with optimistic version checking."""
    try:
        updated = await default_growth_brief_service.update_growth_brief(
            db=db,
            brief_id=brief_id,
            title=payload.title,
            data_update=payload.data,
            status=payload.status,
            expected_version=payload.expected_version,
        )
        return GrowthBriefResponse(
            id=updated.id,
            session_id=updated.session_id,
            title=updated.title,
            version=updated.version,
            status=updated.status,
            product_context=updated.product_context,
            data=updated.data,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Growth brief {brief_id} not found",
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
