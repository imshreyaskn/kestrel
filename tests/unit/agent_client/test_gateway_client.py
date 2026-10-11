"""
Unit tests for internal Agent Gateway HTTP client (Codename: Kestrel)
"""

import httpx
import pytest

from backend.app.agent_client.gateway_client import AgentGatewayClient


@pytest.mark.asyncio
async def test_gateway_client_success():
    def mock_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-internal-service-token") == "test-token"
        assert request.url.path == "/api/v1/generate"
        return httpx.Response(
            200,
            json={
                "request_id": "req-123",
                "session_id": "sess-456",
                "provider": "local",
                "model_id": "qwen2.5:1.5b",
                "raw_response": '{"answer_markdown":"Test answer [E1]","citations":[{"evidence_id":"E1"}],"insufficient_evidence":false}',
                "latency_ms": 142.5,
            },
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = AgentGatewayClient(
            base_url="http://agent-gateway:8010",
            internal_token="test-token",
            http_client=http_client,
        )
        result = await client.generate(
            session_id="sess-456",
            current_user_message="How do we improve activation?",
            mode="research",
            provider="local",
            model_id="qwen2.5:1.5b",
            conversation_context=[],
            evidence=[{"evidence_id": "E1", "excerpt": "Focus on the aha moment."}],
            request_id="req-123",
        )

        assert result.request_id == "req-123"
        assert result.session_id == "sess-456"
        assert result.latency_ms == 142.5
        assert "[E1]" in result.raw_response


@pytest.mark.asyncio
async def test_gateway_client_forbidden_token():
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": "forbidden"})

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = AgentGatewayClient(
            base_url="http://agent-gateway:8010",
            internal_token="wrong-token",
            http_client=http_client,
        )
        with pytest.raises(PermissionError, match="rejected by agent gateway"):
            await client.generate(
                session_id="sess-456",
                current_user_message="Hello",
                mode="research",
                provider="local",
                model_id="qwen2.5:1.5b",
                conversation_context=[],
                evidence=[],
            )


@pytest.mark.asyncio
async def test_gateway_client_connection_error():
    def mock_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = AgentGatewayClient(
            base_url="http://agent-gateway:8010",
            internal_token="test-token",
            http_client=http_client,
        )
        with pytest.raises(ConnectionError, match="Could not connect to agent gateway"):
            await client.generate(
                session_id="sess-456",
                current_user_message="Hello",
                mode="research",
                provider="local",
                model_id="qwen2.5:1.5b",
                conversation_context=[],
                evidence=[],
            )


@pytest.mark.asyncio
async def test_gateway_client_typed_errors_and_stop_reason():
    from backend.app.agent_client.gateway_client import (
        GatewayConfigError,
        ModelNotAllowedError,
        PayloadTooLargeError,
    )

    # 1. 400 with missing_api_key -> GatewayConfigError
    def handler_400(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "missing_api_key"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_400)) as http_client:
        client = AgentGatewayClient(http_client=http_client)
        with pytest.raises(GatewayConfigError, match="Cloud provider API key is not configured"):
            await client.generate(
                session_id="sess-1",
                current_user_message="test",
                mode="research",
                provider="cloud",
                model_id="gemini-3.5-flash-lite",
                conversation_context=[],
                evidence=[],
            )

    # 2. 404 with model_not_found -> ModelNotAllowedError
    def handler_404(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model_not_found"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_404)) as http_client:
        client = AgentGatewayClient(http_client=http_client)
        with pytest.raises(ModelNotAllowedError, match="Gateway rejected model"):
            await client.generate(
                session_id="sess-1",
                current_user_message="test",
                mode="research",
                provider="cloud",
                model_id="unknown-model",
                conversation_context=[],
                evidence=[],
            )

    # 3. 413 -> PayloadTooLargeError
    def handler_413(request: httpx.Request) -> httpx.Response:
        return httpx.Response(413, json={"error": "payload_too_large"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_413)) as http_client:
        client = AgentGatewayClient(http_client=http_client)
        with pytest.raises(PayloadTooLargeError, match="Generation payload exceeded"):
            await client.generate(
                session_id="sess-1",
                current_user_message="test",
                mode="research",
                provider="cloud",
                model_id="gemini-3.5-flash-lite",
                conversation_context=[],
                evidence=[],
            )

    # 4. Stop reason parsed properly
    def handler_stop_reason(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "request_id": "req-1",
                "session_id": "sess-1",
                "provider": "local",
                "model_id": "qwen2.5:1.5b",
                "raw_response": "{}",
                "latency_ms": 10.0,
                "stop_reason": "length",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler_stop_reason)) as http_client:
        client = AgentGatewayClient(http_client=http_client)
        res = await client.generate(
            session_id="sess-1",
            current_user_message="test",
            mode="research",
            provider="local",
            model_id="qwen2.5:1.5b",
            conversation_context=[],
            evidence=[],
        )
        assert res.stop_reason == "length"

