"""
Unit tests for agent output validator and evidence citation filtering.
(Codename: Kestrel)
"""

import json

from backend.app.agent_client.validator import (
    ValidatedArtifactResponse,
    ValidatedEssayResponse,
    ValidatedGrowthBriefResponse,
    ValidatedResearchResponse,
    count_words,
    filter_valid_citations,
    validate_agent_response,
)


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
    result = validate_agent_response(raw_llm, mode="research", valid_evidence_ids=valid_ids)

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
    result = validate_agent_response(raw_llm, mode="research", valid_evidence_ids={"E1"})
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
    result = validate_agent_response(raw_llm, mode="growth_brief", valid_evidence_ids={"E1"})
    assert isinstance(result, ValidatedGrowthBriefResponse)
    assert result.title == "Self-Serve Activation Engine"
    assert result.problem == "Signup dropoff at onboarding step 2"
    assert result.experiment.success_metric == "D1 template completion rate"
    assert result.experiment.decision_rule.startswith("Ship if")
    assert len(result.assumptions) == 1
    assert len(result.risks) == 1
    assert len(result.citations) == 1


def test_validate_essay_response_and_word_count():
    sample_essay = (
        "# The Activation Advantage\n\n"
        + "Building a sticky SaaS product requires understanding early user momentum [E1]. " * 20
    )
    raw_llm = f"""
    {{
      "title": "The Activation Advantage",
      "essay_markdown": {json.dumps(sample_essay)},
      "approximate_word_count": 220,
      "writing_path": "actionable",
      "citations": [{{"evidence_id": "E1", "supports": "Early user momentum"}}],
      "insufficient_evidence": false
    }}
    """
    result = validate_agent_response(raw_llm, mode="essay", valid_evidence_ids={"E1"})
    assert isinstance(result, ValidatedEssayResponse)
    assert result.title == "The Activation Advantage"
    assert result.actual_word_count > 100
    assert result.writing_path == "actionable"
    assert len(result.citations) == 1


def test_validate_artifact_response():
    raw_llm = """
    {
      "kind": "markdown",
      "title": "Growth Checklist",
      "content": "# Checklist\\n- [ ] Step 1\\n- [ ] Step 2",
      "source_evidence_ids": ["E1", "E99"]
    }
    """
    result = validate_agent_response(raw_llm, mode="artifact_markdown", valid_evidence_ids={"E1"})
    assert isinstance(result, ValidatedArtifactResponse)
    assert result.kind == "markdown"
    assert result.title == "Growth Checklist"
    assert result.source_evidence_ids == ["E1"]  # E99 filtered out


def test_count_words():
    assert count_words("Hello world! This is a test.") == 6
    assert count_words("") == 0
