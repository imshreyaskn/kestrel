"""
Unit tests for syncer discovery and indexer idempotency workflow.
Tests file discovery, source key canonicalization, and indexer lifecycle.
"""

import hashlib
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.app.ingestion.indexer import TranscriptIndexer
from backend.app.ingestion.syncer import (
    discover_transcripts,
    get_canonical_source_key,
)
from backend.app.models.entities import TranscriptSource
from backend.app.retrieval.embedder import DeterministicFakeEmbeddingProvider


def test_syncer_discover_transcripts(tmp_path: Path):
    episodes_dir = tmp_path / "episodes"
    ep1 = episodes_dir / "ep-1"
    ep2 = episodes_dir / "ep-2"
    other = tmp_path / "other"
    ep1.mkdir(parents=True)
    ep2.mkdir(parents=True)
    other.mkdir(parents=True)

    # Create files
    (ep1 / "transcript.md").write_text("# Ep 1", encoding="utf-8")
    (ep2 / "transcript.md").write_text("# Ep 2", encoding="utf-8")
    (ep1 / "audio.mp3").write_text("dummy", encoding="utf-8")
    (other / "readme.txt").write_text("dummy", encoding="utf-8")

    discovered = discover_transcripts(tmp_path)
    assert len(discovered) == 2
    assert discovered[0].name == "transcript.md"
    assert discovered[1].name == "transcript.md"

    # Canonical source keys
    key1 = get_canonical_source_key(discovered[0], tmp_path)
    key2 = get_canonical_source_key(discovered[1], tmp_path)
    assert key1 == "episodes/ep-1/transcript.md"
    assert key2 == "episodes/ep-2/transcript.md"


@pytest.mark.asyncio
async def test_indexer_idempotency_skip_unchanged_file(tmp_path: Path):
    ep_dir = tmp_path / "episodes" / "test-ep"
    ep_dir.mkdir(parents=True)
    transcript_file = ep_dir / "transcript.md"
    content = "---\nguest: Test\ntitle: Test Episode\n---\n\nLenny (00:00:00):\nHello world.\n"
    transcript_file.write_text(content, encoding="utf-8")

    # Compute expected hash
    expected_hash = hashlib.sha256(
        content.strip().replace("\r\n", "\n").encode("utf-8")
    ).hexdigest()

    mock_existing_source = MagicMock(spec=TranscriptSource)
    mock_existing_source.content_hash = expected_hash
    mock_existing_source.source_key = "episodes/test-ep/transcript.md"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_existing_source
    mock_session.execute.return_value = mock_result

    class MockContextManager:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_factory = MagicMock(return_value=MockContextManager())

    embedder = DeterministicFakeEmbeddingProvider()
    indexer = TranscriptIndexer(embedder=embedder, session_factory=mock_factory)

    stats = await indexer.index_directory(tmp_path)

    # Since content hash matches, it should be skipped
    assert stats.discovered == 1
    assert stats.skipped == 1
    assert stats.created == 0
    assert stats.updated == 0
    # No chunks added
    assert mock_session.add.call_count == 0


@pytest.mark.asyncio
async def test_indexer_creates_new_source_and_chunks(tmp_path: Path):
    ep_dir = tmp_path / "episodes" / "new-ep"
    ep_dir.mkdir(parents=True)
    transcript_file = ep_dir / "transcript.md"
    content = "---\nguest: Alice\ntitle: Alice on Growth\n---\n\nAlice (00:00:00):\nRetention is king.\n"
    transcript_file.write_text(content, encoding="utf-8")

    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_session.add_all = MagicMock()
    mock_result = MagicMock()
    # Source does not exist in DB yet
    mock_result.scalar_one_or_none.return_value = None
    mock_result.rowcount = 0
    mock_session.execute.return_value = mock_result

    # Mock nested transaction context manager
    nested_cm = MagicMock()
    nested_cm.__aenter__ = AsyncMock(return_value=None)
    nested_cm.__aexit__ = AsyncMock(return_value=None)
    mock_session.begin_nested = MagicMock(return_value=nested_cm)

    class MockContextManager:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_factory = MagicMock(return_value=MockContextManager())

    embedder = DeterministicFakeEmbeddingProvider()
    indexer = TranscriptIndexer(embedder=embedder, session_factory=mock_factory)

    stats = await indexer.index_directory(tmp_path)

    assert stats.discovered == 1
    assert stats.created == 1
    assert stats.skipped == 0
    assert stats.updated == 0
    assert mock_session.add.call_count == 1
    assert mock_session.add_all.call_count == 1
    assert mock_session.commit.call_count >= 1
