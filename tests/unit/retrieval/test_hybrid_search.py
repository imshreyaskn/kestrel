"""
Unit tests for Hybrid Search RRF Fusion logic and HybridRetrievalService.
Tests ranking fusion, source diversity constraint, evidence labeling,
and end-to-end service query execution with score filtering and insufficient evidence detection.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import SQLAlchemyError

from backend.app.retrieval.embedder import DeterministicFakeEmbeddingProvider
from backend.app.retrieval.hybrid_search import (
    HybridRetrievalService,
    RetrievalResult,
    RetrievedCandidate,
    compute_rrf_fusion,
)


def create_candidate(
    chunk_id: uuid.UUID,
    source_id: uuid.UUID,
    chunk_index: int = 0,
    title: str = "Test Episode",
    system: str = "dense",
    score: float = 0.8,
) -> RetrievedCandidate:
    return RetrievedCandidate(
        chunk_id=chunk_id,
        source_id=source_id,
        source_key=f"episodes/{source_id}/transcript.md",
        chunk_index=chunk_index,
        content=f"Content for chunk {chunk_id}",
        token_count=100,
        char_start=0,
        char_end=100,
        episode_title=title,
        guest="Test Guest",
        episode_url="https://youtube.com/watch?v=123",
        publish_date="2024-01-01",
        raw_score=score,
        system=system,
    )


def test_rrf_fusion_boosts_dual_match() -> None:
    chunk_a = uuid.uuid4()
    chunk_b = uuid.uuid4()
    chunk_c = uuid.uuid4()
    src_1 = uuid.uuid4()
    src_2 = uuid.uuid4()
    src_3 = uuid.uuid4()

    # chunk_b appears in both dense and sparse
    dense = [
        create_candidate(chunk_a, src_1, system="dense", score=0.9),
        create_candidate(chunk_b, src_2, system="dense", score=0.85),
    ]
    sparse = [
        create_candidate(chunk_b, src_2, system="sparse", score=0.7),
        create_candidate(chunk_c, src_3, system="sparse", score=0.6),
    ]

    fused = compute_rrf_fusion(dense, sparse, top_k=5)

    # chunk_b should be ranked #1 because it has dual signal (dense rank 2 + sparse rank 1)
    assert len(fused) == 3
    assert fused[0].chunk_id == chunk_b
    assert fused[0].evidence_id == "E1"
    assert fused[0].dense_rank == 2
    assert fused[0].sparse_rank == 1


def test_rrf_fusion_source_diversity() -> None:
    src_dominant = uuid.uuid4()
    src_other = uuid.uuid4()

    # Create 5 chunks from src_dominant and 1 chunk from src_other
    dominant_chunks = [
        create_candidate(uuid.uuid4(), src_dominant, chunk_index=i, system="dense")
        for i in range(5)
    ]
    other_chunk = create_candidate(
        uuid.uuid4(), src_other, chunk_index=0, system="dense"
    )

    dense = dominant_chunks + [other_chunk]
    sparse: list[RetrievedCandidate] = []

    # Enforce max_per_source = 2
    fused = compute_rrf_fusion(dense, sparse, top_k=5, max_per_source=2)

    # Should take at most 2 from src_dominant, plus 1 from src_other
    assert len(fused) == 3
    dominant_count = sum(1 for item in fused if item.source_id == src_dominant)
    assert dominant_count == 2
    assert fused[-1].source_id == src_other


def test_evidence_item_to_citation_dict() -> None:
    chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()
    dense = [create_candidate(chunk_id, source_id, system="dense")]

    fused = compute_rrf_fusion(dense, [], top_k=1)
    assert len(fused) == 1
    citation = fused[0].to_citation_dict(supports="Key PMF metric")

    assert citation["evidence_id"] == "E1"
    assert citation["source_id"] == str(source_id)
    assert citation["chunk_id"] == str(chunk_id)
    assert citation["guest"] == "Test Guest"
    assert citation["episode_title"] == "Test Episode"
    assert citation["supports"] == "Key PMF metric"
    assert citation["excerpt"] == f"Content for chunk {chunk_id}"


@pytest.mark.asyncio
async def test_hybrid_retrieval_service_search_execution() -> None:
    """Verify HybridRetrievalService executes dense and sparse searches and fuses results."""
    embedder = DeterministicFakeEmbeddingProvider()
    service = HybridRetrievalService(embedder=embedder, min_dense_score=0.25)

    chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()

    mock_dense_row = {
        "chunk_id": chunk_id,
        "source_id": source_id,
        "source_key": "episodes/elena-verna/transcript.md",
        "chunk_index": 0,
        "content": "Elena Verna discusses B2B freemium metrics and product-led loops.",
        "token_count": 120,
        "char_start": 0,
        "char_end": 120,
        "episode_title": "Elena Verna on PLG",
        "guest": "Elena Verna",
        "episode_url": "https://youtube.com/watch?v=elena",
        "publish_date": "2023-05-01",
        "score": 0.82,
    }

    mock_sparse_row = {
        "chunk_id": chunk_id,
        "source_id": source_id,
        "source_key": "episodes/elena-verna/transcript.md",
        "chunk_index": 0,
        "content": "Elena Verna discusses B2B freemium metrics and product-led loops.",
        "token_count": 120,
        "char_start": 0,
        "char_end": 120,
        "episode_title": "Elena Verna on PLG",
        "guest": "Elena Verna",
        "episode_url": "https://youtube.com/watch?v=elena",
        "publish_date": "2023-05-01",
        "score": 0.65,
    }

    mock_session = AsyncMock()
    dense_res = MagicMock()
    dense_res.mappings.return_value.all.return_value = [mock_dense_row]
    sparse_res = MagicMock()
    sparse_res.mappings.return_value.all.return_value = [mock_sparse_row]

    mock_session.execute.side_effect = [dense_res, sparse_res]

    result = await service.search(mock_session, "freemium product-led growth", top_k=5)

    assert isinstance(result, RetrievalResult)
    assert not result.insufficient_evidence
    assert len(result) == 1
    assert result.top_score > 0
    assert result.top_dense_score == 0.82
    assert result[0].evidence_id == "E1"
    assert result[0].guest == "Elena Verna"
    # Verify iterable behavior
    items = [item for item in result]
    assert len(items) == 1
    assert mock_session.execute.call_count == 2


@pytest.mark.asyncio
async def test_hybrid_retrieval_service_empty_query() -> None:
    """Empty query should return immediately with insufficient_evidence=True without hitting DB."""
    embedder = DeterministicFakeEmbeddingProvider()
    service = HybridRetrievalService(embedder=embedder)

    mock_session = AsyncMock()
    result = await service.search(mock_session, "   ")

    assert result.insufficient_evidence is True
    assert len(result) == 0
    assert mock_session.execute.call_count == 0


@pytest.mark.asyncio
async def test_hybrid_retrieval_service_unsupported_query_triggers_insufficient_evidence() -> (
    None
):
    """When both dense (below min_dense_score) and sparse queries return 0 rows, insufficient_evidence is True."""
    embedder = DeterministicFakeEmbeddingProvider()
    service = HybridRetrievalService(embedder=embedder, min_dense_score=0.25)

    mock_session = AsyncMock()
    empty_dense = MagicMock()
    empty_dense.mappings.return_value.all.return_value = []
    empty_sparse = MagicMock()
    empty_sparse.mappings.return_value.all.return_value = []

    mock_session.execute.side_effect = [empty_dense, empty_sparse]

    result = await service.search(
        mock_session, "Quantum Shor factoring algorithm", top_k=5
    )

    assert result.insufficient_evidence is True
    assert len(result) == 0
    assert result.top_score == 0.0


@pytest.mark.asyncio
async def test_hybrid_retrieval_service_sparse_error_degradation() -> None:
    """If PostgreSQL throws an error during sparse full-text search, service gracefully uses dense candidates."""
    embedder = DeterministicFakeEmbeddingProvider()
    service = HybridRetrievalService(embedder=embedder)

    mock_dense_row = {
        "chunk_id": uuid.uuid4(),
        "source_id": uuid.uuid4(),
        "source_key": "episodes/adam-fishman/transcript.md",
        "chunk_index": 0,
        "content": "Onboarding is the only part of your product that 100% of people touch.",
        "token_count": 80,
        "char_start": 0,
        "char_end": 80,
        "episode_title": "Adam Fishman on Growth Teams",
        "guest": "Adam Fishman",
        "episode_url": "https://youtube.com/watch?v=adam",
        "publish_date": "2022-10-13",
        "score": 0.78,
    }

    mock_session = AsyncMock()
    dense_res = MagicMock()
    dense_res.mappings.return_value.all.return_value = [mock_dense_row]

    # First call succeeds for dense, second call raises SQLAlchemyError for sparse
    mock_session.execute.side_effect = [
        dense_res,
        SQLAlchemyError("tsquery syntax error"),
    ]

    result = await service.search(mock_session, "onboarding 100%", top_k=3)

    assert not result.insufficient_evidence
    assert len(result) == 1
    assert result[0].guest == "Adam Fishman"
