"""
Retrieval Evaluation Benchmark Runner.
Executes curated retrieval test cases from docs/evaluation/retrieval_cases.yaml
against HybridRetrievalService, computes Recall@K and insufficient evidence accuracy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.retrieval.hybrid_search import HybridRetrievalService

logger = logging.getLogger(__name__)


@dataclass
class CaseResult:
    case_id: str
    case_type: str
    question: str
    expected_sources: list[str]
    retrieved_sources: list[str]
    recall_at_k: float
    insufficient_evidence_detected: bool
    passed: bool


@dataclass
class BenchmarkReport:
    total_cases: int = 0
    passed_cases: int = 0
    mean_recall_at_k: float = 0.0
    category_scores: dict[str, float] = field(default_factory=dict)
    case_results: list[CaseResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_cases": self.total_cases,
            "passed_cases": self.passed_cases,
            "mean_recall_at_k": round(self.mean_recall_at_k, 4),
            "category_scores": {
                k: round(v, 4) for k, v in self.category_scores.items()
            },
            "case_results": [
                {
                    "case_id": r.case_id,
                    "case_type": r.case_type,
                    "recall_at_k": round(r.recall_at_k, 4),
                    "insufficient_evidence_detected": r.insufficient_evidence_detected,
                    "passed": r.passed,
                }
                for r in self.case_results
            ],
        }


def calculate_recall_at_k(
    retrieved: list[str], expected: list[str], k: int = 5
) -> float:
    """Compute Recall@K: proportion of expected sources appearing in top K results."""
    if not expected:
        return 1.0
    top_k = set(retrieved[:k])
    matched = sum(1 for exp in expected if exp in top_k)
    return matched / len(expected)


async def run_retrieval_benchmark(
    eval_cases_path: Path,
    service: HybridRetrievalService,
    session: AsyncSession,
    k: int = 5,
) -> BenchmarkReport:
    """
    Execute benchmark test cases against HybridRetrievalService.

    Evaluates:
    - Recall@K for cases with expected sources.
    - True-positive detection of insufficient evidence for unsupported queries.
    """
    raw_yaml = eval_cases_path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw_yaml)

    cases = data.get("cases", [])
    results: list[CaseResult] = []
    category_recalls: dict[str, list[float]] = {}

    for case in cases:
        cid = case["case_id"] if "case_id" in case else case["id"]
        ctype = case.get("case_type", "general")
        question = case["question"]
        expected = case.get("expected_sources", [])

        # Execute search
        search_result = await service.search(session=session, query=question, top_k=k)
        retrieved_sources = [item.source_key for item in search_result.items]

        if ctype == "unsupported":
            # For unsupported queries: pass if insufficient_evidence is detected or no sources retrieved
            passed = search_result.insufficient_evidence or (
                len(retrieved_sources) == 0
            )
            recall = 1.0 if passed else 0.0
        else:
            recall = calculate_recall_at_k(retrieved_sources, expected, k=k)
            # Pass if at least 1 expected source is retrieved (or 100% recall)
            passed = recall > 0.0

        case_res = CaseResult(
            case_id=cid,
            case_type=ctype,
            question=question,
            expected_sources=expected,
            retrieved_sources=retrieved_sources,
            recall_at_k=recall,
            insufficient_evidence_detected=search_result.insufficient_evidence,
            passed=passed,
        )
        results.append(case_res)

        if ctype not in category_recalls:
            category_recalls[ctype] = []
        category_recalls[ctype].append(recall)

    # Compute aggregate metrics
    total = len(results)
    passed_count = sum(1 for r in results if r.passed)
    mean_recall = sum(r.recall_at_k for r in results) / total if total > 0 else 0.0

    cat_scores = {
        cat: (sum(recalls) / len(recalls) if recalls else 0.0)
        for cat, recalls in category_recalls.items()
    }

    return BenchmarkReport(
        total_cases=total,
        passed_cases=passed_count,
        mean_recall_at_k=mean_recall,
        category_scores=cat_scores,
        case_results=results,
    )
