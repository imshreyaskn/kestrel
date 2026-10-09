"""
Phase 0 Verification: Live Node 22 Agent Gateway + Host Ollama E2E Test
Tests:
1. Health endpoint on agent-gateway (Node version, uptime, service status)
2. POST /api/v1/generate with live Ollama qwen2.5:1.5b
3. Backend JSON extraction and Pydantic validation of generated response
"""

import pathlib
import sys
import time
from typing import List, Optional

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import httpx
from pydantic import BaseModel, Field

from backend.app.core.json_extractor import extract_and_validate


class CitationRef(BaseModel):
    evidence_id: str
    supports: Optional[str] = None


class GrowthResponse(BaseModel):
    answer_markdown: str
    citations: List[CitationRef] = Field(default_factory=list)
    insufficient_evidence: bool = False


def test_gateway():
    gateway_url = "http://localhost:8010"
    print(f"=== Testing Live Agent Gateway at {gateway_url} ===")

    # 1. Health check
    try:
        health_res = httpx.get(f"{gateway_url}/health", timeout=5.0)
        health_res.raise_for_status()
        health_data = health_res.json()
        print(f"[Health Check] OK: {health_data}")
        assert health_data.get("status") == "ok"
        assert health_data.get("node_version", "").startswith("v22")
    except Exception as e:
        print(f"[Health Check] FAILED: {e}")
        sys.exit(1)

    # 2. Generate with Host Ollama
    print("\n[Generate Test] Sending grounded generation request to Agent Gateway...")
    payload = {
        "request_id": "phase0-evidence-001",
        "session_id": "00000000-0000-0000-0000-000000000001",
        "mode": "research",
        "provider": "local",
        "model_id": "qwen2.5:1.5b",
        "current_user_message": "What is Elena Verna's rule on product activation?",
        "evidence": [
            {
                "evidence_id": "E1",
                "episode_title": "Elena Verna on B2B Growth",
                "guest": "Elena Verna",
                "excerpt": "Activation is the single biggest predictor of long term retention and growth. If users never experience value, retention is dead.",
            }
        ],
    }

    start = time.perf_counter()
    gen_res = httpx.post(f"{gateway_url}/api/v1/generate", json=payload, timeout=60.0)
    gen_res.raise_for_status()
    gen_data = gen_res.json()
    duration = time.perf_counter() - start

    print(f"[Generate Test] Status {gen_res.status_code} in {duration:.2f}s (Gateway reported latency: {gen_data.get('latency_ms')}ms)")
    raw_response = gen_data.get("raw_response", "")
    print(f"[Raw Model Response]\n{raw_response}\n")

    # 3. Backend Pydantic validation via json_extractor
    print("[Backend Validation] Parsing and validating raw response...")
    parsed = extract_and_validate(raw_response, GrowthResponse)
    print(f"[Validation Success] Answer length: {len(parsed.answer_markdown)} chars")
    print(f"[Validation Success] Citations found: {len(parsed.citations)}")
    for cit in parsed.citations:
        print(f"  - Citation [{cit.evidence_id}]: {cit.supports}")
    assert len(parsed.citations) > 0
    assert parsed.citations[0].evidence_id == "E1"
    assert not parsed.insufficient_evidence

    print("\n=== All Gateway Phase 0 Verification Checks Passed! ===")


if __name__ == "__main__":
    test_gateway()
