"""
Unit tests for ConversationService orchestrator and SSE stream generation.
(Codename: Kestrel)
"""

from __future__ import annotations

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.app.agent_client.gateway_client import GatewayGenerationResult
from backend.app.core.config import settings
from backend.app.models.entities import ChatSession, Message, MessageSource
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
async def test_conversation_service_generates_when_evidence_empty():
    """Empty retrieval calls gateway allowing conversational turns and honest declines."""
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

    mock_gateway = AsyncMock()
    mock_gateway.generate.return_value = GatewayGenerationResult(
        request_id="req-1",
        session_id=str(session_id),
        provider="local",
        model_id="qwen2.5:7b-instruct-q4_K_M",
        raw_response=json.dumps({
            "answer_markdown": "The Lenny's Podcast archive does not contain specific PLG conversion benchmarks.",
            "citations": [],
            "insufficient_evidence": True,
            "scope": "in_scope",
            "follow_up_question": "Would you like to explore qualitative PLG frameworks instead?",
        }),
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
            content="What is the average PLG conversion benchmark?",
        )
    ]

    mock_gateway.generate.assert_called_once()
    completed = next(e for e in events if e["event"] == "completed")
    assert completed["data"]["insufficient_evidence"] is True
    assert completed["data"]["citations"] == []
    assert "does not contain" in completed["data"]["message"]["content"]
    assert completed["data"]["message"]["status"] == "complete"


@pytest.mark.asyncio
async def test_conversation_service_fallback_abstention_on_empty_evidence_when_extraction_fails():
    """Empty retrieval falls back to ABSTENTION_ANSWER if model extraction fails after repair."""
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

    mock_gateway = AsyncMock()
    mock_gateway.generate.return_value = GatewayGenerationResult(
        request_id="req-2",
        session_id=str(session_id),
        provider="local",
        model_id="qwen2.5:7b-instruct-q4_K_M",
        raw_response="not json at all",
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
            content="What is the average PLG conversion benchmark?",
        )
    ]

    assert mock_gateway.generate.call_count == 1
    completed = next(e for e in events if e["event"] == "completed")
    assert completed["data"]["insufficient_evidence"] is True
    assert completed["data"]["citations"] == []
    assert "Not in the archive" in completed["data"]["message"]["content"]
    assert completed["data"]["message"]["status"] == "complete"


@pytest.mark.asyncio
async def test_conversation_service_strips_citations_from_history():
    """Citations [E1] in history assistant messages must be substituted with [source] before prompt replay."""
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    session_obj = ChatSession(id=session_id, user_id=user_id, title="New Chat")
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj

    prior_msg = Message(
        id=uuid.uuid4(),
        session_id=session_id,
        role="assistant",
        content="Elena Verna noted [E1] that PLG requires virality [E2].",
        status="complete",
    )
    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = [prior_msg]
    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    mock_retrieval = AsyncMock()
    mock_retrieval.search.return_value = RetrievalResult(
        items=[],
        insufficient_evidence=True,
        query="Tell me more",
    )

    mock_gateway = AsyncMock()
    mock_gateway.generate.return_value = GatewayGenerationResult(
        request_id="req-3",
        session_id=str(session_id),
        provider="local",
        model_id="qwen2.5:7b-instruct-q4_K_M",
        raw_response=json.dumps({
            "answer_markdown": "Here is more context.",
            "citations": [],
            "insufficient_evidence": False,
        }),
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
            content="Tell me more",
        )
    ]
    assert len(events) > 0

    mock_gateway.generate.assert_called_once()
    passed_context = mock_gateway.generate.call_args.kwargs["conversation_context"]
    assert len(passed_context) == 1
    assert passed_context[0]["role"] == "assistant"
    assert passed_context[0]["content"] == "Elena Verna noted [source] that PLG requires virality [source]."
    assert "[E1]" not in passed_context[0]["content"]
    assert "[E2]" not in passed_context[0]["content"]
    assert "[source]" in passed_context[0]["content"]


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
    
    call_count = 0
    def execute_mock(stmt):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_sess_res
        if call_count == 2:
            return mock_hist_res
        asst = next(
            (c.args[0] for c in mock_db.add.call_args_list if getattr(c.args[0], "role", None) == "assistant"),
            None,
        )
        asst_res = MagicMock()
        asst_res.scalar_one_or_none.return_value = asst
        asst_res.scalars.return_value.first.return_value = asst
        return asst_res

    mock_db.execute.side_effect = execute_mock

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


def test_build_retrieval_query_followup_expansion():
    from backend.app.services.conversation_service import build_retrieval_query

    # 1. Standalone substantive query is unchanged
    q1 = "What is Elena Verna's framework for B2B PLG activation?"
    assert build_retrieval_query(q1, "Earlier message") == q1

    # 2. Pronoun query is joined with prior user turn
    q2 = "Why does she recommend that?"
    expanded = build_retrieval_query(q2, "Elena Verna talks about freemium")
    assert expanded == "Elena Verna talks about freemium\nWhy does she recommend that?"

    # 3. Short query (<6 words) is joined
    q3 = "tell me more"
    assert build_retrieval_query(q3, "Retention loops") == "Retention loops\ntell me more"

    # 4. If no prior user turn, returned as-is
    assert build_retrieval_query("why that?", None) == "why that?"


def test_trim_history_to_budget():
    import uuid

    from backend.app.models.entities import Message
    from backend.app.services.conversation_service import _trim_history_to_budget

    # Each message: 400 chars -> 100 tokens + 4 = 104 tokens
    m1 = Message(id=uuid.uuid4(), role="user", content="A" * 400)
    m2 = Message(id=uuid.uuid4(), role="assistant", content="B" * 400)
    m3 = Message(id=uuid.uuid4(), role="user", content="C" * 400)

    # Budget of 250 tokens fits m2 and m3 (208 tokens), drops oldest m1
    trimmed = _trim_history_to_budget([m1, m2, m3], budget_tokens=250)
    assert len(trimmed) == 2
    assert trimmed[0] == m2
    assert trimmed[1] == m3


def test_classify_generation_error_typed_gateway_and_truncation():
    from backend.app.agent_client.gateway_client import (
        GatewayConfigError,
        PayloadTooLargeError,
    )
    from backend.app.agent_client.validator import AgentOutputError
    from backend.app.services.conversation_service import classify_generation_error

    # GatewayConfigError (400 missing key) -> PROVIDER_MISCONFIGURED (non-retryable)
    code, msg, retry = classify_generation_error(GatewayConfigError("Missing key"))
    assert code == "PROVIDER_MISCONFIGURED"
    assert retry is False

    # PayloadTooLargeError (413) -> PAYLOAD_TOO_LARGE (non-retryable)
    code, msg, retry = classify_generation_error(PayloadTooLargeError("Too large"))
    assert code == "PAYLOAD_TOO_LARGE"
    assert retry is False

    # PermissionError (403) -> AUTHENTICATION_FAILED (non-retryable)
    code, msg, retry = classify_generation_error(PermissionError("Bad token"))
    assert code == "AUTHENTICATION_FAILED"
    assert retry is False

    # Truncated output -> GENERATION_TRUNCATED (non-retryable)
    code, msg, retry = classify_generation_error(AgentOutputError("TRUNCATED", "Hit max tokens"))
    assert code == "GENERATION_TRUNCATED"
    assert "exceeded the model's output limit" in msg
    assert retry is False


def test_build_retrieval_query_excludes_conversational_pleasantries():
    from backend.app.services.conversation_service import build_retrieval_query

    prior = "What is Elena Verna's framework for B2B PLG?"

    # Conversational pleasantries must NOT be expanded with prior user query
    assert build_retrieval_query("thanks!", prior) == "thanks!"
    assert build_retrieval_query("thank you", prior) == "thank you"
    assert build_retrieval_query("got it", prior) == "got it"
    assert build_retrieval_query("cool", prior) == "cool"
    assert build_retrieval_query("awesome", prior) == "awesome"
    assert build_retrieval_query("ok", prior) == "ok"
    assert build_retrieval_query("hello! what can you do?", prior) == "hello! what can you do?"
    assert build_retrieval_query("bye", prior) == "bye"

    # Genuine follow-ups (< 6 words or pronoun) MUST be expanded
    assert build_retrieval_query("tell me more", prior) == f"{prior}\ntell me more"
    assert build_retrieval_query("how does it work?", prior) == f"{prior}\nhow does it work?"


def test_clean_artifact_digest_strips_html_boilerplate():
    from backend.app.services.conversation_service import _clean_artifact_digest

    html_content = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>:root { --bg: #fff; } body { font-family: serif; } table { border: 1px; }</style>"
        "</head><body>"
        "<h1>Growth Model Dashboard</h1>"
        "<p>This dashboard tracks the core retention loops and channel-model fit for B2B SaaS.</p>"
        "</body></html>"
    )

    digest = _clean_artifact_digest(html_content, "html")
    assert "<style>" not in digest
    assert "--bg: #fff" not in digest
    assert "<head>" not in digest
    assert "Growth Model Dashboard" in digest
    assert "This dashboard tracks the core retention loops" in digest

    md_content = "# B2B Growth Strategy\n\nKey takeaways from the discussion."
    digest_md = _clean_artifact_digest(md_content, "markdown")
    assert digest_md == "# B2B Growth Strategy Key takeaways from the discussion."


def test_build_retrieval_query_includes_assistant_context_when_available():
    from backend.app.services.conversation_service import build_retrieval_query

    prior_user = "What frameworks exist for growth?"
    prior_assistant = "Elena Verna presents the product-led sales loop [E1] for B2B freemium models."

    # When query is anaphoric and prior_assistant is given, context includes assistant's framework title
    expanded = build_retrieval_query("tell me more about it", prior_user, prior_assistant)
    assert "Elena Verna presents the product-led sales loop" in expanded
    assert "[E1]" not in expanded  # Strips citation markers from query expansion
    assert "tell me more about it" in expanded


@pytest.mark.asyncio
async def test_process_message_stream_recovers_failed_status_with_rollback():
    """Adversarial test: when an operational failure occurs during processing,
    the service MUST roll back the aborted transaction, query the message,
    and safely commit status = 'failed' without crashing on inactive transaction."""
    from sqlalchemy.exc import SQLAlchemyError

    user_id = uuid.uuid4()
    session_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    session_obj = ChatSession(id=session_id, user_id=user_id, title="Test Chat")
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj

    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []

    # Mock assistant message re-query result after rollback
    mock_asst_msg = Message(
        id=uuid.uuid4(),
        session_id=session_id,
        role="assistant",
        status="pending",
    )
    mock_reselect_res = MagicMock()
    mock_reselect_res.scalar_one_or_none.return_value = mock_asst_msg

    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res, mock_reselect_res]

    # Simulate database retrieval failure
    mock_retrieval = AsyncMock()
    mock_retrieval.search.side_effect = SQLAlchemyError("Database connection lost")

    svc = ConversationService(retrieval_service=mock_retrieval)

    events = []
    async for event in svc.process_message_stream(
        db=mock_db,
        session_id=session_id,
        user_id=user_id,
        content="What is PLG?",
    ):
        events.append(event)

    # 1. db.rollback() must have been called to clear the aborted SQL transaction
    assert mock_db.rollback.called
    # 2. Assistant message must be transitioned to 'failed'
    added_asst = next(c.args[0] for c in mock_db.add.call_args_list if getattr(c.args[0], "role", None) == "assistant")
    assert added_asst.status == "failed"
    assert added_asst.error_code == "GENERATION_FAILED"
    # 3. Status must have been safely committed
    assert mock_db.commit.called
    # 4. Stream emitted the classified error envelope
    assert any(e["event"] == "error" for e in events)
    err_event = next(e for e in events if e["event"] == "error")
    assert err_event["data"]["error"]["code"] == "GENERATION_FAILED"


@pytest.mark.asyncio
async def test_process_message_stream_deduplicates_duplicate_chunks_in_message_sources():
    """Adversarial test: when multiple citations point to the same chunk ID
    or duplicate citations are emitted, MessageSource join table rows MUST be
    deduplicated on chunk_id so PrimaryKeyConstraint('message_id', 'chunk_id')
    is never violated, while preserving discrete citations in the response."""
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    shared_chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    session_obj = ChatSession(id=session_id, user_id=user_id, title="Test Chat")
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj

    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []

    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    # Two distinct evidence items pointing to the same underlying chunk
    ev1 = EvidenceItem(
        evidence_id="E1",
        chunk_id=shared_chunk_id,
        source_id=source_id,
        source_key="episodes/x/transcript.md",
        chunk_index=0,
        episode_title="Episode 1",
        guest="Elena",
        episode_url=None,
        publish_date=None,
        excerpt="Elena passage.",
        char_start=0,
        char_end=20,
        rrf_score=0.05,
        dense_rank=1,
        sparse_rank=1,
    )
    ev2 = EvidenceItem(
        evidence_id="E2",
        chunk_id=shared_chunk_id,
        source_id=source_id,
        source_key="episodes/x/transcript.md",
        chunk_index=0,
        episode_title="Episode 1",
        guest="Elena",
        episode_url=None,
        publish_date=None,
        excerpt="Elena passage.",
        char_start=21,
        char_end=40,
        rrf_score=0.04,
        dense_rank=2,
        sparse_rank=2,
    )
    mock_retrieval = AsyncMock()
    mock_retrieval.search.return_value = RetrievalResult(
        items=[ev1, ev2],
        insufficient_evidence=False,
        query="retention",
    )

    # Gateway returns citations referencing E1, E2, and duplicate E1
    mock_gateway = AsyncMock()
    mock_gateway.generate.return_value = GatewayGenerationResult(
        request_id="req-123",
        session_id=str(session_id),
        provider="local",
        model_id="qwen2.5:1.5b",
        raw_response=json.dumps({
            "mode": "research",
            "answer_markdown": "Retention findings [E1][E2].",
            "citations": [
                {"evidence_id": "E1", "supports": "First claim"},
                {"evidence_id": "E2", "supports": "Second claim"},
                {"evidence_id": "E1", "supports": "Duplicate claim"},
            ],
            "scope": "in_scope",
            "insufficient_evidence": False,
        }),
        latency_ms=25.0,
        usage={"prompt_tokens": 100, "completion_tokens": 50},
        stop_reason="stop",
    )

    svc = ConversationService(
        retrieval_service=mock_retrieval,
        gateway_client=mock_gateway,
    )

    events = []
    async for event in svc.process_message_stream(
        db=mock_db,
        session_id=session_id,
        user_id=user_id,
        content="How to improve retention?",
    ):
        events.append(event)

    completed_event = next(e for e in events if e["event"] == "completed")
    citations_emitted = completed_event["data"]["citations"]
    # Discrete evidence IDs E1 and E2 were both yielded
    assert [c["evidence_id"] for c in citations_emitted] == ["E1", "E2"]

    # Verify MessageSource instances added to db
    added_sources = [c.args[0] for c in mock_db.add.call_args_list if isinstance(c.args[0], MessageSource)]
    # Exactly ONE row inserted for shared_chunk_id, avoiding duplicate primary key violation!
    assert len(added_sources) == 1
    assert added_sources[0].chunk_id == shared_chunk_id
    assert added_sources[0].evidence_id == "E1"


@pytest.mark.asyncio
async def test_conversation_service_stream_essay_flow_stamps_metadata():
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    source_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    session_obj = ChatSession(id=session_id, user_id=user_id, title="Essay Chat")
    mock_sess_res = MagicMock()
    mock_sess_res.scalars.return_value.first.return_value = session_obj

    mock_hist_res = MagicMock()
    mock_hist_res.scalars.return_value.all.return_value = []
    mock_db.execute.side_effect = [mock_sess_res, mock_hist_res]

    mock_retrieval = AsyncMock()
    evidence_item = EvidenceItem(
        evidence_id="E1",
        chunk_id=chunk_id,
        source_id=source_id,
        source_key="episodes/elena-verna/transcript.md",
        chunk_index=0,
        episode_title="Elena Verna on PLG",
        guest="Elena Verna",
        episode_url="https://youtube.com/watch?v=123",
        publish_date="2023-05-01",
        excerpt="Product led growth begins with user value.",
        char_start=0,
        char_end=50,
        rrf_score=0.016,
        dense_rank=1,
        sparse_rank=1,
    )
    mock_retrieval.search.return_value = RetrievalResult(
        items=[evidence_item],
        insufficient_evidence=False,
        query="Write an essay on PLG",
    )

    essay_text = ("Product led growth transforms acquisition into retention [E1]. " + ("growth " * 1220)).strip()
    mock_gateway = AsyncMock()
    mock_gateway.generate.return_value = GatewayGenerationResult(
        request_id="req-essay",
        session_id=str(session_id),
        provider="local",
        model_id="qwen2.5:1.5b",
        raw_response=json.dumps({
            "title": "PLG Playbook",
            "essay_markdown": essay_text,
            "approximate_word_count": 1230,
            "writing_path": "analytical",
            "citations": [{"evidence_id": "E1", "supports": "PLG definition"}],
            "insufficient_evidence": False,
        }),
        latency_ms=300.0,
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
        content="Write an essay on PLG",
        mode="essay",
        provider="local",
    ):
        events.append(event)

    completed_event = next(e for e in events if e["event"] == "completed")
    msg_data = completed_event["data"]["message"]
    assert msg_data["status"] == "complete"
    assert "metadata" in msg_data
    metadata = msg_data["metadata"]
    assert metadata["skill"] == "ship-30-for-30@v1"
    assert metadata["writing_path"] == "analytical"
    assert "evidence_rrf_scores" in metadata




