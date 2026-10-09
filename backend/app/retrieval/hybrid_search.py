"""
Hybrid Retrieval Service.
Combines dense vector similarity (pgvector cosine) and sparse keyword search (tsvector/websearch_to_tsquery)
using Reciprocal-Rank Fusion (RRF), source diversity constraints, and deterministic evidence labeling.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.retrieval.embedder import EmbeddingProvider, get_embedding_provider

logger = logging.getLogger(__name__)

# Standard RRF smoothing constant (Cormack et al.)
RRF_K = 60


@dataclass(frozen=True)
class RetrievedCandidate:
    """Raw candidate returned from either dense or sparse retrieval."""

    chunk_id: uuid.UUID
    source_id: uuid.UUID
    source_key: str
    chunk_index: int
    content: str
    token_count: int
    char_start: int | None
    char_end: int | None
    episode_title: str
    guest: str | None
    episode_url: str | None
    publish_date: str | None
    raw_score: float
    system: str  # "dense" or "sparse"


@dataclass(frozen=True)
class EvidenceItem:
    """Ranked evidence item with assigned request-scoped ID [E1, E2, ...]."""

    evidence_id: str  # "E1", "E2", ...
    chunk_id: uuid.UUID
    source_id: uuid.UUID
    source_key: str
    chunk_index: int
    episode_title: str
    guest: str | None
    episode_url: str | None
    publish_date: str | None
    excerpt: str
    char_start: int | None
    char_end: int | None
    rrf_score: float
    dense_rank: int | None
    sparse_rank: int | None

    def to_citation_dict(self, supports: str = "") -> dict[str, Any]:
        """Format as API citation response matching spec §6.4."""
        return {
            "evidence_id": self.evidence_id,
            "source_id": str(self.source_id),
            "chunk_id": str(self.chunk_id),
            "guest": self.guest or "Unknown Guest",
            "episode_title": self.episode_title,
            "episode_url": self.episode_url or "",
            "publish_date": self.publish_date or "",
            "excerpt": self.excerpt,
            "supports": supports,
        }


def compute_rrf_fusion(
    dense_candidates: Sequence[RetrievedCandidate],
    sparse_candidates: Sequence[RetrievedCandidate],
    dense_weight: float = 0.6,
    sparse_weight: float = 0.4,
    rrf_k: int = RRF_K,
    top_k: int = 8,
    max_per_source: int = 3,
    min_score: float = 0.0,
) -> list[EvidenceItem]:
    """
    Pure Reciprocal-Rank Fusion (RRF) algorithm.
    Fuses two ranked lists, applies source diversity and score thresholds,
    and assigns sequential evidence labels (E1, E2, ...).
    """
    scores: dict[uuid.UUID, float] = {}
    dense_ranks: dict[uuid.UUID, int] = {}
    sparse_ranks: dict[uuid.UUID, int] = {}
    candidate_map: dict[uuid.UUID, RetrievedCandidate] = {}

    # 1. Score dense candidates
    for rank_idx, cand in enumerate(dense_candidates, start=1):
        scores[cand.chunk_id] = scores.get(cand.chunk_id, 0.0) + (
            dense_weight / (rrf_k + rank_idx)
        )
        dense_ranks[cand.chunk_id] = rank_idx
        candidate_map[cand.chunk_id] = cand

    # 2. Score sparse candidates
    for rank_idx, cand in enumerate(sparse_candidates, start=1):
        scores[cand.chunk_id] = scores.get(cand.chunk_id, 0.0) + (
            sparse_weight / (rrf_k + rank_idx)
        )
        sparse_ranks[cand.chunk_id] = rank_idx
        if cand.chunk_id not in candidate_map:
            candidate_map[cand.chunk_id] = cand

    # 3. Sort candidates by fused RRF score descending
    sorted_chunk_ids = sorted(scores.keys(), key=lambda cid: scores[cid], reverse=True)

    # 4. Apply diversity constraint and filter
    selected_items: list[EvidenceItem] = []
    source_counts: dict[uuid.UUID, int] = {}

    for cid in sorted_chunk_ids:
        score = scores[cid]
        if score < min_score:
            continue

        cand = candidate_map[cid]
        count = source_counts.get(cand.source_id, 0)
        if count >= max_per_source:
            continue

        source_counts[cand.source_id] = count + 1
        evidence_label = f"E{len(selected_items) + 1}"

        item = EvidenceItem(
            evidence_id=evidence_label,
            chunk_id=cand.chunk_id,
            source_id=cand.source_id,
            source_key=cand.source_key,
            chunk_index=cand.chunk_index,
            episode_title=cand.episode_title,
            guest=cand.guest,
            episode_url=cand.episode_url,
            publish_date=cand.publish_date,
            excerpt=cand.content,
            char_start=cand.char_start,
            char_end=cand.char_end,
            rrf_score=round(score, 6),
            dense_rank=dense_ranks.get(cid),
            sparse_rank=sparse_ranks.get(cid),
        )
        selected_items.append(item)

        if len(selected_items) >= top_k:
            break

    return selected_items


@dataclass(frozen=True)
class RetrievalResult(Sequence[EvidenceItem]):
    """
    Search result containing ranked evidence items and insufficient evidence detection.
    Inherits from Sequence[EvidenceItem] for 100% backward-compatible list operations.
    """

    items: list[EvidenceItem]
    insufficient_evidence: bool
    query: str
    top_score: float = 0.0
    top_dense_score: float = 0.0

    def __iter__(self):
        return iter(self.items)

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int) -> EvidenceItem:  # type: ignore[override]
        return self.items[index]


class HybridRetrievalService:
    """Service executing PostgreSQL hybrid retrieval and RRF fusion."""

    def __init__(
        self,
        embedder: EmbeddingProvider | None = None,
        top_k: int | None = None,
        min_dense_score: float | None = None,
        min_rrf_score: float = 0.0,
    ) -> None:
        self.embedder = embedder or get_embedding_provider()
        self.top_k = top_k or settings.RETRIEVAL_TOP_K
        self.min_dense_score = (
            min_dense_score
            if min_dense_score is not None
            else settings.RETRIEVAL_MIN_SCORE
        )
        self.min_rrf_score = min_rrf_score

    async def search(
        self,
        session: AsyncSession,
        query: str,
        top_k: int | None = None,
        max_per_source: int = 3,
        min_dense_score: float | None = None,
        min_rrf_score: float | None = None,
    ) -> RetrievalResult:
        """
        Execute hybrid search over transcript_chunks and return grounded evidence items.

        Args:
            session: Active SQLAlchemy async database session.
            query: Natural language query from user.
            top_k: Max evidence items to return (defaults to settings.RETRIEVAL_TOP_K).
            max_per_source: Max chunks permitted from the same episode.
            min_dense_score: Cosine similarity cutoff for dense candidates.
            min_rrf_score: RRF threshold cutoff for fused candidates.
        """
        effective_top_k = top_k or self.top_k
        effective_min_dense = (
            min_dense_score if min_dense_score is not None else self.min_dense_score
        )
        effective_min_rrf = (
            min_rrf_score if min_rrf_score is not None else self.min_rrf_score
        )

        clean_query = query.strip()
        if not clean_query:
            return RetrievalResult(
                items=[],
                insufficient_evidence=True,
                query=query,
                top_score=0.0,
                top_dense_score=0.0,
            )

        # 1. Compute query vector
        query_embedding = await self.embedder.embed_query(clean_query)
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        # 2. Retrieve dense vector candidates meeting min_dense_score
        dense_candidates = await self._retrieve_dense(
            session=session,
            query_vector_str=embedding_str,
            limit=effective_top_k * 3,
            min_dense_score=effective_min_dense,
        )

        # 3. Retrieve sparse keyword candidates
        sparse_candidates = await self._retrieve_sparse(
            session=session,
            query_text=clean_query,
            limit=effective_top_k * 3,
        )

        # 4. Fuse using Reciprocal-Rank Fusion
        items = compute_rrf_fusion(
            dense_candidates=dense_candidates,
            sparse_candidates=sparse_candidates,
            top_k=effective_top_k,
            max_per_source=max_per_source,
            min_score=effective_min_rrf,
        )

        top_score = items[0].rrf_score if items else 0.0
        top_dense = max((c.raw_score for c in dense_candidates), default=0.0)

        # Insufficient evidence if no candidates qualified
        insufficient = len(items) == 0

        return RetrievalResult(
            items=items,
            insufficient_evidence=insufficient,
            query=clean_query,
            top_score=top_score,
            top_dense_score=top_dense,
        )

    async def _retrieve_dense(
        self,
        session: AsyncSession,
        query_vector_str: str,
        limit: int,
        min_dense_score: float = 0.0,
    ) -> list[RetrievedCandidate]:
        sql = text("""
            SELECT 
                tc.id AS chunk_id,
                tc.source_id,
                ts.source_key,
                tc.chunk_index,
                tc.content,
                tc.token_count,
                tc.char_start,
                tc.char_end,
                ts.title AS episode_title,
                ts.guest,
                ts.episode_url,
                to_char(ts.publish_date, 'YYYY-MM-DD') AS publish_date,
                (1 - (tc.embedding <=> CAST(:query_vector AS vector))) AS score
            FROM transcript_chunks tc
            JOIN transcript_sources ts ON tc.source_id = ts.id
            WHERE ts.is_active = TRUE
              AND (1 - (tc.embedding <=> CAST(:query_vector AS vector))) >= :min_dense_score
            ORDER BY tc.embedding <=> CAST(:query_vector AS vector) ASC
            LIMIT :limit
        """)

        result = await session.execute(
            sql,
            {
                "query_vector": query_vector_str,
                "limit": limit,
                "min_dense_score": min_dense_score,
            },
        )

        rows = result.mappings().all()

        return [
            RetrievedCandidate(
                chunk_id=row["chunk_id"],
                source_id=row["source_id"],
                source_key=row["source_key"],
                chunk_index=row["chunk_index"],
                content=row["content"],
                token_count=row["token_count"],
                char_start=row["char_start"],
                char_end=row["char_end"],
                episode_title=row["episode_title"],
                guest=row["guest"],
                episode_url=row["episode_url"],
                publish_date=row["publish_date"],
                raw_score=float(row["score"]),
                system="dense",
            )
            for row in rows
        ]

    async def _retrieve_sparse(
        self,
        session: AsyncSession,
        query_text: str,
        limit: int,
    ) -> list[RetrievedCandidate]:
        sql = text("""
            SELECT 
                tc.id AS chunk_id,
                tc.source_id,
                ts.source_key,
                tc.chunk_index,
                tc.content,
                tc.token_count,
                tc.char_start,
                tc.char_end,
                ts.title AS episode_title,
                ts.guest,
                ts.episode_url,
                to_char(ts.publish_date, 'YYYY-MM-DD') AS publish_date,
                ts_rank_cd(tc.search_vector, websearch_to_tsquery('english', :query)) AS score
            FROM transcript_chunks tc
            JOIN transcript_sources ts ON tc.source_id = ts.id
            WHERE ts.is_active = TRUE
              AND tc.search_vector @@ websearch_to_tsquery('english', :query)
            ORDER BY score DESC
            LIMIT :limit
        """)

        try:
            result = await session.execute(sql, {"query": query_text, "limit": limit})
            rows = result.mappings().all()
        except SQLAlchemyError as e:
            logger.warning(
                "Sparse keyword query failed for query %r: %s", query_text, e
            )
            return []

        return [
            RetrievedCandidate(
                chunk_id=row["chunk_id"],
                source_id=row["source_id"],
                source_key=row["source_key"],
                chunk_index=row["chunk_index"],
                content=row["content"],
                token_count=row["token_count"],
                char_start=row["char_start"],
                char_end=row["char_end"],
                episode_title=row["episode_title"],
                guest=row["guest"],
                episode_url=row["episode_url"],
                publish_date=row["publish_date"],
                raw_score=float(row["score"]),
                system="sparse",
            )
            for row in rows
        ]
