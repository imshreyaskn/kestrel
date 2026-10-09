"""
Unit tests for GrowthBriefService and ArtifactService.
(Codename: Kestrel)
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.app.models.entities import Artifact, GrowthBrief
from backend.app.services.artifact_service import ArtifactService
from backend.app.services.growth_brief_service import GrowthBriefService


@pytest.mark.asyncio
async def test_growth_brief_create_and_update_with_versioning():
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    session_id = uuid.uuid4()
    brief_id = uuid.uuid4()

    # 1. Create
    brief = await GrowthBriefService.create_growth_brief(
        db=mock_db,
        session_id=session_id,
        title="Activation Loop",
        problem="Low signup completion",
        research_summary="Interactive onboarding works best",
        recommendation="Ship interactive walkthrough",
        assumptions=["User has modern browser"],
        experiment={"hypothesis": "Lift D1 retention by 10%"},
        risks=["High initial engineering lift"],
        next_deliverable="Spec doc",
    )

    assert brief.title == "Activation Loop"
    assert brief.version == 1
    assert brief.data["problem"] == "Low signup completion"
    assert mock_db.add.called
    assert mock_db.commit.called

    # 2. Update with version match
    brief.id = brief_id
    mock_res = MagicMock()
    mock_res.scalars.return_value.first.return_value = brief
    mock_db.execute.return_value = mock_res

    updated = await GrowthBriefService.update_growth_brief(
        db=mock_db,
        brief_id=brief_id,
        title="Updated Activation Loop",
        expected_version=1,
    )

    assert updated.title == "Updated Activation Loop"
    assert updated.version == 2


@pytest.mark.asyncio
async def test_growth_brief_version_conflict_raises_error():
    mock_db = AsyncMock()
    brief_id = uuid.uuid4()

    brief = GrowthBrief(
        id=brief_id,
        session_id=uuid.uuid4(),
        title="Brief",
        version=2,
        data={},
    )
    mock_res = MagicMock()
    mock_res.scalars.return_value.first.return_value = brief
    mock_db.execute.return_value = mock_res

    with pytest.raises(ValueError, match="Version conflict"):
        await GrowthBriefService.update_growth_brief(
            db=mock_db,
            brief_id=brief_id,
            title="Concurrent Edit",
            expected_version=1,  # Stale version!
        )


@pytest.mark.asyncio
async def test_artifact_create_html_generates_sandboxed_preview():
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    session_id = uuid.uuid4()
    raw_html = "<div class='banner'><h1>Dashboard</h1><script>steal()</script></div>"

    artifact = await ArtifactService.create_artifact(
        db=mock_db,
        session_id=session_id,
        kind="html",
        title="Metrics Dashboard",
        content=raw_html,
    )

    assert artifact.kind == "html"
    assert artifact.version == 1
    assert artifact.preview_content is not None
    assert "<meta http-equiv=\"Content-Security-Policy\"" in artifact.preview_content
    assert "<script>" not in artifact.preview_content
    assert "<h1>Dashboard</h1>" in artifact.preview_content


@pytest.mark.asyncio
async def test_artifact_version_conflict_raises_error():
    mock_db = AsyncMock()
    art_id = uuid.uuid4()

    artifact = Artifact(
        id=art_id,
        session_id=uuid.uuid4(),
        kind="markdown",
        title="Artifact",
        content="# Content",
        version=3,
    )
    mock_res = MagicMock()
    mock_res.scalars.return_value.first.return_value = artifact
    mock_db.execute.return_value = mock_res

    with pytest.raises(ValueError, match="Version conflict"):
        await ArtifactService.update_artifact(
            db=mock_db,
            artifact_id=art_id,
            content="# New Content",
            expected_version=2,  # Stale version!
        )
