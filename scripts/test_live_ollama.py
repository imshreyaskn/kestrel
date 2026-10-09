"""
Live Local Ollama Smoke Test - Phase 0 Verification
Empirically tests:
1. Live host Ollama service connectivity on http://127.0.0.1:11434
2. embeddinggemma embedding generation and strict 768-dimension assertion
3. qwen2.5:1.5b chat completion and structured output extraction
"""

import asyncio
import json
import sys
import time
from pathlib import Path
from typing import List, Optional

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from pydantic import BaseModel, Field

from backend.app.core.json_extractor import extract_and_validate


class CitationRef(BaseModel):
    evidence_id: str
    supports: Optional[str] = None


class ResearchResponse(BaseModel):
    answer_markdown: str
    citations: List[CitationRef] = Field(default_factory=list)
    insufficient_evidence: bool = False
    follow_up_question: Optional[str] = None


async def run_live_verification():
    base_url = "http://127.0.0.1:11434"
    print(f"=== Running Live Ollama Smoke Test ({base_url}) ===")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Version check
        ver_res = await client.get(f"{base_url}/api/version")
        assert ver_res.status_code == 200, f"Version check failed: {ver_res.status_code}"
        version_data = ver_res.json()
        print(f"Ollama Version: {version_data.get('version')}")

        # 2. Embedding check with embeddinggemma
        print("\nTesting embeddinggemma vector generation...")
        embed_start = time.perf_counter()
        embed_res = await client.post(
            f"{base_url}/api/embed",
            json={"model": "embeddinggemma", "input": "Elena Verna on product-led growth and activation."},
        )
        embed_duration = (time.perf_counter() - embed_start) * 1000
        assert embed_res.status_code == 200, f"Embed call failed: {embed_res.status_code} - {embed_res.text}"
        embeddings = embed_res.json().get("embeddings", [])
        assert len(embeddings) > 0, "No embeddings returned"
        dim = len(embeddings[0])
        print(f"Embedding Dimensions: {dim} (Duration: {embed_duration:.1f}ms)")
        assert dim == 768, f"Dimension mismatch! Expected 768 for pgvector, got {dim}"
        print("Embedding dimension test PASSED (strictly 768).")

        # 3. Chat completion with qwen2.5:1.5b
        print("\nTesting qwen2.5:1.5b structured chat completion...")
        chat_prompt = (
            "You are a research assistant. Based on this mock passage [E1]: "
            "'Elena Verna explains that activation rate is the leading indicator for long-term retention.' "
            "Answer the user query in JSON format matching this schema: "
            "{\"answer_markdown\": string, \"citations\": [{\"evidence_id\": \"E1\", \"supports\": string}], \"insufficient_evidence\": boolean}. "
            "Query: What is the relationship between activation and retention?"
        )

        chat_start = time.perf_counter()
        chat_res = await client.post(
            f"{base_url}/api/chat",
            json={
                "model": "qwen2.5:1.5b",
                "messages": [{"role": "user", "content": chat_prompt}],
                "stream": False,
                "options": {"temperature": 0.1},
            },
        )
        chat_duration = (time.perf_counter() - chat_start) * 1000
        assert chat_res.status_code == 200, f"Chat call failed: {chat_res.status_code} - {chat_res.text}"
        chat_data = chat_res.json()
        raw_content = chat_data["message"]["content"]
        print(f"Raw Model Output (latency: {chat_duration:.1f}ms):\n{raw_content}\n")

        # 4. Extract and validate using our robust extractor
        parsed = extract_and_validate(raw_content, ResearchResponse)
        print("Parsed Structured Output:")
        print(json.dumps(parsed.model_dump(), indent=2))
        assert len(parsed.citations) > 0, "Expected at least one citation"
        assert parsed.citations[0].evidence_id == "E1", f"Expected citation E1, got {parsed.citations[0].evidence_id}"
        print("\nALL LIVE TESTS PASSED WITH REAL EVIDENCE!")


if __name__ == "__main__":
    asyncio.run(run_live_verification())
