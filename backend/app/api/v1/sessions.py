"""
Sessions and Message Streaming Router (Codename: Kestrel)
Implements IMPLEMENTATION_SPEC.md §5.2, §6.2-§6.5.
"""

from __future__ import annotations

import datetime
import json
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.db.session import get_db
from backend.app.services.conversation_service import default_conversation_service
from backend.app.services.session_service import default_session_service

logger = logging.getLogger("kestrel.sessions_api")
router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_current_user_id() -> uuid.UUID:
    """Enforces server-owned user identity per SPEC §5.1."""
    return uuid.UUID(settings.DEMO_USER_ID)


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class CreateSessionRequest(BaseModel):
    title: str | None = None
    provider_preference: Literal["local", "cloud"] = "local"


class SessionResponse(BaseModel):
    id: uuid.UUID
    title: str
    provider_preference: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    last_message_at: datetime.datetime | None = None


class MessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
    mode: Literal[
        "research",
        "growth_brief",
        "essay",
        "artifact_markdown",
        "artifact_html",
    ] = "research"
    provider: Literal["local", "cloud"] = "local"
    cloud_provider: Literal["gemini", "anthropic", "openai"] | None = None
    model_id: str | None = None
    artifact_format: Literal["markdown", "html"] | None = None
    product_context: str | None = Field(None, max_length=4000)
    stream: bool = True


# ---------------------------------------------------------------------------
# Session CRUD Endpoints
# ---------------------------------------------------------------------------
@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Create a new chat session owned by the authenticated app user."""
    title = payload.title.strip() if payload.title and payload.title.strip() else "New Chat"
    session = await default_session_service.create_session(
        db=db,
        user_id=user_id,
        title=title,
        provider_preference=payload.provider_preference,
    )
    return SessionResponse(
        id=session.id,
        title=session.title,
        provider_preference=session.provider_preference,
        created_at=session.created_at,
        updated_at=session.updated_at,
        last_message_at=session.last_message_at,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """List sessions owned by current user, ordered by last_message_at desc."""
    sessions = await default_session_service.list_sessions(
        db=db, user_id=user_id, limit=limit, offset=offset
    )
    return [
        SessionResponse(
            id=s.id,
            title=s.title,
            provider_preference=s.provider_preference,
            created_at=s.created_at,
            updated_at=s.updated_at,
            last_message_at=s.last_message_at,
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Retrieve session metadata enforcing ownership."""
    session = await default_session_service.get_session(
        db=db, session_id=session_id, user_id=user_id
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    return SessionResponse(
        id=session.id,
        title=session.title,
        provider_preference=session.provider_preference,
        created_at=session.created_at,
        updated_at=session.updated_at,
        last_message_at=session.last_message_at,
    )


@router.delete("/{session_id}", status_code=status.HTTP_200_OK)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Delete a session and all cascades, enforcing ownership."""
    deleted = await default_session_service.delete_session(
        db=db, session_id=session_id, user_id=user_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    return {"deleted": True, "session_id": str(session_id)}


@router.get("/{session_id}/messages")
async def get_session_messages(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Retrieve chronological messages for session with resolved evidence citations."""
    session = await default_session_service.get_session(
        db=db, session_id=session_id, user_id=user_id
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    messages = await default_session_service.get_session_messages(
        db=db, session_id=session_id, user_id=user_id
    )
    return {"messages": messages}


# ---------------------------------------------------------------------------
# Message Submission & SSE Streaming Endpoint
# ---------------------------------------------------------------------------
@router.post("/{session_id}/messages")
async def submit_message(
    session_id: uuid.UUID,
    payload: MessageRequest,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Submit user message and execute workflow.
    Streams progress stages via text/event-stream SSE by default,
    or returns completed response JSON if stream=False.
    """
    # 1. Enforce session ownership
    session = await default_session_service.get_session(
        db=db, session_id=session_id, user_id=user_id
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    # If non-streaming requested
    if not payload.stream:
        try:
            result = await default_conversation_service.process_message(
                db=db,
                session_id=session_id,
                user_id=user_id,
                content=payload.content,
                mode=payload.mode,
                provider=payload.provider,
                cloud_provider=payload.cloud_provider,
                model_id=payload.model_id,
                product_context=payload.product_context,
            )
            return result
        except Exception as exc:
            logger.error(f"Failed processing message: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(exc),
            ) from exc

    # Streaming SSE generator
    async def event_generator():
        try:
            async for event in default_conversation_service.process_message_stream(
                db=db,
                session_id=session_id,
                user_id=user_id,
                content=payload.content,
                mode=payload.mode,
                provider=payload.provider,
                cloud_provider=payload.cloud_provider,
                model_id=payload.model_id,
                product_context=payload.product_context,
            ):
                event_type = event.get("event", "message")
                event_data = json.dumps(event.get("data", {}))
                yield f"event: {event_type}\ndata: {event_data}\n\n"
        except Exception as exc:  # noqa: BLE001
            logger.error(f"SSE stream error: {exc}")
            err_json = json.dumps({
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": str(exc),
                    "retryable": False,
                }
            })
            yield f"event: error\ndata: {err_json}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
