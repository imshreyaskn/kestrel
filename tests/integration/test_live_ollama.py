"""
Integration test verifying live Host Ollama connectivity, embedding dimensions,
and chat completion behavior with qwen2.5:1.5b and embeddinggemma.
"""

import httpx
import pytest

from backend.app.core.json_extractor import extract_and_validate
from tests.unit.test_json_extractor import SampleResearchResponse

OLLAMA_HOST = "http://127.0.0.1:11434"


def is_ollama_available() -> bool:
    try:
        r = httpx.get(f"{OLLAMA_HOST}/api/version", timeout=2.0)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


@pytest.mark.integration
def test_ollama_reachable_and_version():
    if not is_ollama_available():
        pytest.skip(f"Host Ollama not reachable on {OLLAMA_HOST}")

    r = httpx.get(f"{OLLAMA_HOST}/api/version", timeout=5.0)
    assert r.status_code == 200
    version_data = r.json()
    assert "version" in version_data


@pytest.mark.integration
def test_embeddinggemma_strictly_768_dimensions():
    if not is_ollama_available():
        pytest.skip(f"Host Ollama not reachable on {OLLAMA_HOST}")

    payload = {
        "model": "embeddinggemma",
        "input": "How to scale B2B SaaS retention and activation loops",
    }
    r = httpx.post(f"{OLLAMA_HOST}/api/embed", json=payload, timeout=30.0)
    assert r.status_code == 200, f"Embedding failed: {r.text}"
    data = r.json()
    embeddings = data.get("embeddings", [])
    assert len(embeddings) > 0, "No embeddings returned"
    vector = embeddings[0]
    assert len(vector) == 768, f"Expected 768 dimensions for vector(768) schema, got {len(vector)}"


@pytest.mark.integration
def test_qwen_chat_completion_generates_grounded_citations():
    if not is_ollama_available():
        pytest.skip(f"Host Ollama not reachable on {OLLAMA_HOST}")

    system_prompt = """You are an evidence-grounded AI research assistant.
You must cite evidence with tags like [E1].
You must respond ONLY with a JSON object:
{
  "answer_markdown": "Grounded answer text [E1]...",
  "citations": [{"evidence_id": "E1", "supports": "Key point supported"}],
  "insufficient_evidence": false
}"""
    user_prompt = """EVIDENCE:
[E1] Activation is the single biggest predictor of retention.

QUESTION: What is Elena Verna's rule on activation? Include [E1] in your answer and citations array."""

    payload = {
        "model": "qwen2.5:1.5b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2},
    }

    r = httpx.post(f"{OLLAMA_HOST}/api/chat", json=payload, timeout=60.0)
    assert r.status_code == 200, f"Chat completion failed: {r.text}"
    data = r.json()
    raw_content = data.get("message", {}).get("content", "")
    assert raw_content, "Empty message content"

    parsed = extract_and_validate(raw_content, SampleResearchResponse)
    assert parsed.answer_markdown
    assert len(parsed.citations) > 0
    assert parsed.citations[0].evidence_id == "E1"
