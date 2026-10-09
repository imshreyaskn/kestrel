"""
Agent Client Package (Codename: Kestrel)
Typed gateway client, prompt builders, skill loader, and output validator.
"""

from backend.app.agent_client.gateway_client import (
    AgentGatewayClient,
    GatewayGenerationResult,
    default_gateway_client,
)
from backend.app.agent_client.prompts import (
    build_system_prompt,
    format_evidence_block,
)
from backend.app.agent_client.skill_loader import (
    RuntimeSkill,
    SkillLoader,
    default_skill_loader,
)
from backend.app.agent_client.validator import (
    CitationItem,
    ValidatedArtifactResponse,
    ValidatedEssayResponse,
    ValidatedGrowthBriefResponse,
    ValidatedResearchResponse,
    ValidatedResponse,
    count_words,
    validate_agent_response,
)

__all__ = [
    "AgentGatewayClient",
    "CitationItem",
    "GatewayGenerationResult",
    "RuntimeSkill",
    "SkillLoader",
    "ValidatedArtifactResponse",
    "ValidatedEssayResponse",
    "ValidatedGrowthBriefResponse",
    "ValidatedResearchResponse",
    "ValidatedResponse",
    "build_system_prompt",
    "count_words",
    "default_gateway_client",
    "default_skill_loader",
    "format_evidence_block",
    "validate_agent_response",
]
