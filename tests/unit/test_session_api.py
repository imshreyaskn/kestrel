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


def test_delete_session_not_found():
    sess_id = uuid.uuid4()
    with patch(
        "backend.app.api.v1.sessions.default_session_service.delete_session",
        new=AsyncMock(return_value=False),
    ):
        response = client.delete(f"/api/v1/sessions/{sess_id}")
        assert response.status_code == 404


def test_rename_session_endpoint():
    """PATCH /sessions/{id} implements the design-spec inline dossier rename;
    the frontend composer rail depends on it."""
    sess_id = uuid.uuid4()
    fake_session = ChatSession(
        id=sess_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
        title="Old title",
        provider_preference="local",
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )
    with patch(
        "backend.app.api.v1.sessions.default_session_service.get_session",
        new=AsyncMock(return_value=fake_session),
    ):
        response = client.patch(
            f"/api/v1/sessions/{sess_id}",
            json={"title": "Pricing page teardown"},
        )
        assert response.status_code == 200
        assert response.json()["title"] == "Pricing page teardown"


def test_rename_session_rejects_control_characters():
    sess_id = uuid.uuid4()
    response = client.patch(
        f"/api/v1/sessions/{sess_id}",
        json={"title": "bad\x00title"},
    )
    assert response.status_code == 422


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

    with (
        patch(
            "backend.app.api.v1.sessions.default_session_service.get_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch(
            "backend.app.api.v1.sessions.default_session_service.get_session_messages",
            new=AsyncMock(return_value=fake_messages),
        ),
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

    with (
        patch(
            "backend.app.api.v1.sessions.default_session_service.get_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch(
            "backend.app.api.v1.sessions.default_conversation_service.process_message",
            new=AsyncMock(return_value=fake_completed_response),
        ),
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
        yield {
            "event": "stage",
            "data": {"stage": "loading_context", "label": "Loading..."},
        }
        yield {
            "event": "stage",
            "data": {"stage": "retrieving", "label": "Retrieving..."},
        }
        yield {
            "event": "completed",
            "data": {
                "message": {"content": "Final answer [E1]"},
                "citations": [{"evidence_id": "E1"}],
                "insufficient_evidence": False,
            },
        }

    with (
        patch(
            "backend.app.api.v1.sessions.default_session_service.get_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch(
            "backend.app.api.v1.sessions.default_conversation_service.process_message_stream",
            side_effect=mock_stream,
        ),
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


def test_submit_message_rejects_null_bytes():
    """Spec §6.3: null bytes must be rejected, not persisted."""
    sess_id = uuid.uuid4()
    response = client.post(
        f"/api/v1/sessions/{sess_id}/messages",
        json={"content": "hello\x00world", "mode": "research", "provider": "local"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_submit_message_rejects_control_characters():
    sess_id = uuid.uuid4()
    response = client.post(
        f"/api/v1/sessions/{sess_id}/messages",
        json={"content": "bad\x02char", "mode": "research", "provider": "local"},
    )
    assert response.status_code == 422


def test_submit_message_allows_tabs_and_newlines():
    sess_id = uuid.uuid4()
    fake_session = ChatSession(
        id=sess_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
    )
    with (
        patch(
            "backend.app.api.v1.sessions.default_session_service.get_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch(
            "backend.app.api.v1.sessions.default_conversation_service.process_message",
            new=AsyncMock(
                return_value={"message": {"status": "complete"}, "citations": []}
            ),
        ),
    ):
        response = client.post(
            f"/api/v1/sessions/{sess_id}/messages",
            json={
                "content": "line one\nline two\ttabbed",
                "mode": "research",
                "provider": "local",
                "stream": False,
            },
        )
        assert response.status_code == 200


def test_submit_message_rejects_artifact_format_for_research_mode():
    """Spec §6.3: artifact_format is only valid for artifact modes."""
    sess_id = uuid.uuid4()
    response = client.post(
        f"/api/v1/sessions/{sess_id}/messages",
        json={
            "content": "Research this",
            "mode": "research",
            "provider": "local",
            "artifact_format": "html",
        },
    )
    assert response.status_code == 422


def test_submit_message_rejects_mismatched_artifact_format():
    sess_id = uuid.uuid4()
    response = client.post(
        f"/api/v1/sessions/{sess_id}/messages",
        json={
            "content": "Make a plate",
            "mode": "artifact_html",
            "provider": "local",
            "artifact_format": "markdown",
        },
    )
    assert response.status_code == 422


def test_submit_message_rejects_disallowed_model():
    """Spec §6.6: model_id outside the server allowlist fails fast with 422."""
    sess_id = uuid.uuid4()
    fake_session = ChatSession(
        id=sess_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
    )
    with patch(
        "backend.app.api.v1.sessions.default_session_service.get_session",
        new=AsyncMock(return_value=fake_session),
    ):
        response = client.post(
            f"/api/v1/sessions/{sess_id}/messages",
            json={
                "content": "Hello",
                "mode": "research",
                "provider": "local",
                "model_id": "not-a-configured-model",
            },
        )
        assert response.status_code == 422
        assert "not-a-configured-model" in response.json()["error"]["message"]


def test_get_session_messages_accepts_pagination():
    sess_id = uuid.uuid4()
    fake_session = ChatSession(
        id=sess_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
    )
    with (
        patch(
            "backend.app.api.v1.sessions.default_session_service.get_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch(
            "backend.app.api.v1.sessions.default_session_service.get_session_messages",
            new=AsyncMock(return_value=[]),
        ) as mock_get,
    ):
        response = client.get(f"/api/v1/sessions/{sess_id}/messages?limit=50&offset=10")
        assert response.status_code == 200
        assert response.json()["limit"] == 50
        assert response.json()["offset"] == 10
        mock_get.assert_called_once()
        assert mock_get.call_args.kwargs.get("limit") == 50
        assert mock_get.call_args.kwargs.get("offset") == 10
