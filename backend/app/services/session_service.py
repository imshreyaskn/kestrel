"""
Session Management Service (Codename: Kestrel)
Enforces user ownership, session CRUD, and message history resolution.
Conforms strictly to IMPLEMENTATION_SPEC.md §5.2, §5.3, §5.6, and §6.2.
"""

from __future__ import annotations

import datetime
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.entities import (
    ChatSession,
    Message,
    MessageSource,
    TranscriptChunk,
)


class SessionService:
    @staticmethod
    async def create_session(
        db: AsyncSession,
        user_id: uuid.UUID,
        title: str = "New Chat",
        provider_preference: str = "local",
        metadata: dict[str, Any] | None = None,
    ) -> ChatSession:
        """Create a new chat session owned by user_id."""
        now = datetime.datetime.now(datetime.UTC)
        session = ChatSession(
            user_id=user_id,
            title=title,
            provider_preference=provider_preference,
            provider=provider_preference,
            created_at=now,
            updated_at=now,
            last_message_at=now,
            metadata_=metadata or {},
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def get_session(
        db: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> ChatSession | None:
        """Fetch session metadata, enforcing user ownership."""
        stmt = select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def list_sessions(
        db: AsyncSession,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[ChatSession]:
        """List sessions owned by user, sorted by last_message_at desc."""
        stmt = (
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(desc(ChatSession.last_message_at), desc(ChatSession.created_at))
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def delete_session(
        db: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> bool:
        """Delete session and cascades, enforcing ownership."""
        session = await SessionService.get_session(db, session_id, user_id)
        if not session:
            return False

        stmt = delete(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
        await db.execute(stmt)
        await db.commit()
        return True

    @staticmethod
    async def get_session_messages(
        db: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Fetch chronological (paginated) messages for session with resolved
        evidence citations. Excerpts are resolved directly from stored
        transcript_chunks.content.
        """
        # 1. Enforce session ownership
        session = await SessionService.get_session(db, session_id, user_id)
        if not session:
            return []

        # 2. Load messages with joined sources
        stmt = (
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at.asc(), Message.id.asc())
            .offset(offset)
            .limit(limit)
            .options(
                selectinload(Message.sources)
                .selectinload(MessageSource.chunk)
                .selectinload(TranscriptChunk.source)
            )
        )
        result = await db.execute(stmt)
        messages = result.scalars().all()

        message_list: list[dict[str, Any]] = []
        for msg in messages:
            citations: list[dict[str, Any]] = []
            for src in msg.sources:
                chunk = src.chunk
                source = chunk.source if chunk else None
                citations.append(
                    {
                        "evidence_id": src.evidence_id,
                        "source_id": str(chunk.source_id) if chunk else "",
                        "chunk_id": str(src.chunk_id),
                        "guest": source.guest if source else None,
                        "episode_title": source.title if source else "Unknown Episode",
                        "episode_url": source.episode_url if source else None,
                        "publish_date": source.publish_date.isoformat()
                        if source and source.publish_date
                        else None,
                        "excerpt": chunk.content
                        if chunk
                        else "",  # SPEC §5.6: Read from stored chunk, not generated quote
                        "supports": src.supports,
                    }
                )

            message_list.append(
                {
                    "id": str(msg.id),
                    "session_id": str(msg.session_id),
                    "role": msg.role,
                    "content": msg.content,
                    "status": msg.status,
                    "workflow_mode": msg.workflow_mode,
                    "provider": msg.provider,
                    "model_id": msg.model_id,
                    "error_code": msg.error_code,
                    "created_at": msg.created_at.isoformat(),
                    "completed_at": msg.completed_at.isoformat()
                    if msg.completed_at
                    else None,
                    "citations": citations,
                }
            )

        return message_list


default_session_service = SessionService()
