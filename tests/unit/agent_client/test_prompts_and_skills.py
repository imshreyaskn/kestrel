"""
Unit tests for prompt templates and runtime skill loader.
(Codename: Kestrel)
"""

from dataclasses import dataclass

from backend.app.agent_client.prompts import (
    build_system_prompt,
    format_evidence_block,
)
from backend.app.agent_client.skill_loader import SkillLoader, default_skill_loader


@dataclass
class DummyEvidence:
    evidence_id: str
    excerpt: str
    guest: str
    episode_title: str


def test_runtime_skill_loader_loads_ship_30_for_30():
    skill = default_skill_loader.load_skill("ship-30-for-30")
    assert skill is not None
    assert skill.name == "ship-30-for-30"
    assert "1,250" in skill.purpose
    assert "Ship 30 for 30 Writing Skill" in skill.instructions


def test_skill_loader_returns_none_for_missing_skill():
    loader = SkillLoader()
    assert loader.load_skill("non-existent-skill") is None


def test_format_evidence_block_empty():
    block = format_evidence_block([])
    assert "NO RELEVANT TRANSCRIPT EVIDENCE FOUND" in block


def test_format_evidence_block_with_items():
    items = [
        DummyEvidence(
            evidence_id="E1",
            excerpt="Activation rate is key to sustainable growth.",
            guest="Elena Verna",
            episode_title="Elena Verna on B2B PLG",
        ),
        DummyEvidence(
            evidence_id="E2",
            excerpt="Measure retention before scaling acquisition.",
            guest="Casey Winters",
            episode_title="Casey Winters on Scaling Growth",
        ),
    ]
    block = format_evidence_block(items)
    assert "[E1]" in block
    assert "Elena Verna" in block
    assert "[E2]" in block
    assert "Casey Winters" in block


def test_build_system_prompt_for_all_modes():
    modes = ["research", "growth_brief", "essay", "artifact_markdown", "artifact_html"]
    for mode in modes:
        prompt = build_system_prompt(
            mode=mode,
            evidence_block="[E1] Excerpt",
            product_context="Early-stage B2B dev tools platform",
        )
        assert "Lenny Growth Assistant" in prompt
        assert "EPISTEMIC RULES" in prompt
        assert "OUTPUT SCHEMA" in prompt
        assert "USER-SUPPLIED PRODUCT CONTEXT" in prompt
        assert "[E1] Excerpt" in prompt

        if mode == "essay":
            assert "Ship 30 for 30" in prompt
        elif mode == "growth_brief":
            assert "Growth Brief" in prompt
            assert "guardrail_metric" in prompt


def test_build_system_prompt_includes_current_date():
    import datetime

    prompt = build_system_prompt(mode="research", evidence_block="evidence")
    today_str = datetime.datetime.now(datetime.UTC).date().isoformat()
    assert f"Today's date is {today_str}" in prompt


def test_build_repair_system_prompt_targeted_guidance():
    from backend.app.agent_client.prompts import build_repair_system_prompt

    # 1. Essay length failure
    p_essay = build_repair_system_prompt(
        mode="essay",
        evidence_block="evidence",
        reason_code="ESSAY_LENGTH",
        detail="essay was 980 words; contract requires 1150-1350",
    )
    assert "Reason: ESSAY_LENGTH." in p_essay
    assert "Your essay was the wrong length (essay was 980 words" in p_essay
    assert "not a single valid JSON object" not in p_essay

    # 2. Invalid labels failure
    p_labels = build_repair_system_prompt(
        mode="research",
        evidence_block="evidence",
        reason_code="INVALID_LABELS",
        detail="E99,E100",
    )
    assert "Reason: INVALID_LABELS." in p_labels
    assert "These inline labels do not exist in this run's evidence: E99,E100" in p_labels

    # 3. Truncated output failure
    p_trunc = build_repair_system_prompt(
        mode="research",
        evidence_block="evidence",
        reason_code="TRUNCATED",
        detail="output token ceiling reached",
    )
    assert "Reason: TRUNCATED." in p_trunc
    assert "Produce a complete but more concise JSON object" in p_trunc

    # 4. JSON parse error
    p_json = build_repair_system_prompt(
        mode="research",
        evidence_block="evidence",
        reason_code="JSON_PARSE",
        detail="unterminated string",
    )
    assert "Reason: JSON_PARSE." in p_json
    assert "Return ONLY one corrected JSON object" in p_json

