"""
Unit tests for SessionService (Codename: Kestrel)
Verifies session CRUD, user ownership boundaries, and citation excerpt resolution.
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.app.models.entities import (
    ChatSession,
    Message,
    MessageSource,
    TranscriptChunk,
    TranscriptSource,
)
from backend.app.services.session_service import SessionService


@pytest.mark.asyncio
async def test_create_session():
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    user_id = uuid.uuid4()

    session = await SessionService.create_session(
        db=mock_db,
        user_id=user_id,
        title="Activation Strategy",
        provider_preference="local",
    )

    assert session.user_id == user_id
    assert session.title == "Activation Strategy"
    assert session.provider_preference == "local"
    assert mock_db.add.called
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_get_session_enforces_user_ownership():
    mock_db = AsyncMock()
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    sess_id = uuid.uuid4()

    existing_session = ChatSession(
        id=sess_id,
        user_id=user_a,
        title="User A Session",
    )

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = existing_session
    mock_db.execute.return_value = mock_result

    # Authorized user fetches session
    res = await SessionService.get_session(mock_db, sess_id, user_a)
    assert res is not None
    assert res.id == sess_id

    # Unauthorized user returns None
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_result_empty

    res_unauth = await SessionService.get_session(mock_db, sess_id, user_b)
    assert res_unauth is None


@pytest.mark.asyncio
async def test_delete_session_success_and_failure():
    mock_db = AsyncMock()
    user_id = uuid.uuid4()
    sess_id = uuid.uuid4()

    # Success case: session found and deleted
    existing_session = ChatSession(id=sess_id, user_id=user_id)
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = existing_session
    mock_db.execute.return_value = mock_result

    deleted = await SessionService.delete_session(mock_db, sess_id, user_id)
    assert deleted is True
    assert mock_db.commit.called

    # Not found case
    mock_result_none = MagicMock()
    mock_result_none.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_result_none

    deleted_nonexistent = await SessionService.delete_session(mock_db, sess_id, user_id)
    assert deleted_nonexistent is False


@pytest.mark.asyncio
async def test_get_session_messages_resolves_stored_chunk_excerpt():
    mock_db = AsyncMock()
    user_id = uuid.uuid4()
    sess_id = uuid.uuid4()
    msg_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()

    # Session ownership verification mock
    session_obj = ChatSession(id=sess_id, user_id=user_id)
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj

    # Source, chunk, and message mocks
    source = TranscriptSource(
        id=source_id,
        source_key="episodes/elena-verna/transcript.md",
        title="Elena Verna on PLG",
        guest="Elena Verna",
        episode_url="https://youtube.com/watch?v=123",
        publish_date=datetime.date(2024, 1, 15),
        content_hash="hash123",
    )
    chunk = TranscriptChunk(
        id=chunk_id,
        source_id=source_id,
        chunk_index=3,
        content="Activation rate is the percentage of new users reaching value.",
        token_count=100,
        content_hash="chunkhash123",
    )
    chunk.source = source

    msg_src = MessageSource(
        message_id=msg_id,
        chunk_id=chunk_id,
        evidence_id="E1",
        supports="Definition of activation",
        retrieval_rank=1,
    )
    msg_src.chunk = chunk

    message = Message(
        id=msg_id,
        session_id=sess_id,
        role="assistant",
        content="Activation is defined as reaching value [E1].",
        status="complete",
        created_at=datetime.datetime(2024, 1, 15, 12, 0, tzinfo=datetime.UTC),
    )
    message.sources = [msg_src]

    mock_msg_res = MagicMock()
    mock_msg_res.scalars.return_value.all.return_value = [message]

    mock_db.execute.side_effect = [mock_sess_res, mock_msg_res]

    messages = await SessionService.get_session_messages(mock_db, sess_id, user_id)

    assert len(messages) == 1
    msg_out = messages[0]
    assert msg_out["role"] == "assistant"
    assert len(msg_out["citations"]) == 1

    cit = msg_out["citations"][0]
    assert cit["evidence_id"] == "E1"
    assert cit["guest"] == "Elena Verna"
    assert cit["episode_title"] == "Elena Verna on PLG"
    # SPEC §5.6 invariant: Excerpt is read from chunk.content
    assert cit["excerpt"] == "Activation rate is the percentage of new users reaching value."
    assert cit["supports"] == "Definition of activation"
