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
    clean_llm_text,
    extract_json_payload,
)

# Ship 30 for 30 essay bounds per IMPLEMENTATION_SPEC.md §8.4 and
# runtime-skills/ship-30-for-30/SKILL.md: target 1,250 words, accepted
# first-draft range 1,150–1,350 words.
ESSAY_MIN_WORDS = 1150
ESSAY_MAX_WORDS = 1350


class AgentOutputError(StructuredExtractionError):
    """Validation failure with a machine-readable reason for targeted repair."""

    def __init__(self, reason_code: str, detail: str = "") -> None:
        self.reason_code = reason_code
        self.detail = detail
        super().__init__(f"{reason_code}: {detail}" if detail else reason_code)


class EssayLengthError(AgentOutputError):
    """Raised when a generated essay falls outside the accepted word range."""

    def __init__(
        self,
        actual_words: int,
        min_words: int = ESSAY_MIN_WORDS,
        max_words: int = ESSAY_MAX_WORDS,
    ) -> None:
        self.actual_words = actual_words
        self.min_words = min_words
        self.max_words = max_words
        super().__init__(
            "ESSAY_LENGTH",
            f"essay was {actual_words} words; contract requires {min_words}-{max_words}",
        )


class CitationItem(BaseModel):
    evidence_id: str
    supports: str = ""


class ValidatedResearchResponse(BaseModel):
    mode: Literal["research"] = "research"
    answer_markdown: str
    citations: list[CitationItem] = Field(default_factory=list)
    scope: Literal["in_scope", "out_of_scope"] = "in_scope"
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


WritingPath = Literal["actionable", "analytical", "aspirational", "anthropological"]
VALID_WRITING_PATHS: set[str] = {
    "actionable",
    "analytical",
    "aspirational",
    "anthropological",
}


class ValidatedEssayResponse(BaseModel):
    mode: Literal["essay"] = "essay"
    title: str = "Digital Essay"
    essay_markdown: str = ""
    approximate_word_count: int = 0
    actual_word_count: int = 0
    writing_path: WritingPath = "actionable"
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
# Matches pictorial emoji while strictly preserving monochrome typographical symbols
# (e.g. checkmarks ✓/✔, ballot crosses ✗/✘, stars ★/☆, and em-dashes/arrows).
_EMOJI_RE = re.compile(
    r"[\U0001F1E6-\U0001FAFF"
    r"\u2702-\u2709\u270A-\u270D\u270F\u2712\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27B0\u27BF"
    r"\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26A7\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD"
    r"\uFE0F]"
)


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
            eid = str(item.get("evidence_id", "")).strip().upper()
            supports = str(item.get("supports", "")).strip()
        elif isinstance(item, str):
            eid = item.strip().upper()

        if eid in valid_evidence_ids and eid not in seen_ids:
            seen_ids.add(eid)
            valid_citations.append(CitationItem(evidence_id=eid, supports=supports))

    return valid_citations


_INLINE_LABEL_RE = re.compile(r"\[([eE]\d+(?:\s*,\s*[eE]\d+)*)\]")


def reconcile_inline_labels(
    text: str,
    citations: list[CitationItem],
    valid_ids: set[str],
    strict: bool = False,
) -> tuple[str, list[CitationItem], list[str]]:
    """Enforce the WYSIWYG citation invariant (CIT5, Move 2):
    1. Removes any [E#] marker not present in valid retrieved evidence (or keeps for repair if strict).
    2. Auto-creates citation records for valid [E#] markers present in text
       that the model omitted from the citations array.
    3. Sorts citations deterministically by numeric evidence rank (e.g. E1, E2, E3...).
    Returns (cleaned_text, completed_and_sorted_citations, invalid_dropped_ids).
    """
    invalid: list[str] = []

    def repl(m: re.Match) -> str:
        parts = [p.strip().upper() for p in m.group(1).split(",") if p.strip()]
        kept: list[str] = []
        has_invalid = False
        for p in parts:
            if p in valid_ids:
                if p not in kept:
                    kept.append(p)
            else:
                if p not in invalid:
                    invalid.append(p)
                has_invalid = True
        if strict and has_invalid:
            return m.group(0)
        if not kept:
            return ""
        return "".join(f"[{k}]" for k in kept)

    cleaned_text = _INLINE_LABEL_RE.sub(repl, text)

    # If strict and there were invalid labels, return early for repair prompt
    if strict and invalid:
        return cleaned_text, citations, invalid

    if not strict:
        # Clean up any trailing whitespace immediately preceding sentence punctuation
        # created by dropping invalid citations (e.g. "Fact [E99]." -> "Fact.")
        cleaned_text = re.sub(r"[ \t]+([.,;!?])", r"\1", cleaned_text)

    # Find all valid [E#] labels present in cleaned_text
    inline_labels: set[str] = set()
    for m in _INLINE_LABEL_RE.finditer(cleaned_text):
        for p in m.group(1).split(","):
            eid = p.strip().upper()
            if eid in valid_ids:
                inline_labels.add(eid)

    existing_eids = {c.evidence_id for c in citations}
    completed_citations = list(citations)

    # Auto-add missing valid citations referenced in text (CIT5)
    for missing_eid in sorted(
        inline_labels - existing_eids,
        key=lambda x: int(x[1:]) if x.startswith("E") and x[1:].isdigit() else 999,
    ):
        completed_citations.append(CitationItem(evidence_id=missing_eid, supports=""))

    # Sort deterministically by numeric evidence rank (Move 1 & CIT4)
    completed_citations.sort(
        key=lambda c: int(c.evidence_id[1:])
        if c.evidence_id.startswith("E") and c.evidence_id[1:].isdigit()
        else 999
    )

    return cleaned_text, completed_citations, invalid


def enforce_inline_labels(
    text: str,
    valid_ids: set[str],
    strict: bool,
) -> tuple[str, list[str]]:
    """Check inline [E#] citation labels against valid retrieved evidence IDs.

    In strict mode, collects invalid labels and leaves text untouched for repair.
    In non-strict mode, strips invalid labels to avoid broken UI affordances.
    """
    cleaned, _, invalid = reconcile_inline_labels(text, [], valid_ids, strict=strict)
    return cleaned, invalid


def _extract_research_raw_fallback(
    raw_text: str,
    valid_evidence_ids: set[str],
) -> ValidatedResearchResponse:
    cleaned = clean_llm_text(raw_text).strip()
    if not cleaned:
        raise AgentOutputError("EMPTY_ANSWER", "Raw model output was empty")

    cleaned_text, _ = enforce_inline_labels(cleaned, valid_evidence_ids, strict=False)

    found_ids: set[str] = set()
    for m in _INLINE_LABEL_RE.finditer(cleaned):
        for part in m.group(1).split(","):
            pid = part.strip()
            if pid in valid_evidence_ids:
                found_ids.add(pid)

    citations = [CitationItem(evidence_id=eid) for eid in sorted(found_ids)]

    return ValidatedResearchResponse(
        mode="research",
        answer_markdown=cleaned_text,
        citations=citations,
        scope="in_scope",
        insufficient_evidence=False,
        follow_up_question=None,
    )


def validate_agent_response(
    raw_response_text: str,
    mode: str,
    valid_evidence_ids: set[str],
    essay_word_target: int | None = None,
    stop_reason: str | None = None,
    strict_labels: bool = True,
    allow_raw_fallback: bool = False,
) -> ValidatedResponse:
    """
    Parse, sanitize, validate, and ground LLM response text into a typed response model.
    Enforces that citation IDs must strictly belong to valid_evidence_ids.
    """
    if stop_reason in ("length", "max_tokens"):
        raise AgentOutputError("TRUNCATED", "provider stopped at the output token ceiling")

    try:
        raw_json = extract_json_payload(raw_response_text)
    except StructuredExtractionError as exc:
        if allow_raw_fallback and mode == "research":
            return _extract_research_raw_fallback(
                raw_response_text, valid_evidence_ids
            )
        raise AgentOutputError("JSON_PARSE", str(exc)) from exc

    try:
        payload = json.loads(raw_json, strict=False)
        if not isinstance(payload, dict):
            if allow_raw_fallback and mode == "research":
                return _extract_research_raw_fallback(
                    raw_response_text, valid_evidence_ids
                )
            raise AgentOutputError("JSON_PARSE", "Extracted JSON root must be an object")
    except json.JSONDecodeError as exc:
        if allow_raw_fallback and mode == "research":
            return _extract_research_raw_fallback(
                raw_response_text, valid_evidence_ids
            )
        raise AgentOutputError("JSON_PARSE", f"Failed to parse extracted JSON: {exc}") from exc

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

        recommendation = str(payload.get("recommendation", "")).strip()
        insufficient = bool(payload.get("insufficient_evidence", False))
        if not recommendation and not insufficient:
            raise AgentOutputError("EMPTY_ANSWER", "Growth brief recommendation must not be empty")

        summary = str(payload.get("research_summary", "")).strip()
        rec_clean, comp_cits, inv_rec = reconcile_inline_labels(
            recommendation, cleaned_citations, valid_evidence_ids, strict=strict_labels
        )
        sum_clean, comp_cits, inv_sum = reconcile_inline_labels(
            summary, comp_cits, valid_evidence_ids, strict=strict_labels
        )
        all_inv = inv_rec + inv_sum
        if strict_labels and all_inv:
            raise AgentOutputError("INVALID_LABELS", ",".join(sorted(set(all_inv))))
        recommendation = rec_clean
        summary = sum_clean
        cleaned_citations = comp_cits

        return ValidatedGrowthBriefResponse(
            title=str(payload.get("title", "Growth Brief")).strip(),
            problem=str(payload.get("problem", "")).strip(),
            research_summary=summary,
            recommendation=recommendation,
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
            insufficient_evidence=insufficient,
        )

    elif mode == "essay":
        raw_citations = payload.get("citations", [])
        cleaned_citations = filter_valid_citations(raw_citations, valid_evidence_ids)
        essay_text = str(payload.get("essay_markdown", "")).strip()
        if not essay_text:
            raise AgentOutputError("EMPTY_ANSWER", "essay_markdown must not be empty")

        essay_text, cleaned_citations, invalid = reconcile_inline_labels(
            essay_text, cleaned_citations, valid_evidence_ids, strict=strict_labels
        )
        if strict_labels and invalid:
            raise AgentOutputError("INVALID_LABELS", ",".join(sorted(set(invalid))))

        insufficient = bool(payload.get("insufficient_evidence", False))

        # Inline markers [E#] or multi-markers like [E1, E2] are citations, not prose words
        countable_text = re.sub(r"\[E\d+(?:\s*,\s*E\d+)*\]", "", essay_text)
        actual_wc = count_words(countable_text)
        approx_wc = int(payload.get("approximate_word_count", actual_wc) or actual_wc)

        if essay_word_target is not None:
            min_wc = round(essay_word_target * 0.9)
            max_wc = round(essay_word_target * 1.1)
        else:
            min_wc = ESSAY_MIN_WORDS
            max_wc = ESSAY_MAX_WORDS

        # Spec §8.4 word-count gate: reject drafts outside target range
        # unless insufficient_evidence is True (honest archive decline).
        if not insufficient and not (min_wc <= actual_wc <= max_wc):
            raise EssayLengthError(actual_wc, min_words=min_wc, max_words=max_wc)

        raw_path = str(payload.get("writing_path", "actionable") or "actionable").strip().lower()
        matched = [
            p for p in ("actionable", "analytical", "aspirational", "anthropological")
            if p in raw_path
        ]
        if len(matched) == 1:
            effective_path: WritingPath = matched[0]  # type: ignore[assignment]
        elif raw_path in VALID_WRITING_PATHS:
            effective_path = raw_path  # type: ignore[assignment]
        else:
            raise AgentOutputError(
                "INVALID_WRITING_PATH",
                f"writing_path must be one of {sorted(VALID_WRITING_PATHS)}; got {raw_path!r}",
            )

        return ValidatedEssayResponse(
            title=str(payload.get("title", "Digital Essay")).strip(),
            essay_markdown=essay_text,
            approximate_word_count=approx_wc,
            actual_word_count=actual_wc,
            writing_path=effective_path,
            citations=cleaned_citations,
            insufficient_evidence=insufficient,
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
        title = str(payload.get("title", "")).strip()
        if not title:
            raise AgentOutputError("EMPTY_ANSWER", "Artifact title must not be empty")

        content = str(payload.get("content", "")).strip()
        if not content:
            raise AgentOutputError("EMPTY_ANSWER", "Artifact content must not be empty")

        if _EMOJI_RE.search(title) or _EMOJI_RE.search(content):
            raise AgentOutputError(
                "ARTIFACT_STYLE", "emoji characters are banned in deliverables"
            )

        content, invalid = enforce_inline_labels(
            content, valid_evidence_ids, strict=strict_labels
        )
        if strict_labels and invalid:
            raise AgentOutputError("INVALID_LABELS", ",".join(sorted(set(invalid))))

        return ValidatedArtifactResponse(
            mode="artifact_html" if kind == "html" else "artifact_markdown",
            kind=kind,
            title=title,
            content=content,
            source_evidence_ids=cleaned_eids,
        )

    else:  # default "research"
        raw_citations = payload.get("citations", [])
        cleaned_citations = filter_valid_citations(raw_citations, valid_evidence_ids)
        answer = str(payload.get("answer_markdown", "")).strip()
        if not answer:
            raise AgentOutputError("EMPTY_ANSWER", "answer_markdown must not be empty")

        answer, cleaned_citations, invalid = reconcile_inline_labels(
            answer, cleaned_citations, valid_evidence_ids, strict=strict_labels
        )
        if strict_labels and invalid:
            raise AgentOutputError("INVALID_LABELS", ",".join(sorted(set(invalid))))

        follow_up = payload.get("follow_up_question")
        follow_up_str = str(follow_up).strip() if follow_up else None

        scope_val = str(payload.get("scope", "in_scope")).strip().lower()
        scope: Literal["in_scope", "out_of_scope"] = (
            "out_of_scope" if scope_val == "out_of_scope" else "in_scope"
        )
        raw_insufficient = bool(payload.get("insufficient_evidence", False))
        insufficient = True if scope == "out_of_scope" else raw_insufficient

        return ValidatedResearchResponse(
            answer_markdown=answer,
            citations=cleaned_citations,
            scope=scope,
            insufficient_evidence=insufficient,
            follow_up_question=follow_up_str,
        )
