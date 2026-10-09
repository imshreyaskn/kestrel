"""
Embeddings Provider Interface and Implementations.
Supports Ollama batch embedding (embeddinggemma, 768-dim) and
deterministic fake embeddings for unit testing.
"""

from __future__ import annotations

import abc
import asyncio
import hashlib
import logging
import math
import re

import httpx

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingError(Exception):
    """Raised when an embedding operation fails."""


class EmbeddingProvider(abc.ABC):
    """Abstract interface for text embedding models."""

    @property
    @abc.abstractmethod
    def dimension(self) -> int:
        """Vector dimensions produced by this provider."""
        raise NotImplementedError

    @abc.abstractmethod
    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts into dense vectors."""
        raise NotImplementedError

    @abc.abstractmethod
    async def embed_query(self, query: str) -> list[float]:
        """Embed a single search query."""
        raise NotImplementedError

    @abc.abstractmethod
    async def verify_availability(self) -> bool:
        """Verify the model is loaded and produces expected dimensions."""
        raise NotImplementedError


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Ollama batch embedding client using the native /api/embed endpoint."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        dimension: int | None = None,
        batch_size: int = 16,
        timeout: float = 60.0,
        max_retries: int = 2,
    ) -> None:
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.model = model or settings.OLLAMA_EMBEDDING_MODEL
        self._dimension = dimension or settings.EMBEDDING_DIMENSIONS
        self.batch_size = batch_size
        self.timeout = timeout
        self.max_retries = max_retries

    @property
    def dimension(self) -> int:
        return self._dimension

    async def verify_availability(self) -> bool:
        """Verify the Ollama embedding model is available and outputs expected dimension."""
        try:
            vectors = await self.embed_texts(["ping"])
            if not vectors or len(vectors[0]) != self.dimension:
                logger.error(
                    "Ollama embedding model %s returned unexpected vector dimension: %s (expected %s)",
                    self.model,
                    len(vectors[0]) if vectors else 0,
                    self.dimension,
                )
                return False
            return True
        except (httpx.HTTPError, EmbeddingError, OSError) as e:
            logger.warning("Ollama embedding verification failed: %s", str(e))
            return False

    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query text."""
        res = await self.embed_texts([query])
        if not res:
            raise EmbeddingError("Failed to embed search query: empty response")
        return res[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts in batches with retries."""
        if not texts:
            return []

        all_embeddings: list[list[float]] = []

        # Process in bounded batches
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            batch_embeddings = await self._embed_batch_with_retry(batch)
            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    async def _embed_batch_with_retry(self, batch: list[str]) -> list[list[float]]:
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    # 1. Try Ollama /api/embed (batch API)
                    payload = {"model": self.model, "input": batch}
                    resp = await client.post(f"{self.base_url}/api/embed", json=payload)

                    if resp.status_code == 200:
                        data = resp.json()
                        embeddings: list[list[float]] = data.get("embeddings", [])
                        if len(embeddings) != len(batch):
                            raise EmbeddingError(
                                f"Expected {len(batch)} embeddings, received {len(embeddings)}"
                            )
                        for vec in embeddings:
                            if len(vec) != self.dimension:
                                raise EmbeddingError(
                                    f"Dimension mismatch: expected {self.dimension}, got {len(vec)}"
                                )
                        return embeddings

                    # 2. If 404 (legacy Ollama), fallback to single /api/embeddings endpoint
                    if resp.status_code == 404:
                        return await self._embed_legacy_single(client, batch)

                    resp.raise_for_status()

            except (httpx.HTTPError, EmbeddingError, KeyError, ValueError) as e:
                last_error = e
                if attempt < self.max_retries:
                    backoff = 0.5 * (2**attempt)
                    logger.warning(
                        "Embedding batch attempt %d failed: %s. Retrying in %.1fs",
                        attempt + 1,
                        e,
                        backoff,
                    )
                    await asyncio.sleep(backoff)
                else:
                    logger.error(
                        "Embedding batch failed after %d attempts: %s",
                        self.max_retries + 1,
                        e,
                    )

        raise EmbeddingError(
            f"Embedding failed after {self.max_retries + 1} attempts: {last_error}"
        )

    async def _embed_legacy_single(
        self, client: httpx.AsyncClient, batch: list[str]
    ) -> list[list[float]]:
        """Fallback for older Ollama versions that only support /api/embeddings."""
        results: list[list[float]] = []
        for text in batch:
            resp = await client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": text},
            )
            resp.raise_for_status()
            vec: list[float] = resp.json().get("embedding", [])
            if len(vec) != self.dimension:
                raise EmbeddingError(
                    f"Dimension mismatch: expected {self.dimension}, got {len(vec)}"
                )
            results.append(vec)
        return results


class DeterministicFakeEmbeddingProvider(EmbeddingProvider):
    """
    Deterministic pseudo-semantic embedding generator for unit tests and CI.
    Generates normalized 768-dimensional float vectors from text tokens.
    Texts sharing tokens produce positive cosine similarity.
    """

    def __init__(self, dimension: int = 768) -> None:
        self._dimension = dimension

    @property
    def dimension(self) -> int:
        return self._dimension

    async def verify_availability(self) -> bool:
        return True

    async def embed_query(self, query: str) -> list[float]:
        res = await self.embed_texts([query])
        return res[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._generate_vector(t) for t in texts]

    def _generate_vector(self, text: str) -> list[float]:
        vec = [0.0] * self.dimension
        tokens = re.findall(r"\w+", text.lower())

        if not tokens:
            # Deterministic non-zero vector for empty input
            return [1.0 / math.sqrt(self.dimension)] * self.dimension

        for token in tokens:
            # Hash token to bucket index and signed magnitude
            h = hashlib.sha256(token.encode("utf-8")).digest()
            idx = int.from_bytes(h[:4], "big") % self.dimension
            sign = 1.0 if (h[4] % 2 == 0) else -1.0
            weight = 1.0 + (h[5] / 255.0)
            vec[idx] += sign * weight

        # L2 Normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        else:
            vec = [1.0 / math.sqrt(self.dimension)] * self.dimension

        return vec


def get_embedding_provider(use_fake: bool = False) -> EmbeddingProvider:
    """Factory for selecting embedding provider."""
    if use_fake:
        return DeterministicFakeEmbeddingProvider()
    return OllamaEmbeddingProvider()
