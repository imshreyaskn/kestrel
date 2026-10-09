"""
Unit tests for Sessions API endpoints (/api/v1/sessions).
(Codename: Kestrel)
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.db.session import get_db
from backend.app.main import app
from backend.app.models.entities import ChatSession

client = TestClient(app)


@pytest.fixture(autouse=True)
def override_db_dependency():
    mock_db = AsyncMock()

    async def _mock_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _mock_get_db
    yield mock_db
    app.dependency_overrides.clear()


def test_create_session_endpoint():
    fake_session = ChatSession(
        id=uuid.uuid4(),
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
        title="PLG Activation Session",
        provider_preference="local",
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
        last_message_at=datetime.datetime.now(datetime.UTC),
    )

    with patch(
        "backend.app.api.v1.sessions.default_session_service.create_session",
        new=AsyncMock(return_value=fake_session),
    ):
        response = client.post(
            "/api/v1/sessions",
            json={"title": "PLG Activation Session", "provider_preference": "local"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "PLG Activation Session"
        assert data["provider_preference"] == "local"
        assert "id" in data


def test_list_sessions_endpoint():
    fake_session = ChatSession(
        id=uuid.uuid4(),
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
        title="Session 1",
        provider_preference="local",
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
        last_message_at=datetime.datetime.now(datetime.UTC),
    )

    with patch(
        "backend.app.api.v1.sessions.default_session_service.list_sessions",
        new=AsyncMock(return_value=[fake_session]),
    ):
        response = client.get("/api/v1/sessions?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["title"] == "Session 1"


def test_get_session_not_found_returns_error_envelope():
    sess_id = uuid.uuid4()
    with patch(
        "backend.app.api.v1.sessions.default_session_service.get_session",
        new=AsyncMock(return_value=None),
    ):
        response = client.get(f"/api/v1/sessions/{sess_id}")
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"


def test_delete_session_endpoint():
    sess_id = uuid.uuid4()
    with patch(
        "backend.app.api.v1.sessions.default_session_service.delete_session",
        new=AsyncMock(return_value=True),
    ):
        response = client.delete(f"/api/v1/sessions/{sess_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] is True


def test_get_session_messages_endpoint():
    sess_id = uuid.uuid4()
    fake_session = ChatSession(
        id=sess_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
    )
    fake_messages = [
        {
            "id": str(uuid.uuid4()),
            "session_id": str(sess_id),
            "role": "user",
            "content": "How do we improve activation?",
            "status": "complete",
            "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
            "citations": [],
        }
    ]

    with patch(
        "backend.app.api.v1.sessions.default_session_service.get_session",
        new=AsyncMock(return_value=fake_session),
    ), patch(
        "backend.app.api.v1.sessions.default_session_service.get_session_messages",
        new=AsyncMock(return_value=fake_messages),
    ):
        response = client.get(f"/api/v1/sessions/{sess_id}/messages")
        assert response.status_code == 200
        data = response.json()
        assert len(data["messages"]) == 1
        assert data["messages"][0]["content"] == "How do we improve activation?"


def test_submit_message_non_streaming():
    sess_id = uuid.uuid4()
    fake_session = ChatSession(
        id=sess_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
    )
    fake_completed_response = {
        "message": {
            "id": str(uuid.uuid4()),
            "session_id": str(sess_id),
            "role": "assistant",
            "status": "complete",
            "content": "Activation is critical [E1].",
            "mode": "research",
            "provider": "local",
            "model_id": "qwen2.5:1.5b",
            "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
        },
        "citations": [
            {
                "evidence_id": "E1",
                "source_id": str(uuid.uuid4()),
                "chunk_id": str(uuid.uuid4()),
                "guest": "Elena Verna",
                "episode_title": "Elena Verna on PLG",
                "episode_url": "https://youtube.com/watch?v=123",
                "publish_date": "2024-01-15",
                "excerpt": "Activation rate is key.",
                "supports": "Activation importance",
            }
        ],
        "insufficient_evidence": False,
        "growth_brief_id": None,
        "artifact_id": None,
    }

    with patch(
        "backend.app.api.v1.sessions.default_session_service.get_session",
        new=AsyncMock(return_value=fake_session),
    ), patch(
        "backend.app.api.v1.sessions.default_conversation_service.process_message",
        new=AsyncMock(return_value=fake_completed_response),
    ):
        response = client.post(
            f"/api/v1/sessions/{sess_id}/messages",
            json={
                "content": "Tell me about activation",
                "mode": "research",
                "provider": "local",
                "stream": False,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"]["status"] == "complete"
        assert len(data["citations"]) == 1
        assert data["citations"][0]["evidence_id"] == "E1"


def test_submit_message_sse_streaming():
    sess_id = uuid.uuid4()
    fake_session = ChatSession(
        id=sess_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
    )

    async def mock_stream(*args, **kwargs):
        yield {"event": "run_started", "data": {"run_id": "run-1"}}
        yield {"event": "stage", "data": {"stage": "loading_context", "label": "Loading..."}}
        yield {"event": "stage", "data": {"stage": "retrieving", "label": "Retrieving..."}}
        yield {
            "event": "completed",
            "data": {
                "message": {"content": "Final answer [E1]"},
                "citations": [{"evidence_id": "E1"}],
                "insufficient_evidence": False,
            },
        }

    with patch(
        "backend.app.api.v1.sessions.default_session_service.get_session",
        new=AsyncMock(return_value=fake_session),
    ), patch(
        "backend.app.api.v1.sessions.default_conversation_service.process_message_stream",
        side_effect=mock_stream,
    ):
        response = client.post(
            f"/api/v1/sessions/{sess_id}/messages",
            json={
                "content": "Tell me about activation",
                "mode": "research",
                "provider": "local",
                "stream": True,
            },
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        text = response.text
        assert "event: run_started" in text
        assert "event: stage" in text
        assert "event: completed" in text
        assert "Final answer [E1]" in text
