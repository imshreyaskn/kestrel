"""
Unit tests for Wave B remediation behaviors:
1. Reconciling stale pending messages on server restart (BA3).
2. Optimistic concurrency control (StaleDataError -> ValueError mapping) in GrowthBriefService and ArtifactService (BA5).
"""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.orm.exc import StaleDataError

from backend.app.models.entities import Artifact, GrowthBrief
from backend.app.services.artifact_service import ArtifactService
from backend.app.services.growth_brief_service import GrowthBriefService
from backend.app.services.session_service import SessionService


@pytest.mark.asyncio
async def test_reconcile_stale_pending_messages():
    """BA3: reconcile_stale_pending_messages sets status='failed' and error_code='SERVER_RESTARTED'."""
    mock_db = AsyncMock()
    mock_result = AsyncMock()
    mock_result.rowcount = 3
    mock_db.execute.return_value = mock_result

    count = await SessionService.reconcile_stale_pending_messages(mock_db)

    assert count == 3
    assert mock_db.execute.called
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_growth_brief_update_handles_stale_data_error():
    """BA5: StaleDataError raised during commit raises ValueError(Version conflict)."""
    brief_id = uuid.uuid4()
    session_id = uuid.uuid4()
    mock_brief = GrowthBrief(
        id=brief_id,
        session_id=session_id,
        title="Original Title",
        version=1,
        status="draft",
        data={"problem": "P1"},
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    mock_db = AsyncMock()
    mock_db.commit.side_effect = StaleDataError(
        "Row was updated or deleted by another transaction"
    )

    with patch.object(
        GrowthBriefService, "get_growth_brief", new=AsyncMock(return_value=mock_brief)
    ):
        with pytest.raises(
            ValueError, match=f"Version conflict on growth brief {brief_id}"
        ):
            await GrowthBriefService.update_growth_brief(
                db=mock_db,
                brief_id=brief_id,
                title="New Title",
                expected_version=1,
            )
        assert mock_db.rollback.called


@pytest.mark.asyncio
async def test_artifact_update_handles_stale_data_error():
    """BA5: StaleDataError raised during commit on artifact raises ValueError(Version conflict)."""
    artifact_id = uuid.uuid4()
    session_id = uuid.uuid4()
    mock_artifact = Artifact(
        id=artifact_id,
        session_id=session_id,
        kind="markdown",
        title="Original Title",
        content="# Content",
        version=1,
        created_at=datetime.datetime.now(datetime.UTC),
        updated_at=datetime.datetime.now(datetime.UTC),
    )

    mock_db = AsyncMock()
    mock_db.commit.side_effect = StaleDataError(
        "Row was updated or deleted by another transaction"
    )

    with patch.object(
        ArtifactService, "get_artifact", new=AsyncMock(return_value=mock_artifact)
    ):
        with pytest.raises(
            ValueError, match=f"Version conflict on artifact {artifact_id}"
        ):
            await ArtifactService.update_artifact(
                db=mock_db,
                artifact_id=artifact_id,
                title="New Title",
                expected_version=1,
            )
        assert mock_db.rollback.called
