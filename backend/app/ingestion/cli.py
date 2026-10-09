"""
Ingestion Command-Line Interface.
Supports syncing upstream transcripts, idempotent indexing, and database statistics.
Usage:
    python -m backend.app.ingestion.cli sync
    python -m backend.app.ingestion.cli index [--limit N] [--force]
    python -m backend.app.ingestion.cli reindex
    python -m backend.app.ingestion.cli stats
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from sqlalchemy import func, select

from backend.app.db.session import async_session_factory
from backend.app.ingestion.indexer import TranscriptIndexer
from backend.app.ingestion.syncer import get_git_commit, sync_transcripts_repo
from backend.app.models.entities import TranscriptChunk, TranscriptSource
from backend.app.retrieval.embedder import get_embedding_provider

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ingestion.cli")

DEFAULT_CACHE_DIR = Path("transcripts-cache")


async def run_sync(target_dir: Path) -> str:
    """Sync upstream transcript repository to target directory."""
    logger.info("Starting upstream repository sync into %s...", target_dir)
    commit = sync_transcripts_repo(target_dir)
    logger.info("Successfully synced upstream repository. Commit: %s", commit)
    return commit


async def run_index(
    target_dir: Path,
    force: bool = False,
    limit: int | None = None,
    use_fake: bool = False,
) -> None:
    """Index transcripts from local cache into database."""
    if not target_dir.exists():
        logger.error(
            "Target directory %s does not exist. Run 'sync' first.", target_dir
        )
        sys.exit(1)

    commit = get_git_commit(target_dir)
    embedder = get_embedding_provider(use_fake=use_fake)
    indexer = TranscriptIndexer(embedder=embedder)

    logger.info(
        "Indexing transcripts (force=%s, limit=%s, fake_embed=%s)...",
        force,
        limit,
        use_fake,
    )
    stats = await indexer.index_directory(
        base_dir=target_dir,
        repo_commit=commit,
        force_reindex=force,
        limit=limit,
    )
    print("\n--- INGESTION REPORT ---")
    print(json.dumps(stats.to_dict(), indent=2))


async def run_stats() -> None:
    """Print current source and chunk statistics from database."""
    async with async_session_factory() as session:
        sources_total = await session.scalar(select(func.count(TranscriptSource.id)))
        sources_active = await session.scalar(
            select(func.count(TranscriptSource.id)).where(
                TranscriptSource.is_active.is_(True)
            )
        )
        chunks_total = await session.scalar(select(func.count(TranscriptChunk.id)))

        data = {
            "total_sources": sources_total or 0,
            "active_sources": sources_active or 0,
            "total_chunks": chunks_total or 0,
        }
        print("\n--- KNOWLEDGE BASE STATS ---")
        print(json.dumps(data, indent=2))


async def run_benchmark_cli(
    eval_file: Path,
    use_fake: bool = False,
    top_k: int = 5,
) -> None:
    """Run retrieval benchmark suite from evaluation YAML."""
    from backend.app.retrieval.benchmark import run_retrieval_benchmark
    from backend.app.retrieval.hybrid_search import HybridRetrievalService

    embedder = get_embedding_provider(use_fake=use_fake)
    service = HybridRetrievalService(embedder=embedder)

    async with async_session_factory() as session:
        report = await run_retrieval_benchmark(
            eval_cases_path=eval_file,
            service=service,
            session=session,
            k=top_k,
        )
        print("\n--- RETRIEVAL BENCHMARK REPORT ---")
        print(json.dumps(report.to_dict(), indent=2))
        print(
            f"\nOverall Mean Recall@{top_k}: {report.mean_recall_at_k * 100:.1f}% "
            f"({report.passed_cases}/{report.total_cases} cases passed)"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Lenny Growth Assistant transcript ingestion CLI"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Sync command
    sync_p = subparsers.add_parser("sync", help="Sync upstream transcript repository")
    sync_p.add_argument(
        "--dir", type=Path, default=DEFAULT_CACHE_DIR, help="Local cache directory"
    )

    # Index command
    index_p = subparsers.add_parser(
        "index", help="Index transcripts into PostgreSQL + pgvector"
    )
    index_p.add_argument(
        "--dir", type=Path, default=DEFAULT_CACHE_DIR, help="Local cache directory"
    )
    index_p.add_argument(
        "--force", action="store_true", help="Force reindexing all transcripts"
    )
    index_p.add_argument(
        "--limit", type=int, default=None, help="Limit number of transcripts to process"
    )
    index_p.add_argument(
        "--fake-embed", action="store_true", help="Use fast fake embeddings for testing"
    )

    # Reindex command
    reindex_p = subparsers.add_parser("reindex", help="Force reindex all transcripts")
    reindex_p.add_argument(
        "--dir", type=Path, default=DEFAULT_CACHE_DIR, help="Local cache directory"
    )
    reindex_p.add_argument(
        "--limit", type=int, default=None, help="Limit number of transcripts to process"
    )

    # Stats command
    subparsers.add_parser("stats", help="Show database knowledge base statistics")

    # Benchmark command
    bench_p = subparsers.add_parser(
        "benchmark", help="Run retrieval evaluation benchmark"
    )
    bench_p.add_argument(
        "--eval-file",
        type=Path,
        default=Path("docs/evaluation/retrieval_cases.yaml"),
        help="Path to evaluation cases YAML",
    )
    bench_p.add_argument(
        "--fake-embed", action="store_true", help="Use deterministic fake embeddings"
    )
    bench_p.add_argument(
        "--top-k", type=int, default=5, help="Recall@K top-k parameter"
    )

    args = parser.parse_args()

    if args.command == "sync":
        asyncio.run(run_sync(args.dir))
    elif args.command == "index":
        asyncio.run(
            run_index(
                args.dir, force=args.force, limit=args.limit, use_fake=args.fake_embed
            )
        )
    elif args.command == "reindex":
        asyncio.run(run_index(args.dir, force=True, limit=args.limit, use_fake=False))
    elif args.command == "stats":
        asyncio.run(run_stats())
    elif args.command == "benchmark":
        asyncio.run(
            run_benchmark_cli(
                eval_file=args.eval_file,
                use_fake=args.fake_embed,
                top_k=args.top_k,
            )
        )


if __name__ == "__main__":
    main()
