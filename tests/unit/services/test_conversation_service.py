"""
Unit tests for ConversationService orchestrator and SSE stream generation.
(Codename: Kestrel)
"""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.app.agent_client.gateway_client import GatewayGenerationResult
from backend.app.core.config import settings
from backend.app.models.entities import ChatSession
from backend.app.retrieval.hybrid_search import EvidenceItem, RetrievalResult
from backend.app.services.conversation_service import (
    ConversationService,
    ModelNotAllowedError,
)


@pytest.mark.asyncio
async def test_conversation_service_stream_research_flow():
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    # Session mock
    session_obj = ChatSession(id=session_id, user_id=user_id, title="Test Chat")
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj

    # History mock
    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []

    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    # Mock retrieval service
    mock_retrieval = AsyncMock()
    evidence_item = EvidenceItem(
        evidence_id="E1",
        chunk_id=chunk_id,
        source_id=source_id,
        source_key="episodes/brian-balfour/transcript.md",
        chunk_index=0,
        episode_title="Four Fits Framework",
        guest="Brian Balfour",
        episode_url="https://youtube.com/watch?v=123",
        publish_date="2023-05-01",
        excerpt="Product-market fit is not enough; you need market-product fit, model-market fit, and channel-model fit.",
        char_start=0,
        char_end=120,
        rrf_score=0.016,
        dense_rank=1,
        sparse_rank=1,
    )
    mock_retrieval.search.return_value = RetrievalResult(
        items=[evidence_item],
        insufficient_evidence=False,
        query="What is the Four Fits framework?",
    )

    # Mock gateway client
    mock_gateway = AsyncMock()
    mock_gateway.generate.return_value = GatewayGenerationResult(
        request_id="req-123",
        session_id=str(session_id),
        provider="local",
        model_id="qwen2.5:1.5b",
        raw_response="""{
            "answer_markdown": "Growth loops require multiple fits [E1].",
            "citations": [{"evidence_id": "E1", "supports": "Four Fits Framework"}],
            "insufficient_evidence": false
        }""",
        latency_ms=250.0,
    )

    service = ConversationService(
        retrieval_service=mock_retrieval,
        gateway_client=mock_gateway,
    )

    events = []
    async for event in service.process_message_stream(
        db=mock_db,
        session_id=session_id,
        user_id=user_id,
        content="What is the Four Fits framework?",
        mode="research",
        provider="local",
    ):
        events.append(event)

    # Verify stage progression
    event_names = [e["event"] for e in events]
    assert "run_started" in event_names
    assert "completed" in event_names
    assert event_names.count("stage") == 5

    stages = [e["data"]["stage"] for e in events if e["event"] == "stage"]
    assert stages == [
        "loading_context",
        "retrieving",
        "drafting",
        "validating",
        "saving",
    ]

    # Verify completed event content
    completed_event = next(e for e in events if e["event"] == "completed")
    completed_data = completed_event["data"]

    assert completed_data["message"]["status"] == "complete"
    assert (
        "Growth loops require multiple fits [E1]"
        in completed_data["message"]["content"]
    )
    assert len(completed_data["citations"]) == 1
    cit = completed_data["citations"][0]
    assert cit["evidence_id"] == "E1"
    assert cit["guest"] == "Brian Balfour"
    assert cit["episode_title"] == "Four Fits Framework"
    assert cit["excerpt"] == evidence_item.excerpt


@pytest.mark.asyncio
async def test_conversation_service_prunes_hallucinated_citations():
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    session_obj = ChatSession(id=session_id, user_id=user_id)
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj
    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []
    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    # Only E1 is in evidence
    mock_retrieval = AsyncMock()
    evidence_item = EvidenceItem(
        evidence_id="E1",
        chunk_id=chunk_id,
        source_id=source_id,
        source_key="episodes/elena-verna/transcript.md",
        chunk_index=0,
        episode_title="PLG Motion",
        guest="Elena Verna",
        episode_url=None,
        publish_date=None,
        excerpt="Focus on self-serve onboarding.",
        char_start=0,
        char_end=50,
        rrf_score=0.016,
        dense_rank=1,
        sparse_rank=1,
    )
    mock_retrieval.search.return_value = RetrievalResult(
        items=[evidence_item],
        insufficient_evidence=False,
        query="Tell me about PLG",
    )

    # Model hallucinates E99!
    mock_gateway = AsyncMock()
    mock_gateway.generate.return_value = GatewayGenerationResult(
        request_id="req-999",
        session_id=str(session_id),
        provider="local",
        model_id="qwen2.5:1.5b",
        raw_response="""{
            "answer_markdown": "Elena advocates self-serve [E1]. But another guest said something [E99].",
            "citations": [
                {"evidence_id": "E1", "supports": "Self-serve onboarding"},
                {"evidence_id": "E99", "supports": "Hallucinated citation"}
            ],
            "insufficient_evidence": false
        }""",
        latency_ms=100.0,
    )

    service = ConversationService(
        retrieval_service=mock_retrieval,
        gateway_client=mock_gateway,
    )

    events = [
        e
        async for e in service.process_message_stream(
            db=mock_db,
            session_id=session_id,
            user_id=user_id,
            content="Tell me about PLG",
        )
    ]

    completed_event = next(e for e in events if e["event"] == "completed")
    citations = completed_event["data"]["citations"]

    # E99 must have been pruned!
    assert len(citations) == 1
    assert citations[0]["evidence_id"] == "E1"


@pytest.mark.asyncio
async def test_conversation_service_session_not_found_returns_error_envelope():
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    mock_db = AsyncMock()

    # Session not found
    mock_res = MagicMock()
    mock_res.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_res

    service = ConversationService()
    events = [
        e
        async for e in service.process_message_stream(
            db=mock_db,
            session_id=session_id,
            user_id=user_id,
            content="Hello",
        )
    ]

    assert len(events) == 2
    assert events[0]["event"] == "stage"
    assert events[1]["event"] == "error"
    assert events[1]["data"]["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_conversation_service_abstains_when_evidence_empty():
    """Spec §7.6/§11.2/§12.1: empty retrieval must NOT call generation."""
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    session_obj = ChatSession(id=session_id, user_id=user_id, title="New Chat")
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj
    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []
    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    mock_retrieval = AsyncMock()
    mock_retrieval.search.return_value = RetrievalResult(
        items=[],
        insufficient_evidence=True,
        query="What is the average PLG conversion benchmark?",
    )

    mock_gateway = AsyncMock()  # must never be called

    service = ConversationService(
        retrieval_service=mock_retrieval,
        gateway_client=mock_gateway,
    )

    events = [
        e
        async for e in service.process_message_stream(
            db=mock_db,
            session_id=session_id,
            user_id=user_id,
            content="What is the average PLG conversion benchmark?",
        )
    ]

    mock_gateway.generate.assert_not_called()
    completed = next(e for e in events if e["event"] == "completed")
    assert completed["data"]["insufficient_evidence"] is True
    assert completed["data"]["citations"] == []
    assert "Not in the archive" in completed["data"]["message"]["content"]
    assert completed["data"]["message"]["status"] == "complete"


@pytest.mark.asyncio
async def test_conversation_service_gateway_connection_error_is_redacted():
    """Spec §6.1/§11.1: raw exception text (URLs, internals) must never reach
    the client; the error is classified as AGENT_UNAVAILABLE."""
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    session_obj = ChatSession(id=session_id, user_id=user_id)
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj
    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []
    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    evidence_item = EvidenceItem(
        evidence_id="E1",
        chunk_id=uuid.uuid4(),
        source_id=uuid.uuid4(),
        source_key="episodes/x/transcript.md",
        chunk_index=0,
        episode_title="Episode",
        guest="Guest",
        episode_url=None,
        publish_date=None,
        excerpt="Some passage.",
        char_start=0,
        char_end=20,
        rrf_score=0.01,
        dense_rank=1,
        sparse_rank=None,
    )
    mock_retrieval = AsyncMock()
    mock_retrieval.search.return_value = RetrievalResult(
        items=[evidence_item],
        insufficient_evidence=False,
        query="q",
    )

    mock_gateway = AsyncMock()
    mock_gateway.generate.side_effect = ConnectionError(
        "Could not connect to agent gateway at http://agent-gateway:8010 "
        "with token super-secret-value"
    )

    service = ConversationService(
        retrieval_service=mock_retrieval,
        gateway_client=mock_gateway,
    )

    events = [
        e
        async for e in service.process_message_stream(
            db=mock_db,
            session_id=session_id,
            user_id=user_id,
            content="Hello",
        )
    ]

    error_event = next(e for e in events if e["event"] == "error")
    err = error_event["data"]["error"]
    assert err["code"] == "AGENT_UNAVAILABLE"
    assert err["retryable"] is True
    # No internal URL or secret material may leak into the client envelope.
    assert "agent-gateway:8010" not in err["message"]
    assert "super-secret-value" not in err["message"]
    assert "request_id" in err


@pytest.mark.asyncio
async def test_conversation_service_marks_cancelled_on_disconnect():
    """Spec §6.5: a disconnected/struck run must leave the assistant message
    in terminal 'cancelled' state, never 'pending' or 'complete'."""
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    session_obj = ChatSession(id=session_id, user_id=user_id)
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj
    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []
    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    mock_retrieval = AsyncMock()
    evidence_item = EvidenceItem(
        evidence_id="E1",
        chunk_id=uuid.uuid4(),
        source_id=uuid.uuid4(),
        source_key="episodes/x/transcript.md",
        chunk_index=0,
        episode_title="Episode",
        guest="Guest",
        episode_url=None,
        publish_date=None,
        excerpt="Some passage.",
        char_start=0,
        char_end=20,
        rrf_score=0.01,
        dense_rank=1,
        sparse_rank=None,
    )
    mock_retrieval.search.return_value = RetrievalResult(
        items=[evidence_item],
        insufficient_evidence=False,
        query="q",
    )

    # Gateway call hangs until cancelled
    async def slow_generate(*args, **kwargs):
        await asyncio.sleep(30)
        raise AssertionError("should have been cancelled")

    mock_gateway = AsyncMock()
    mock_gateway.generate.side_effect = slow_generate

    service = ConversationService(
        retrieval_service=mock_retrieval,
        gateway_client=mock_gateway,
    )

    gen = service.process_message_stream(
        db=mock_db,
        session_id=session_id,
        user_id=user_id,
        content="Hello",
    )
    seen = []
    async for event in gen:
        seen.append(event["event"])
        if event["event"] == "stage" and event["data"]["stage"] == "drafting":
            break
    await gen.aclose()

    added_messages = [c.args[0] for c in mock_db.add.call_args_list]
    assistant_messages = [
        m for m in added_messages if getattr(m, "role", None) == "assistant"
    ]
    assert assistant_messages, (
        "assistant message must have been created before drafting"
    )
    assistant = assistant_messages[0]
    assert assistant.status == "cancelled"
    assert assistant.error_code == "CANCELLED"
    assert assistant.content == ""


@pytest.mark.asyncio
async def test_conversation_service_rejects_disallowed_model():
    """Spec §6.6: model_id must come from the server allowlist."""
    service = ConversationService()
    events = [
        e
        async for e in service.process_message_stream(
            db=AsyncMock(),
            session_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            content="Hello",
            provider="local",
            model_id="some-unconfigured-model",
        )
    ]
    assert len(events) == 1
    err = events[0]["data"]["error"]
    assert err["code"] == "MODEL_NOT_ALLOWED"
    assert "some-unconfigured-model" in err["message"]
    assert err["retryable"] is False


@pytest.mark.asyncio
async def test_resolve_model_id_allowlist():
    """Default resolution returns the configured model; explicit requests
    must be inside the allowlist for the selected provider."""
    assert (
        ConversationService.resolve_model_id("local", None, None)
        == settings.OLLAMA_CHAT_MODEL
    )
    assert (
        ConversationService.resolve_model_id("cloud", "gemini", None)
        == settings.GEMINI_MODEL
    )
    assert (
        ConversationService.resolve_model_id("cloud", "anthropic", None)
        == settings.ANTHROPIC_MODEL
    )
    with pytest.raises(ModelNotAllowedError):
        ConversationService.resolve_model_id("cloud", "anthropic", "gpt-4o")
