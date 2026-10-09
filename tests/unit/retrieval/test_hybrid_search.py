"""
Unit tests for Hybrid Search RRF Fusion logic.
Tests ranking fusion, source diversity constraint, and evidence labeling.
"""

import uuid

from backend.app.retrieval.hybrid_search import (
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


def test_rrf_fusion_boosts_dual_match():
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


def test_rrf_fusion_source_diversity():
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
