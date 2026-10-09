"""
Unit tests for Growth Briefs and Artifacts API endpoints.
(Codename: Kestrel)
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.entities import Artifact, GrowthBrief

client = TestClient(app)


def test_get_growth_brief_endpoint():
    brief_id = uuid.uuid4()
    session_id = uuid.uuid4()
    fake_brief = GrowthBrief(
        id=brief_id,
        session_id=session_id,
        title="Activation Strategy Brief",
        version=1,
        status="draft",
        data={"problem": "Friction in signup"},
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    with patch(
        "backend.app.api.v1.growth_briefs.default_growth_brief_service.get_growth_brief",
        new=AsyncMock(return_value=fake_brief),
    ):
        response = client.get(f"/api/v1/growth-briefs/{brief_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Activation Strategy Brief"
        assert data["version"] == 1
        assert data["data"]["problem"] == "Friction in signup"


def test_update_growth_brief_version_conflict_returns_409():
    brief_id = uuid.uuid4()
    with patch(
        "backend.app.api.v1.growth_briefs.default_growth_brief_service.update_growth_brief",
        side_effect=ValueError("Version conflict on growth brief"),
    ):
        response = client.patch(
            f"/api/v1/growth-briefs/{brief_id}",
            json={"title": "Updated", "expected_version": 1},
        )
        assert response.status_code == 409
        data = response.json()
        assert "error" in data
        assert "conflict" in data["error"]["message"].lower()


def test_get_artifact_endpoint():
    art_id = uuid.uuid4()
    session_id = uuid.uuid4()
    fake_artifact = Artifact(
        id=art_id,
        session_id=session_id,
        kind="html",
        title="Metrics Dashboard",
        content="<div>Safe Content</div>",
        preview_content="<!DOCTYPE html><html><body><div>Safe Content</div></body></html>",
        version=1,
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    with patch(
        "backend.app.api.v1.artifacts.default_artifact_service.get_artifact",
        new=AsyncMock(return_value=fake_artifact),
    ):
        response = client.get(f"/api/v1/artifacts/{art_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["kind"] == "html"
        assert data["title"] == "Metrics Dashboard"
        assert data["preview_content"] is not None


def test_update_artifact_version_conflict_returns_409():
    art_id = uuid.uuid4()
    with patch(
        "backend.app.api.v1.artifacts.default_artifact_service.update_artifact",
        side_effect=ValueError("Version conflict on artifact"),
    ):
        response = client.patch(
            f"/api/v1/artifacts/{art_id}",
            json={"content": "New content", "expected_version": 2},
        )
        assert response.status_code == 409
        data = response.json()
        assert "error" in data
        assert "conflict" in data["error"]["message"].lower()
