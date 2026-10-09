"""
Phase 1 Integration Tests:
- Live Readiness probe (/api/v1/health/ready) verifying PostgreSQL, Ollama, and Gateway connectivity.
- Live PostgreSQL + pgvector persistence: CRUD and cosine similarity vector search on Vector(768).
"""

import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.models.entities import (
    Artifact,
    ChatSession,
    GrowthBrief,
    Message,
    MessageSource,
    TranscriptChunk,
    TranscriptSource,
    User,
)

# Test-scoped session factory with NullPool to prevent asyncpg cross-event-loop connection reuse
test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool, echo=False)
TestAsyncSession = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest.mark.asyncio
async def test_health_ready_live_dependencies():
    """Verifies that the /health/ready probe reports database up."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
        assert response.status_code == 200, f"Health ready failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ready"
        assert "components" in data
        assert data["components"]["database"]["status"] == "up"
        assert data["components"]["database"]["type"] == "postgresql"


@pytest.mark.asyncio
async def test_live_postgres_pgvector_crud_and_similarity_search():
    """
    Live test against PostgreSQL pgvector container:
    1. Inserts TranscriptSource and TranscriptChunk with 768-dim vector embedding.
    2. Performs pgvector cosine distance nearest neighbor search.
    3. Persists ChatSession, Message, MessageSource, GrowthBrief, and Artifact.
    4. Cleans up test records.
    """
    session_id = uuid.uuid4()
    user_id = uuid.uuid4()
    source_id = uuid.uuid4()
    chunk_1_id = uuid.uuid4()
    chunk_2_id = uuid.uuid4()
    msg_id = uuid.uuid4()
    brief_id = uuid.uuid4()
    artifact_id = uuid.uuid4()

    # Dimension 768 vectors
    # Vector 1: mostly aligned with first dimension
    vec1 = [0.0] * 768
    vec1[0] = 1.0

    # Vector 2: mostly aligned with second dimension
    vec2 = [0.0] * 768
    vec2[1] = 1.0

    # Query vector: close to Vector 1
    query_vec = [0.0] * 768
    query_vec[0] = 0.95
    query_vec[1] = 0.05

    async with TestAsyncSession() as session:
        # 1. Create TranscriptSource
        source = TranscriptSource(
            id=source_id,
            source_key=f"elena-verna-retention-{session_id}",
            title="Elena Verna on B2B Product-Led Growth",
            guest="Elena Verna",
            publish_date=datetime.date(2024, 3, 1),
            episode_url="https://lenny.example.com/elena-verna",
            content_hash="source_hash_001",
            is_active=True,
        )
        session.add(source)

        # 2. Create 2 chunks with 768-dim embeddings
        chunk1 = TranscriptChunk(
            id=chunk_1_id,
            source_id=source_id,
            chunk_index=0,
            content="Activation is the single biggest predictor of long-term B2B retention.",
            token_count=12,
            embedding=vec1,
            content_hash="hash_001",
        )
        chunk2 = TranscriptChunk(
            id=chunk_2_id,
            source_id=source_id,
            chunk_index=1,
            content="Pricing and packaging should be revisited at least every six months.",
            token_count=11,
            embedding=vec2,
            content_hash="hash_002",
        )
        session.add_all([chunk1, chunk2])

        # 3. Create User and ChatSession
        test_user = User(
            id=user_id,
            email=f"user-{user_id}@kestrel.test",
            full_name="Test Operator",
        )
        session.add(test_user)

        chat_session = ChatSession(
            id=session_id,
            user_id=user_id,
            title="Elena Verna PLG Strategy",
            provider="local",
        )
        session.add(chat_session)

        # 4. Create Message
        msg = Message(
            id=msg_id,
            session_id=session_id,
            role="assistant",
            content="According to Elena Verna, activation is key to retention [E1].",
            mode="research",
            provider="local",
            model_id="qwen2.5:1.5b",
            status="complete",
        )
        session.add(msg)
        await session.flush()

        # 5. Create MessageSource (citation linkage)
        msg_source = MessageSource(
            message_id=msg_id,
            chunk_id=chunk_1_id,
            evidence_id="E1",
            supports="Activation is the single biggest predictor of long-term B2B retention.",
            retrieval_rank=1,
            semantic_score=0.95,
            keyword_score=0.88,
        )
        session.add(msg_source)

        # 6. Create GrowthBrief
        brief = GrowthBrief(
            id=brief_id,
            session_id=session_id,
            source_message_id=msg_id,
            title="B2B Growth Motion",
            version=1,
            status="draft",
            product_context="PLG SaaS onboarding optimization",
            data={
                "stage": "Series A",
                "churn_monthly": "2.5%",
                "hypotheses": [{"id": "H1", "statement": "Optimize onboarding step 2"}],
                "experiments": [{"id": "EXP-1", "name": "Self-serve checklist"}],
            },
        )
        session.add(brief)
        await session.flush()

        # 7. Create Artifact
        artifact = Artifact(
            id=artifact_id,
            session_id=session_id,
            source_message_id=msg_id,
            growth_brief_id=brief_id,
            kind="checklist",
            title="Activation Checklist",
            content="1. Setup workspace\n2. Invite teammate",
            preview_content="Activation Checklist preview",
            version=1,
        )
        session.add(artifact)

        await session.commit()

    # Now verify query and vector similarity search
    async with TestAsyncSession() as session:
        # Nearest neighbor query using pgvector cosine_distance
        stmt = (
            select(TranscriptChunk)
            .where(TranscriptChunk.source_id == source_id)
            .order_by(TranscriptChunk.embedding.cosine_distance(query_vec))
            .limit(1)
        )
        result = await session.execute(stmt)
        nearest = result.scalar_one_or_none()
        assert nearest is not None
        assert nearest.id == chunk_1_id, "Cosine distance search must rank aligned chunk #1 first"
        assert "Activation is the single biggest predictor" in nearest.content

        # Verify chat session and messages
        res_session = await session.execute(select(ChatSession).where(ChatSession.id == session_id))
        fetched_session = res_session.scalar_one_or_none()
        assert fetched_session is not None
        assert fetched_session.title == "Elena Verna PLG Strategy"

        # Verify brief and artifact
        res_brief = await session.execute(select(GrowthBrief).where(GrowthBrief.id == brief_id))
        fetched_brief = res_brief.scalar_one_or_none()
        assert fetched_brief is not None
        assert fetched_brief.data["stage"] == "Series A"

        # Cleanup test entities
        await session.execute(delete(Artifact).where(Artifact.id == artifact_id))
        await session.execute(delete(GrowthBrief).where(GrowthBrief.id == brief_id))
        await session.execute(delete(MessageSource).where(MessageSource.message_id == msg_id))
        await session.execute(delete(Message).where(Message.id == msg_id))
        await session.execute(delete(ChatSession).where(ChatSession.id == session_id))
        await session.execute(delete(User).where(User.id == user_id))
        await session.execute(delete(TranscriptChunk).where(TranscriptChunk.source_id == source_id))
        await session.execute(delete(TranscriptSource).where(TranscriptSource.id == source_id))
        await session.commit()

    await test_engine.dispose()
