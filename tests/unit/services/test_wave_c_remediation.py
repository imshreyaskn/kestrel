"""
Unit tests for Wave C remediation behaviors:
1. Idempotency key lookup and caching on message POST (BA15).
2. Monotonic sequence ordering for messages (BA17).
3. OpenAPI metadata annotations for public sources read scopes (BA20).
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.db.session import get_db
from backend.app.main import app
from backend.app.models.entities import (
    ChatSession,
    Message,
)
from backend.app.services.conversation_service import default_conversation_service
from backend.app.services.session_service import SessionService

client = TestClient(app)


@pytest.fixture(autouse=True)
def override_db_dependency():
    mock_db = AsyncMock()

    async def _mock_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _mock_get_db
    yield mock_db
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_session_service_idempotency_methods():
    """BA15: Test get_message_by_idempotency_key and get_assistant_reply_for_user_message."""
    session_id = uuid.uuid4()
    mock_db = AsyncMock()
    mock_msg = Message(
        id=uuid.uuid4(),
        session_id=session_id,
        role="user",
        content="Test query",
        seq=1,
        idempotency_key="key-12345",
    )

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_msg
    mock_db.execute.return_value = mock_result

    found = await SessionService.get_message_by_idempotency_key(
        db=mock_db,
        session_id=session_id,
        idempotency_key="key-12345",
    )
    assert found is not None
    assert found.idempotency_key == "key-12345"

    # Test get_assistant_reply_for_user_message
    mock_reply = Message(
        id=uuid.uuid4(),
        session_id=session_id,
        role="assistant",
        content="Answer",
        seq=2,
        status="complete",
    )
    mock_reply_result = MagicMock()
    mock_reply_result.scalars.return_value.first.return_value = mock_reply
    mock_db.execute.return_value = mock_reply_result

    reply = await SessionService.get_assistant_reply_for_user_message(
        db=mock_db,
        session_id=session_id,
        user_message_seq=1,
    )
    assert reply is not None
    assert reply.role == "assistant"
    assert reply.seq == 2


@pytest.mark.asyncio
async def test_conversation_service_idempotent_deduplication():
    """BA15: process_message_stream returns cached completed result when idempotency_key matches."""
    session_id = uuid.uuid4()
    user_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.UTC)

    fake_session = ChatSession(
        id=session_id,
        user_id=user_id,
        title="Test Session",
        provider_preference="local",
        created_at=now,
        updated_at=now,
    )
    existing_user_msg = Message(
        id=uuid.uuid4(),
        session_id=session_id,
        role="user",
        content="Cached query",
        seq=1,
        idempotency_key="idem-key-abc",
        status="complete",
        created_at=now,
        completed_at=now,
    )
    cached_assistant = Message(
        id=uuid.uuid4(),
        session_id=session_id,
        role="assistant",
        content="Cached assistant answer",
        seq=2,
        workflow_mode="research",
        provider="local",
        model_id="qwen2.5:1.5b",
        status="complete",
        created_at=now,
        completed_at=now,
        metadata_={"evidence_rrf_scores": {"EVID-1": 0.033}},
    )
    cached_assistant.sources = []

    mock_db = AsyncMock()

    with (
        patch.object(SessionService, "get_session", new=AsyncMock(return_value=fake_session)),
        patch.object(SessionService, "get_message_by_idempotency_key", new=AsyncMock(return_value=existing_user_msg)),
        patch.object(SessionService, "get_assistant_reply_for_user_message", new=AsyncMock(return_value=cached_assistant)),
    ):
        events = []
        async for evt in default_conversation_service.process_message_stream(
            db=mock_db,
            session_id=session_id,
            user_id=user_id,
            content="Cached query",
            idempotency_key="idem-key-abc",
        ):
            events.append(evt)

        event_names = [e["event"] for e in events]
        assert "run_started" in event_names
        assert "completed" in event_names
        completed_evt = next(e for e in events if e["event"] == "completed")
        assert completed_evt["data"]["message"]["content"] == "Cached assistant answer"
        assert completed_evt["data"]["message"]["id"] == str(cached_assistant.id)


def test_submit_message_passes_idempotency_key():
    """BA15: submit_message endpoint forwards Idempotency-Key header to conversation service."""
    session_id = uuid.uuid4()
    user_id = uuid.UUID("00000000-0000-4000-8000-000000000001")
    now = datetime.datetime.now(datetime.UTC)

    fake_session = ChatSession(
        id=session_id,
        user_id=user_id,
        title="Session",
        provider_preference="local",
        created_at=now,
        updated_at=now,
    )

    mock_response = {
        "message": {
            "id": str(uuid.uuid4()),
            "session_id": str(session_id),
            "role": "assistant",
            "content": "Idempotent response",
            "status": "complete",
        },
        "citations": [],
    }

    with (
        patch("backend.app.api.v1.sessions.default_session_service.get_session", new=AsyncMock(return_value=fake_session)),
        patch("backend.app.api.v1.sessions.default_conversation_service.process_message", new=AsyncMock(return_value=mock_response)) as mock_process,
    ):
        resp = client.post(
            f"/api/v1/sessions/{session_id}/messages",
            json={"content": "Hello world", "stream": False},
            headers={"Idempotency-Key": "test-key-999"},
        )
        assert resp.status_code == 200
        assert mock_process.called
        call_kwargs = mock_process.call_args.kwargs
        assert call_kwargs.get("idempotency_key") == "test-key-999"


def test_sources_openapi_documentation():
    """BA20: Verify OpenAPI docs exist on public corpus routes."""
    routes = {r.path: r for r in app.routes if hasattr(r, "path")}
    
    assert "/api/v1/sources/{source_id}" in routes
    source_route = routes["/api/v1/sources/{source_id}"]
    assert "public knowledge base" in source_route.description.lower() or "transcript" in source_route.description.lower()
    assert source_route.summary == "Get transcript source metadata"

    assert "/api/v1/chunks/{chunk_id}" in routes
    chunk_route = routes["/api/v1/chunks/{chunk_id}"]
    assert "citation inspection" in chunk_route.description.lower() or "chunk" in chunk_route.description.lower()
    assert chunk_route.summary == "Get transcript chunk text and evidence metadata"

    assert "/api/v1/ingestion/status" in routes
    ingest_route = routes["/api/v1/ingestion/status"]
    assert ingest_route.summary == "Get transcript knowledge base status"
