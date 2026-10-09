"""
Retrieval Benchmark Evaluation Suite.
Validates the curated retrieval evaluation cases (docs/evaluation/retrieval_cases.yaml)
and executes the benchmark runner to compute Recall@K and insufficient evidence detection accuracy.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
import yaml

from backend.app.retrieval.benchmark import (
    calculate_recall_at_k,
    run_retrieval_benchmark,
)
from backend.app.retrieval.hybrid_search import (
    EvidenceItem,
    HybridRetrievalService,
    RetrievalResult,
)

CASES_FILE = Path("docs/evaluation/retrieval_cases.yaml")


def load_retrieval_cases() -> list[dict]:
    assert CASES_FILE.exists(), f"Evaluation cases fixture not found at {CASES_FILE}"
    with open(CASES_FILE, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    cases = data.get("cases", [])
    return cases


def test_retrieval_fixture_integrity() -> None:
    """Verify that all 20 evaluation cases meet the schema requirements."""
    cases = load_retrieval_cases()
    assert len(cases) >= 20, (
        f"Expected at least 20 evaluation cases, found {len(cases)}"
    )

    valid_types = {
        "factual",
        "semantic",
        "framework",
        "multi_episode",
        "follow_up",
        "unsupported",
        "nuanced",
        "typo_short",
    }

    seen_ids = set()
    type_counts: dict[str, int] = {}

    for c in cases:
        # Check required fields
        assert c.get("id"), f"Case missing ID: {c}"
        assert c["id"] not in seen_ids, f"Duplicate case ID: {c['id']}"
        seen_ids.add(c["id"])

        assert "question" in c and len(c["question"].strip()) > 0
        assert "case_type" in c and c["case_type"] in valid_types, (
            f"Invalid case_type in {c['id']}: {c.get('case_type')}"
        )
        assert "expected_sources" in c and isinstance(c["expected_sources"], list)
        assert c.get("expected_behavior")

        type_counts[c["case_type"]] = type_counts.get(c["case_type"], 0) + 1

    # Verify coverage across all 8 required categories
    for t in valid_types:
        assert t in type_counts, f"Category '{t}' is missing from evaluation cases"
        assert type_counts[t] >= 1, f"Category '{t}' has no test cases"


def test_recall_at_k_calculation() -> None:
    """Unit test for Recall@K calculation helper."""
    expected = ["episodes/a/transcript.md", "episodes/b/transcript.md"]
    retrieved = [
        "episodes/a/transcript.md",
        "episodes/c/transcript.md",
        "episodes/b/transcript.md",
    ]
    # In top 3: both 'a' and 'b' found
    assert calculate_recall_at_k(retrieved, expected, k=3) == 1.0
    # In top 2: only 'a' found
    assert calculate_recall_at_k(retrieved, expected, k=2) == 0.5
    # Empty expected (unsupported question)
    assert calculate_recall_at_k(retrieved, [], k=5) == 1.0


@pytest.mark.asyncio
async def test_benchmark_runner_executes_all_twenty_cases() -> None:
    """Verify that the benchmark runner executes all 20 cases and computes category metrics."""
    cases = load_retrieval_cases()
    mock_service = MagicMock(spec=HybridRetrievalService)

    async def mock_search(session, query, top_k=5):
        # Find matching case
        matched_case = next((c for c in cases if c["question"] == query), None)
        if not matched_case or matched_case.get("case_type") == "unsupported":
            return RetrievalResult(
                items=[],
                insufficient_evidence=True,
                query=query,
                top_score=0.0,
            )

        # Generate mock evidence items for expected sources
        mock_items = []
        for i, src_key in enumerate(matched_case.get("expected_sources", [])):
            item = EvidenceItem(
                evidence_id=f"E{i + 1}",
                chunk_id=uuid.uuid4(),
                source_id=uuid.uuid4(),
                source_key=src_key,
                chunk_index=0,
                episode_title=f"Episode {src_key}",
                guest="Sample Guest",
                episode_url="https://youtube.com/watch?v=sample",
                publish_date="2023-01-01",
                excerpt="Evidence excerpt content.",
                char_start=0,
                char_end=100,
                rrf_score=0.015,
                dense_rank=1,
                sparse_rank=1,
            )
            mock_items.append(item)

        return RetrievalResult(
            items=mock_items,
            insufficient_evidence=False,
            query=query,
            top_score=0.015,
        )

    mock_service.search = AsyncMock(side_effect=mock_search)
    mock_session = AsyncMock()

    report = await run_retrieval_benchmark(
        eval_cases_path=CASES_FILE,
        service=mock_service,
        session=mock_session,
        k=5,
    )

    assert report.total_cases == len(cases)
    assert report.total_cases >= 20
    assert report.passed_cases == len(cases)
    assert report.mean_recall_at_k == 1.0
    assert len(report.category_scores) == 8
    assert report.category_scores["unsupported"] == 1.0
    assert report.category_scores["factual"] == 1.0
