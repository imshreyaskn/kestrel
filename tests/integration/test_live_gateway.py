"""
Integration test verifying live agent gateway HTTP endpoints (GET /health and POST /api/v1/generate).
Powered by @earendil-works/pi-ai.
"""

import httpx
import pytest

from backend.app.core.json_extractor import extract_and_validate
from tests.unit.test_json_extractor import SampleResearchResponse

GATEWAY_URL = "http://localhost:8010"


def is_gateway_running() -> bool:
    try:
        r = httpx.get(f"{GATEWAY_URL}/health", timeout=2.0)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


@pytest.mark.integration
def test_gateway_health_reports_pi_ai_and_providers():
    if not is_gateway_running():
        pytest.skip(f"Agent Gateway is not running on {GATEWAY_URL}")

    r = httpx.get(f"{GATEWAY_URL}/health", timeout=5.0)
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert data.get("agent_framework") == "@earendil-works/pi-ai"
    assert "ollama" in data.get("providers", [])
    assert "google" in data.get("providers", [])


@pytest.mark.integration
def test_gateway_generate_executes_pi_ai_completion():
    if not is_gateway_running():
        pytest.skip(f"Agent Gateway is not running on {GATEWAY_URL}")

    payload = {
        "request_id": "integration-req-001",
        "session_id": "00000000-0000-0000-0000-000000000001",
        "mode": "research",
        "provider": "local",
        "model_id": "qwen2.5:1.5b",
        "current_user_message": "What is Elena Verna's rule on product activation? Include citation [E1] in your answer and citations array.",
        "evidence": [
            {
                "evidence_id": "E1",
                "episode_title": "Elena Verna on B2B Growth",
                "guest": "Elena Verna",
                "excerpt": "Activation is the single biggest predictor of long term retention and growth. If users never experience value, retention is dead.",
            }
        ],
    }

    headers = {"x-internal-service-token": "replace-with-a-long-random-local-token"}
    r = httpx.post(f"{GATEWAY_URL}/api/v1/generate", json=payload, headers=headers, timeout=60.0)
    assert r.status_code == 200, f"Generate failed: {r.text}"
    data = r.json()
    assert data.get("provider") == "local"
    assert data.get("model_id") == "qwen2.5:1.5b"
    raw_response = data.get("raw_response", "")
    assert raw_response, "Empty raw response from gateway"

    parsed = extract_and_validate(raw_response, SampleResearchResponse)
    assert parsed.answer_markdown
    assert len(parsed.citations) > 0
    assert parsed.citations[0].evidence_id == "E1"
