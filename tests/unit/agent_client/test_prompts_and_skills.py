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
        assert "STRICT GROUNDING" in prompt
        assert "OUTPUT SCHEMA" in prompt
        assert "USER-SUPPLIED PRODUCT CONTEXT" in prompt
        assert "[E1] Excerpt" in prompt

        if mode == "essay":
            assert "Ship 30 for 30" in prompt
        elif mode == "growth_brief":
            assert "Growth Brief" in prompt
            assert "guardrail_metric" in prompt
