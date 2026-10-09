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
