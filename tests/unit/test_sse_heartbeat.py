"""
Unit tests for SSE Heartbeat Ping (BA6).
Verifies that slow stream operations yield ': ping\\n\\n' keepalive comments.
"""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.entities import ChatSession

client = TestClient(app)


@pytest.mark.asyncio
async def test_sse_heartbeat_ping_during_drafting():
    """BA6: event_generator emits ': ping\\n\\n' when stream producer is delayed."""
    session_id = uuid.uuid4()
    fake_session = ChatSession(
        id=session_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
        title="Test Session",
        provider_preference="local",
    )

    async def slow_stream(*args, **kwargs):
        yield {"event": "stage", "data": {"stage": "retrieving"}}
        # Delay longer than heartbeat interval (0.05s) to force heartbeat pings
        await asyncio.sleep(0.12)
        yield {"event": "completed", "data": {"status": "complete"}}

    with patch(
        "backend.app.api.v1.sessions.default_session_service.get_session",
        new=AsyncMock(return_value=fake_session),
    ), patch(
        "backend.app.api.v1.sessions.default_conversation_service.process_message_stream",
        side_effect=slow_stream,
    ), patch("backend.app.api.v1.sessions.SSE_HEARTBEAT_INTERVAL_SECONDS", 0.04):
        response = client.post(
            f"/api/v1/sessions/{session_id}/messages",
            json={
                "content": "Test prompt",
                "mode": "research",
                "provider": "local",
                "stream": True,
            },
        )

        assert response.status_code == 200
        text = response.text
        assert ": ping\n\n" in text
        assert "event: stage" in text
        assert "event: completed" in text
