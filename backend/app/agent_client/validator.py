"""
Agent Output Validator and Evidence Grounding Checker (Codename: Kestrel)
Implements IMPLEMENTATION_SPEC.md §7.6, §8, and §15.4.
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.app.core.json_extractor import (
    StructuredExtractionError,
    extract_json_payload,
)

# Ship 30 for 30 essay bounds per IMPLEMENTATION_SPEC.md §8.4 and
# runtime-skills/ship-30-for-30/SKILL.md: target 1,250 words, accepted
# first-draft range 1,150–1,350 words.
ESSAY_MIN_WORDS = 1150
ESSAY_MAX_WORDS = 1350


class EssayLengthError(StructuredExtractionError):
    """Raised when a generated essay falls outside the accepted word range."""

    def __init__(self, actual_words: int) -> None:
        self.actual_words = actual_words
        super().__init__(
            f"Essay length {actual_words} words is outside the accepted "
            f"range of {ESSAY_MIN_WORDS}-{ESSAY_MAX_WORDS} words "
            f"(target ~1,250)."
        )


class CitationItem(BaseModel):
    evidence_id: str
    supports: str = ""


class ValidatedResearchResponse(BaseModel):
    mode: Literal["research"] = "research"
    answer_markdown: str
    citations: list[CitationItem] = Field(default_factory=list)
    insufficient_evidence: bool = False
    follow_up_question: str | None = None


class ExperimentPlan(BaseModel):
    hypothesis: str = ""
    change: str = ""
    segment: str = ""
    success_metric: str = ""
    guardrail_metric: str = ""
    decision_rule: str = ""


class ValidatedGrowthBriefResponse(BaseModel):
    mode: Literal["growth_brief"] = "growth_brief"
    title: str = "Growth Brief"
    problem: str = ""
    research_summary: str = ""
    recommendation: str = ""
    assumptions: list[str] = Field(default_factory=list)
    experiment: ExperimentPlan = Field(default_factory=ExperimentPlan)
    risks: list[str] = Field(default_factory=list)
    next_deliverable: str = ""
    citations: list[CitationItem] = Field(default_factory=list)
    insufficient_evidence: bool = False


class ValidatedEssayResponse(BaseModel):
    mode: Literal["essay"] = "essay"
    title: str = "Digital Essay"
    essay_markdown: str = ""
    approximate_word_count: int = 0
    actual_word_count: int = 0
    writing_path: str = "actionable"
    citations: list[CitationItem] = Field(default_factory=list)
    insufficient_evidence: bool = False


class ValidatedArtifactResponse(BaseModel):
    mode: Literal["artifact_markdown", "artifact_html"]
    kind: Literal["markdown", "html"]
    title: str = "Artifact"
    content: str = ""
    source_evidence_ids: list[str] = Field(default_factory=list)


ValidatedResponse = (
    ValidatedResearchResponse
    | ValidatedGrowthBriefResponse
    | ValidatedEssayResponse
    | ValidatedArtifactResponse
)


_WORD_COUNT_RE = re.compile(r"\b\w+\b")


def count_words(text: str) -> int:
    """Calculate word count for essay and document content."""
    if not text:
        return 0
    return len(_WORD_COUNT_RE.findall(text))


def filter_valid_citations(
    citations_data: Any,
    valid_evidence_ids: set[str],
) -> list[CitationItem]:
    """
    Filter citation items to retain only those referencing real evidence IDs
    provided in the current run's retrieval set. Strips model hallucinations.
    """
    if not isinstance(citations_data, list):
        return []

    valid_citations: list[CitationItem] = []
    seen_ids: set[str] = set()

    for item in citations_data:
        eid = ""
        supports = ""
        if isinstance(item, dict):
            eid = str(item.get("evidence_id", "")).strip()
            supports = str(item.get("supports", "")).strip()
        elif isinstance(item, str):
            eid = item.strip()

        if eid in valid_evidence_ids and eid not in seen_ids:
            seen_ids.add(eid)
            valid_citations.append(CitationItem(evidence_id=eid, supports=supports))

    return valid_citations


def validate_agent_response(
    raw_response_text: str,
    mode: str,
    valid_evidence_ids: set[str],
) -> ValidatedResponse:
    """
    Parse, sanitize, validate, and ground LLM response text into a typed response model.
    Enforces that citation IDs must strictly belong to valid_evidence_ids.
    """
    raw_json = extract_json_payload(raw_response_text)
    try:
        payload = json.loads(raw_json, strict=False)
        if not isinstance(payload, dict):
            raise StructuredExtractionError("Extracted JSON root must be an object")
    except json.JSONDecodeError as exc:
        raise StructuredExtractionError(
            f"Failed to parse extracted JSON: {exc}"
        ) from exc

    if mode == "growth_brief":
        raw_citations = payload.get("citations", [])
        cleaned_citations = filter_valid_citations(raw_citations, valid_evidence_ids)

        exp_data = payload.get("experiment", {})
        if not isinstance(exp_data, dict):
            exp_data = {}

        assumptions = payload.get("assumptions", [])
        if not isinstance(assumptions, list):
            assumptions = [str(assumptions)] if assumptions else []

        risks = payload.get("risks", [])
        if not isinstance(risks, list):
            risks = [str(risks)] if risks else []

        return ValidatedGrowthBriefResponse(
            title=str(payload.get("title", "Growth Brief")).strip(),
            problem=str(payload.get("problem", "")).strip(),
            research_summary=str(payload.get("research_summary", "")).strip(),
            recommendation=str(payload.get("recommendation", "")).strip(),
            assumptions=[str(a) for a in assumptions],
            experiment=ExperimentPlan(
                hypothesis=str(exp_data.get("hypothesis", "")),
                change=str(exp_data.get("change", "")),
                segment=str(exp_data.get("segment", "")),
                success_metric=str(exp_data.get("success_metric", "")),
                guardrail_metric=str(exp_data.get("guardrail_metric", "")),
                decision_rule=str(exp_data.get("decision_rule", "")),
            ),
            risks=[str(r) for r in risks],
            next_deliverable=str(payload.get("next_deliverable", "")).strip(),
            citations=cleaned_citations,
            insufficient_evidence=bool(payload.get("insufficient_evidence", False)),
        )

    elif mode == "essay":
        raw_citations = payload.get("citations", [])
        cleaned_citations = filter_valid_citations(raw_citations, valid_evidence_ids)
        essay_text = str(payload.get("essay_markdown", "")).strip()
        actual_wc = count_words(essay_text)
        approx_wc = int(payload.get("approximate_word_count", actual_wc) or actual_wc)

        # Spec §8.4 word-count gate: reject drafts outside 1,150–1,350 words
        # rather than persisting an essay that violates the skill contract.
        if not (ESSAY_MIN_WORDS <= actual_wc <= ESSAY_MAX_WORDS):
            raise EssayLengthError(actual_wc)

        return ValidatedEssayResponse(
            title=str(payload.get("title", "Digital Essay")).strip(),
            essay_markdown=essay_text,
            approximate_word_count=approx_wc,
            actual_word_count=actual_wc,
            writing_path=str(payload.get("writing_path", "actionable")),
            citations=cleaned_citations,
            insufficient_evidence=bool(payload.get("insufficient_evidence", False)),
        )

    elif mode in ("artifact_markdown", "artifact_html"):
        kind: Literal["markdown", "html"] = (
            "html"
            if mode == "artifact_html" or payload.get("kind") == "html"
            else "markdown"
        )
        raw_eids = payload.get("source_evidence_ids", [])
        if not isinstance(raw_eids, list):
            raw_eids = []
        cleaned_eids = [
            str(eid).strip()
            for eid in raw_eids
            if str(eid).strip() in valid_evidence_ids
        ]

        return ValidatedArtifactResponse(
            mode="artifact_html" if kind == "html" else "artifact_markdown",
            kind=kind,
            title=str(payload.get("title", "Artifact")).strip(),
            content=str(payload.get("content", "")).strip(),
            source_evidence_ids=cleaned_eids,
        )

    else:  # default "research"
        raw_citations = payload.get("citations", [])
        cleaned_citations = filter_valid_citations(raw_citations, valid_evidence_ids)
        answer = str(payload.get("answer_markdown", "")).strip()

        follow_up = payload.get("follow_up_question")
        follow_up_str = str(follow_up).strip() if follow_up else None

        return ValidatedResearchResponse(
            answer_markdown=answer,
            citations=cleaned_citations,
            insufficient_evidence=bool(payload.get("insufficient_evidence", False)),
            follow_up_question=follow_up_str,
        )
