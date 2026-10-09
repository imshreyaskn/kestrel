"""
Unit tests for EmbeddingProvider implementations.
Tests deterministic fake vectors and Ollama client error handling/batching.
"""

import math
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from backend.app.retrieval.embedder import (
    DeterministicFakeEmbeddingProvider,
    EmbeddingError,
    OllamaEmbeddingProvider,
)


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2, strict=True))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    return dot / (norm1 * norm2)


@pytest.mark.asyncio
async def test_fake_embedding_provider_properties():
    provider = DeterministicFakeEmbeddingProvider(dimension=768)
    assert provider.dimension == 768
    assert await provider.verify_availability() is True

    texts = [
        "Product-led growth strategies for SaaS",
        "Product-led growth and freemium conversion",
        "Cooking italian pasta with fresh basil",
    ]
    vectors = await provider.embed_texts(texts)

    assert len(vectors) == 3
    for vec in vectors:
        assert len(vec) == 768
        # Check L2 norm is ~1.0
        norm = math.sqrt(sum(v * v for v in vec))
        assert pytest.approx(norm, rel=1e-3) == 1.0

    # Semantic similarity check: text 0 and 1 share tokens, text 2 is unrelated
    sim_0_1 = cosine_similarity(vectors[0], vectors[1])
    sim_0_2 = cosine_similarity(vectors[0], vectors[2])
    assert sim_0_1 > sim_0_2


@pytest.mark.asyncio
async def test_ollama_embedding_provider_batch_success():
    provider = OllamaEmbeddingProvider(
        base_url="http://mock-ollama:11434",
        model="embeddinggemma",
        dimension=768,
        batch_size=2,
    )

    mock_vectors = [[0.1] * 768, [0.2] * 768]

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {"embeddings": mock_vectors}
        mock_post.return_value = mock_response

        res = await provider.embed_texts(["hello", "world"])
        assert len(res) == 2
        assert len(res[0]) == 768
        assert mock_post.call_count == 1


@pytest.mark.asyncio
async def test_ollama_embedding_provider_dimension_mismatch_raises():
    provider = OllamaEmbeddingProvider(
        base_url="http://mock-ollama:11434",
        dimension=768,
        max_retries=0,
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        # Return 512 dimensions instead of 768
        mock_response.json.return_value = {"embeddings": [[0.1] * 512]}
        mock_post.return_value = mock_response

        with pytest.raises(EmbeddingError, match="Dimension mismatch"):
            await provider.embed_texts(["test text"])
