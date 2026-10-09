"""
Retrieval Benchmark Evaluation Suite.
Validates the curated retrieval evaluation cases (docs/evaluation/retrieval_cases.yaml)
and computes Recall@K and relevance metrics.
"""

from pathlib import Path

import yaml

CASES_FILE = Path("docs/evaluation/retrieval_cases.yaml")


def load_retrieval_cases() -> list[dict]:
    assert CASES_FILE.exists(), f"Evaluation cases fixture not found at {CASES_FILE}"
    with open(CASES_FILE, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    cases = data.get("cases", [])
    return cases


def test_retrieval_fixture_integrity():
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
    type_counts = {}

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


def compute_recall_at_k(
    retrieved_source_keys: list[str], expected_sources: list[str], k: int = 5
) -> float:
    """Compute Recall@K: proportion of expected sources retrieved within top K."""
    if not expected_sources:
        return 1.0  # Unsupported query correctly expects empty retrieval

    top_k_keys = set(retrieved_source_keys[:k])
    matched = sum(1 for exp in expected_sources if exp in top_k_keys)
    return matched / len(expected_sources)


def test_recall_at_k_calculation():
    """Unit test for Recall@K calculation helper."""
    expected = ["episodes/a/transcript.md", "episodes/b/transcript.md"]
    retrieved = [
        "episodes/a/transcript.md",
        "episodes/c/transcript.md",
        "episodes/b/transcript.md",
    ]
    # In top 3: both 'a' and 'b' found
    assert compute_recall_at_k(retrieved, expected, k=3) == 1.0
    # In top 2: only 'a' found
    assert compute_recall_at_k(retrieved, expected, k=2) == 0.5
    # Empty expected (unsupported question)
    assert compute_recall_at_k(retrieved, [], k=5) == 1.0
