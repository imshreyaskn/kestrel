"""
Unit tests for agent output validator and evidence citation filtering.
(Codename: Kestrel)
"""

import json

import pytest

from backend.app.agent_client.validator import (
    ESSAY_MAX_WORDS,
    ESSAY_MIN_WORDS,
    EssayLengthError,
    ValidatedArtifactResponse,
    ValidatedEssayResponse,
    ValidatedGrowthBriefResponse,
    ValidatedResearchResponse,
    count_words,
    filter_valid_citations,
    validate_agent_response,
)
from backend.app.core.json_extractor import StructuredExtractionError


def test_filter_valid_citations_prunes_hallucinated_ids():
    citations_data = [
        {"evidence_id": "E1", "supports": "Activation loop retention"},
        {"evidence_id": "E99", "supports": "Hallucinated episode point"},
        {"evidence_id": "E2", "supports": "Onboarding friction"},
        {"evidence_id": "E1", "supports": "Duplicate E1"},
    ]
    valid_ids = {"E1", "E2"}
    filtered = filter_valid_citations(citations_data, valid_ids)

    assert len(filtered) == 2
    assert [c.evidence_id for c in filtered] == ["E1", "E2"]
    assert filtered[0].supports == "Activation loop retention"


def test_validate_research_response_with_fenced_json():
    raw_llm = """
    Here is the analysis:
    ```json
    {
      "answer_markdown": "Early SaaS activation relies on the aha moment [E1]. Friction should be reduced [E2].",
      "citations": [
        {"evidence_id": "E1", "supports": "Aha moment"},
        {"evidence_id": "E42", "supports": "Fabricated citation"}
      ],
      "insufficient_evidence": false,
      "follow_up_question": "What is the primary activation metric?"
    }
    ```
    """
    valid_ids = {"E1", "E2"}
    result = validate_agent_response(
        raw_llm, mode="research", valid_evidence_ids=valid_ids
    )

    assert isinstance(result, ValidatedResearchResponse)
    assert "[E1]" in result.answer_markdown
    assert len(result.citations) == 1
    assert result.citations[0].evidence_id == "E1"
    assert not result.insufficient_evidence
    assert result.follow_up_question == "What is the primary activation metric?"


def test_validate_research_insufficient_evidence():
    raw_llm = """
    {
      "answer_markdown": "The transcripts do not contain specific details on quantum computing.",
      "citations": [],
      "insufficient_evidence": true,
      "follow_up_question": null
    }
    """
    result = validate_agent_response(
        raw_llm, mode="research", valid_evidence_ids={"E1"}
    )
    assert isinstance(result, ValidatedResearchResponse)
    assert result.insufficient_evidence
    assert len(result.citations) == 0


def test_validate_growth_brief_response():
    raw_llm = """
    {
      "title": "Self-Serve Activation Engine",
      "problem": "Signup dropoff at onboarding step 2",
      "research_summary": "Guests emphasize interactive walkthroughs [E1].",
      "recommendation": "Replace product tour with interactive template setup.",
      "assumptions": ["Users have existing spreadsheet data"],
      "experiment": {
        "hypothesis": "Interactive template increases D1 activation by 15%",
        "change": "Show 3 pre-built templates during signup",
        "segment": "Self-serve new signups",
        "success_metric": "D1 template completion rate",
        "guardrail_metric": "Signup conversion rate",
        "decision_rule": "Ship if completion rate >= 20% without hurting signup rate"
      },
      "risks": ["Enterprise users may prefer blank canvas"],
      "next_deliverable": "Figma prototype for user testing",
      "citations": [{"evidence_id": "E1", "supports": "Template onboarding"}],
      "insufficient_evidence": false
    }
    """
    result = validate_agent_response(
        raw_llm, mode="growth_brief", valid_evidence_ids={"E1"}
    )
    assert isinstance(result, ValidatedGrowthBriefResponse)
    assert result.title == "Self-Serve Activation Engine"
    assert result.problem == "Signup dropoff at onboarding step 2"
    assert result.experiment.success_metric == "D1 template completion rate"
    assert result.experiment.decision_rule.startswith("Ship if")
    assert len(result.assumptions) == 1
    assert len(result.risks) == 1
    assert len(result.citations) == 1


def test_validate_essay_response_within_word_range():
    # Spec §8.4: accepted first-draft range is 1,150–1,350 words.
    # 10-word sentence repeated 120 times = 1,200 words.
    sentence = "Building a sticky SaaS product requires understanding early user momentum [E1]. "
    sample_essay = "# The Activation Advantage\n\n" + sentence * 120
    raw_llm = f"""
    {{
      "title": "The Activation Advantage",
      "essay_markdown": {json.dumps(sample_essay)},
      "approximate_word_count": 1200,
      "writing_path": "actionable",
      "citations": [{{"evidence_id": "E1", "supports": "Early user momentum"}}],
      "insufficient_evidence": false
    }}
    """
    result = validate_agent_response(raw_llm, mode="essay", valid_evidence_ids={"E1"})
    assert isinstance(result, ValidatedEssayResponse)
    assert result.title == "The Activation Advantage"
    assert 1150 <= result.actual_word_count <= 1350
    assert result.writing_path == "actionable"
    assert len(result.citations) == 1


def test_validate_essay_rejects_out_of_range_word_count():
    # A 200-word draft violates the Ship 30 for 30 contract (1,150–1,350
    # words) and must be rejected, not persisted (spec §8.4).
    sample_essay = "Short essay. " * 20
    raw_llm = f"""
    {{
      "title": "Too Short",
      "essay_markdown": {json.dumps(sample_essay)},
      "approximate_word_count": 200,
      "writing_path": "actionable",
      "citations": [],
      "insufficient_evidence": false
    }}
    """
    with pytest.raises(EssayLengthError) as excinfo:
        validate_agent_response(raw_llm, mode="essay", valid_evidence_ids={"E1"})
    assert excinfo.value.actual_words < 1150


def test_validate_artifact_response():
    raw_llm = """
    {
      "kind": "markdown",
      "title": "Growth Checklist",
      "content": "# Checklist\\n- [ ] Step 1\\n- [ ] Step 2",
      "source_evidence_ids": ["E1", "E99"]
    }
    """
    result = validate_agent_response(
        raw_llm, mode="artifact_markdown", valid_evidence_ids={"E1"}
    )
    assert isinstance(result, ValidatedArtifactResponse)
    assert result.kind == "markdown"
    assert result.title == "Growth Checklist"
    assert result.source_evidence_ids == ["E1"]  # E99 filtered out


def test_count_words():
    assert count_words("Hello world! This is a test.") == 6
    assert count_words("") == 0


def test_essay_word_bounds_match_spec():
    # Guard: the enforced bounds must equal the spec §8.4 contract.
    assert (ESSAY_MIN_WORDS, ESSAY_MAX_WORDS) == (1150, 1350)


def test_validate_essay_custom_word_target_accepted():
    target = 500
    # Range is 450 to 550 words
    essay_text = "Word " * 500
    raw_llm = json.dumps({
        "title": "Custom Length Essay",
        "essay_markdown": essay_text,
        "approximate_word_count": 500,
        "writing_path": "actionable",
        "citations": [{"evidence_id": "E1", "supports": "Key point"}],
        "insufficient_evidence": False,
    })
    res = validate_agent_response(
        raw_llm,
        mode="essay",
        valid_evidence_ids={"E1"},
        essay_word_target=target,
    )
    assert isinstance(res, ValidatedEssayResponse)
    assert res.actual_word_count == 500
    assert res.title == "Custom Length Essay"


def test_validate_essay_custom_word_target_rejected():
    target = 500
    # Range is 450 to 550 words; 400 words must be rejected
    essay_text = "Word " * 400
    raw_llm = json.dumps({
        "title": "Too Short Essay",
        "essay_markdown": essay_text,
        "approximate_word_count": 400,
        "writing_path": "actionable",
        "citations": [],
        "insufficient_evidence": False,
    })
    with pytest.raises(EssayLengthError) as exc_info:
        validate_agent_response(
            raw_llm,
            mode="essay",
            valid_evidence_ids=set(),
            essay_word_target=target,
        )
    assert exc_info.value.min_words == 450
    assert exc_info.value.max_words == 550
    assert exc_info.value.actual_words == 400


def test_validate_essay_insufficient_evidence_bypasses_word_count():
    decline_text = "The archive lacks sufficient depth on early-stage nuclear fusion marketing."
    raw_llm = json.dumps({
        "title": "Topic Not in Archive",
        "essay_markdown": decline_text,
        "approximate_word_count": 10,
        "writing_path": "actionable",
        "citations": [],
        "insufficient_evidence": True,
    })
    res = validate_agent_response(
        raw_llm,
        mode="essay",
        valid_evidence_ids=set(),
    )
    assert isinstance(res, ValidatedEssayResponse)
    assert res.insufficient_evidence is True
    assert res.essay_markdown == decline_text


def test_validate_essay_rejects_empty_markdown_even_when_insufficient():
    raw_llm = json.dumps({
        "title": "Declined",
        "essay_markdown": "   ",
        "approximate_word_count": 0,
        "writing_path": "actionable",
        "citations": [],
        "insufficient_evidence": True,
    })
    with pytest.raises(StructuredExtractionError) as exc_info:
        validate_agent_response(raw_llm, mode="essay", valid_evidence_ids=set())
    assert "essay_markdown must not be empty" in str(exc_info.value)


def test_validate_essay_strips_single_and_multi_citations_from_word_count():
    # 500 actual words + multi-citation tags
    prose = ("strategy " * 500) + " [E1, E2] [E1,E3] [E1]"
    raw_llm = json.dumps({
        "title": "Citation Stripping Essay",
        "essay_markdown": prose,
        "approximate_word_count": 500,
        "writing_path": "actionable",
        "citations": [{"evidence_id": "E1", "supports": "Point"}],
        "insufficient_evidence": False,
    })
    res = validate_agent_response(
        raw_llm,
        mode="essay",
        valid_evidence_ids={"E1", "E2", "E3"},
        essay_word_target=500,
    )
    assert isinstance(res, ValidatedEssayResponse)
    assert res.actual_word_count == 500


def test_validate_research_rejects_empty_answer():
    raw_llm = json.dumps({
        "answer_markdown": "   ",
        "citations": [],
        "insufficient_evidence": False,
    })
    with pytest.raises(StructuredExtractionError) as exc_info:
        validate_agent_response(raw_llm, mode="research", valid_evidence_ids=set())
    assert "answer_markdown must not be empty" in str(exc_info.value)


def test_validate_growth_brief_rejects_empty_recommendation_when_sufficient():
    raw_llm = json.dumps({
        "title": "Growth Brief",
        "problem": "Churn",
        "research_summary": "Summary",
        "recommendation": "   ",
        "insufficient_evidence": False,
    })
    with pytest.raises(StructuredExtractionError) as exc_info:
        validate_agent_response(raw_llm, mode="growth_brief", valid_evidence_ids=set())
    assert "recommendation must not be empty" in str(exc_info.value)


def test_validate_artifact_rejects_empty_content():
    raw_llm = json.dumps({
        "title": "Empty Plate",
        "content": "   ",
        "kind": "markdown",
    })
    with pytest.raises(StructuredExtractionError) as exc_info:
        validate_agent_response(raw_llm, mode="artifact_markdown", valid_evidence_ids=set())
    assert "Artifact content must not be empty" in str(exc_info.value)


def test_validate_detects_stop_reason_truncation():
    from backend.app.agent_client.validator import AgentOutputError

    raw_llm = '{"answer_markdown": "Incomplete text'
    with pytest.raises(AgentOutputError) as exc_info:
        validate_agent_response(
            raw_llm,
            mode="research",
            valid_evidence_ids=set(),
            stop_reason="length",
        )
    assert exc_info.value.reason_code == "TRUNCATED"
    assert "output token ceiling" in exc_info.value.detail


def test_enforce_inline_labels_strict_and_lenient():
    from backend.app.agent_client.validator import (
        AgentOutputError,
        enforce_inline_labels,
    )

    valid_ids = {"E1", "E2"}

    # Direct function test: strict
    cleaned_strict, invalid_strict = enforce_inline_labels(
        "Grounded claim [E1] and hallucinated claim [E99] and multi [E2, E88]",
        valid_ids=valid_ids,
        strict=True,
    )
    assert set(invalid_strict) == {"E99", "E88"}
    assert "[E99]" in cleaned_strict

    # Direct function test: non-strict
    cleaned_lenient, invalid_lenient = enforce_inline_labels(
        "Grounded claim [E1] and hallucinated claim [E99] and multi [E2, E88]",
        valid_ids=valid_ids,
        strict=False,
    )
    assert set(invalid_lenient) == {"E99", "E88"}
    assert "[E99]" not in cleaned_lenient
    assert "[E88]" not in cleaned_lenient
    assert "[E1]" in cleaned_lenient
    assert "[E2]" in cleaned_lenient

    # validate_agent_response strict mode raises INVALID_LABELS
    raw_llm = json.dumps({
        "answer_markdown": "Lenny said [E99] is great.",
        "citations": [],
        "insufficient_evidence": False,
    })
    with pytest.raises(AgentOutputError) as exc_info:
        validate_agent_response(
            raw_llm,
            mode="research",
            valid_evidence_ids={"E1"},
            strict_labels=True,
        )
    assert exc_info.value.reason_code == "INVALID_LABELS"
    assert "E99" in exc_info.value.detail

    # validate_agent_response lenient mode strips [E99]
    res = validate_agent_response(
        raw_llm,
        mode="research",
        valid_evidence_ids={"E1"},
        strict_labels=False,
    )
    assert "[E99]" not in res.answer_markdown

