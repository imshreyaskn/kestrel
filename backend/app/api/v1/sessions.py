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

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.db.session import get_db
from backend.app.services.conversation_service import (
    ConversationFlowError,
    ModelNotAllowedError,
    default_conversation_service,
)
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


def _reject_invalid_control_chars(value: str) -> str:
    """Spec §6.3: reject null bytes and invalid control characters.

    Tab, newline, and carriage return are legitimate message content.
    """
    if "\x00" in value:
        raise ValueError("must not contain null bytes")
    for ch in value:
        if ord(ch) < 32 and ch not in "\t\n\r":
            raise ValueError(
                "must not contain control characters other than tab/newline/carriage return"
            )
    return value


class UpdateSessionRequest(BaseModel):
    """Spec §5.2: session titles are editable; the design spec's index rail
    supports inline dossier renaming."""

    title: str = Field(..., min_length=1, max_length=255)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, v: str) -> str:
        return _reject_invalid_control_chars(v)


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

    @field_validator("content", "product_context")
    @classmethod
    def _validate_no_control_chars(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _reject_invalid_control_chars(v)

    @model_validator(mode="after")
    def _validate_mode_format_combination(self) -> MessageRequest:
        # Spec §6.3: artifact_format is only meaningful for artifact modes;
        # reject unsupported combinations instead of silently ignoring it.
        if self.artifact_format is not None and self.mode not in (
            "artifact_markdown",
            "artifact_html",
        ):
            raise ValueError(
                "artifact_format is only valid with artifact_markdown or artifact_html modes"
            )
        if self.mode == "artifact_markdown" and self.artifact_format == "html":
            raise ValueError(
                "mode artifact_markdown requires artifact_format 'markdown'"
            )
        if self.mode == "artifact_html" and self.artifact_format == "markdown":
            raise ValueError("mode artifact_html requires artifact_format 'html'")
        return self


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
    title = (
        payload.title.strip() if payload.title and payload.title.strip() else "New Chat"
    )
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


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: uuid.UUID,
    payload: UpdateSessionRequest,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Rename a session, enforcing ownership (spec §5.2: titles are editable)."""
    session = await default_session_service.get_session(
        db=db, session_id=session_id, user_id=user_id
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    session.title = payload.title.strip()
    session.updated_at = datetime.datetime.now(datetime.UTC)
    await db.commit()
    await db.refresh(session)
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
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Retrieve paginated chronological messages for session with resolved evidence citations."""
    session = await default_session_service.get_session(
        db=db, session_id=session_id, user_id=user_id
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    messages = await default_session_service.get_session_messages(
        db=db, session_id=session_id, user_id=user_id, limit=limit, offset=offset
    )
    return {"messages": messages, "limit": limit, "offset": offset}


# ---------------------------------------------------------------------------
# Message Submission & SSE Streaming Endpoint
# ---------------------------------------------------------------------------
@router.post("/{session_id}/messages")
async def submit_message(
    session_id: uuid.UUID,
    payload: MessageRequest,
    request: Request,
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

    # Enforce the server-side model allowlist before any work begins
    # (spec §6.6): fail fast with a validation error rather than starting
    # a stream that cannot succeed.
    try:
        default_conversation_service.resolve_model_id(
            provider=payload.provider,
            cloud_provider=payload.cloud_provider,
            requested_model=payload.model_id,
        )
    except ModelNotAllowedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

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
            # Only the pre-classified safe message crosses the boundary;
            # raw exception text stays in server logs (spec §6.1/§12.1).
            if isinstance(exc, ConversationFlowError):
                status_by_code = {
                    "AGENT_UNAVAILABLE": status.HTTP_502_BAD_GATEWAY,
                    "GENERATION_TIMEOUT": status.HTTP_504_GATEWAY_TIMEOUT,
                    "MODEL_NOT_ALLOWED": status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "ESSAY_LENGTH_OUT_OF_RANGE": status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "MODEL_OUTPUT_INVALID": status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "NOT_FOUND": status.HTTP_404_NOT_FOUND,
                }
                raise HTTPException(
                    status_code=status_by_code.get(
                        exc.code, status.HTTP_500_INTERNAL_SERVER_ERROR
                    ),
                    detail=exc.args[0],
                ) from exc
            logger.exception("Failed processing message for session %s", session_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Message processing failed. Retry, or switch provider.",
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
                request_id=request.state.request_id,
            ):
                event_type = event.get("event", "message")
                event_data = json.dumps(event.get("data", {}))
                yield f"event: {event_type}\ndata: {event_data}\n\n"
        except Exception:  # noqa: BLE001
            # Unexpected router-level failure: log full detail server-side,
            # emit a redacted envelope consistent with spec §6.1.
            logger.exception(
                "SSE stream error for session %s (request %s)",
                session_id,
                getattr(request.state, "request_id", "unknown"),
            )
            err_json = json.dumps(
                {
                    "error": {
                        "code": "INTERNAL_SERVER_ERROR",
                        "message": "The response stream failed unexpectedly. Retry, or switch provider.",
                        "retryable": True,
                        "request_id": getattr(request.state, "request_id", None),
                    }
                }
            )
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

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
