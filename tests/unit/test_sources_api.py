"""
Unit tests for Sources & Chunks API endpoints.
Verifies error envelopes on 404s and response payload schema compliance.
"""

import datetime
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.db.session import get_db
from backend.app.main import app
from backend.app.models.entities import TranscriptSource


@pytest.mark.asyncio
async def test_get_source_not_found_returns_standard_error_envelope():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        non_existent_id = uuid.uuid4()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(f"/api/v1/sources/{non_existent_id}")

        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"
        assert str(non_existent_id) in data["error"]["message"]
        assert data["error"]["retryable"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_chunk_not_found_returns_standard_error_envelope():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        non_existent_id = uuid.uuid4()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(f"/api/v1/chunks/{non_existent_id}")

        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"
        assert str(non_existent_id) in data["error"]["message"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_source_success():
    source_id = uuid.uuid4()
    mock_source = MagicMock(spec=TranscriptSource)
    mock_source.id = source_id
    mock_source.source_key = "episodes/elena-verna/transcript.md"
    mock_source.title = "Elena Verna on PLG"
    mock_source.guest = "Elena Verna"
    mock_source.episode_url = "https://youtube.com/watch?v=elena"
    mock_source.video_id = "elena"
    mock_source.publish_date = datetime.date(2023, 5, 1)
    mock_source.description = "B2B PLG strategies."
    mock_source.is_active = True
    mock_source.ingested_at = datetime.datetime.now(datetime.UTC)

    mock_db = AsyncMock()
    # First call for source
    source_result = MagicMock()
    source_result.scalar_one_or_none.return_value = mock_source
    # Second call for chunk count
    count_result = MagicMock()
    count_result.scalar.return_value = 15

    mock_db.execute.side_effect = [source_result, count_result]

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(f"/api/v1/sources/{source_id}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(source_id)
        assert data["title"] == "Elena Verna on PLG"
        assert data["guest"] == "Elena Verna"
        assert data["total_chunks"] == 15
        assert data["publish_date"] == "2023-05-01"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_ingestion_status_endpoint():
    mock_db = AsyncMock()
    mock_db.scalar.side_effect = [100, 98, 1250]

    mock_result = MagicMock()
    mock_result.first.return_value = (
        "abc1234",
        datetime.datetime(2026, 10, 9, 12, 0, 0, tzinfo=datetime.UTC),
    )
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/v1/ingestion/status")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total_sources"] == 100
        assert data["active_sources"] == 98
        assert data["total_chunks"] == 1250
        assert data["latest_commit"] == "abc1234"
    finally:
        app.dependency_overrides.clear()
