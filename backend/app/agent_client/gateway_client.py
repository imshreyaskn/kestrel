"""
Agent Gateway HTTP Client (Codename: Kestrel)
Communicates with the Node.js Pi Coding Agent SDK gateway per IMPLEMENTATION_SPEC.md §6.6.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import httpx

from backend.app.core.config import settings

logger = logging.getLogger("kestrel.gateway_client")


@dataclass
class GatewayGenerationResult:
    request_id: str
    session_id: str
    provider: str
    model_id: str
    raw_response: str
    latency_ms: float
    usage: dict[str, Any] | None = None


class AgentGatewayClient:
    """
    Typed HTTP client to communicate with the internal Pi Agent Gateway.
    Only FastAPI may invoke this service.
    """

    def __init__(
        self,
        base_url: str | None = None,
        internal_token: str | None = None,
        timeout: float | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = (base_url or settings.AGENT_GATEWAY_URL).rstrip("/")
        self.internal_token = internal_token or settings.INTERNAL_SERVICE_TOKEN
        self.timeout = timeout or float(settings.GENERATION_TIMEOUT_SECONDS)
        self._client = http_client

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        return httpx.AsyncClient(timeout=self.timeout)

    async def generate(
        self,
        session_id: str,
        current_user_message: str,
        mode: str,
        provider: str,
        model_id: str,
        conversation_context: Sequence[dict[str, str]],
        evidence: Sequence[Any],
        product_context: str | None = None,
        cloud_provider: str | None = None,
        request_id: str | None = None,
        system_prompt: str | None = None,
    ) -> GatewayGenerationResult:
        """
        Send a generation request to the Pi Agent Gateway.
        """
        req_id = request_id or str(uuid.uuid4())
        evidence_dicts: list[dict[str, Any]] = []

        for item in evidence:
            if isinstance(item, dict):
                evidence_dicts.append(item)
            else:
                evidence_dicts.append({
                    "evidence_id": getattr(item, "evidence_id", "E?"),
                    "chunk_id": str(getattr(item, "chunk_id", "")),
                    "source_id": str(getattr(item, "source_id", "")),
                    "guest": getattr(item, "guest", None),
                    "episode_title": getattr(item, "episode_title", None),
                    "excerpt": getattr(item, "excerpt", ""),
                    "supports": getattr(item, "supports", None),
                })

        context_list = [
            {"role": msg.get("role", "user"), "content": msg.get("content", "")}
            for msg in conversation_context
        ]

        payload = {
            "request_id": req_id,
            "session_id": session_id,
            "mode": mode,
            "provider": provider,
            "cloud_provider": cloud_provider or settings.DEFAULT_CLOUD_PROVIDER,
            "model_id": model_id,
            "conversation_context": context_list,
            "current_user_message": current_user_message,
            "evidence": evidence_dicts,
            "system_prompt": system_prompt,
            "product_context": product_context,
            "output_contract_version": "1.0",
        }

        headers = {
            "Content-Type": "application/json",
            "x-internal-service-token": self.internal_token,
            "x-request-id": req_id,
        }

        url = f"{self.base_url}/api/v1/generate"
        client = await self._get_client()

        try:
            # If self._client was passed externally, do not close it
            close_client = self._client is None
            try:
                response = await client.post(url, json=payload, headers=headers)
            finally:
                if close_client:
                    await client.aclose()

            if response.status_code == 403:
                raise PermissionError("Internal service token rejected by agent gateway")
            if response.status_code >= 400:
                err_body = response.text
                logger.error(f"Gateway error {response.status_code}: {err_body}")
                raise RuntimeError(f"Agent gateway returned status {response.status_code}: {err_body}")

            data = response.json()
            return GatewayGenerationResult(
                request_id=data.get("request_id", req_id),
                session_id=data.get("session_id", session_id),
                provider=data.get("provider", provider),
                model_id=data.get("model_id", model_id),
                raw_response=data.get("raw_response", ""),
                latency_ms=float(data.get("latency_ms", 0.0)),
                usage=data.get("usage"),
            )

        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error(f"Connection failure to agent gateway at {url}: {exc}")
            raise ConnectionError(f"Could not connect to agent gateway at {url}: {exc}") from exc


# Default global instance
default_gateway_client = AgentGatewayClient()
