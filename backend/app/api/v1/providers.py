"""
Provider Status and Health Router (Codename: Kestrel)
Implements IMPLEMENTATION_SPEC.md §6.2: provider status checked with short timeouts.
Does NOT leak secrets and does NOT trigger implicit fallback switches.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter

from backend.app.core.config import settings

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("")
async def get_providers_status():
    """
    Check availability of local Ollama and configured cloud LLM providers.
    Uses short 1.5-second timeout to never block frontend UI.

    Spec §6.2: the response is public UI-safe config only — no internal
    base URLs, no raw exception text, no secrets.
    """
    # 1. Probe local Ollama
    local_status = "unavailable"
    local_error: str | None = None
    available_local_models: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                local_status = "ready"
                tags_data = resp.json()
                available_local_models = [
                    m.get("name", "")
                    for m in tags_data.get("models", [])
                    if m.get("name")
                ]
            else:
                local_error = f"Ollama returned HTTP {resp.status_code}"
    except Exception:  # noqa: BLE001
        # Redacted category only; the internal URL/exception stays in logs.
        local_error = "Ollama is unreachable on the host machine"

    # 2. Check cloud provider configuration
    cloud_provider = settings.DEFAULT_CLOUD_PROVIDER
    cloud_configured = False
    cloud_model = settings.GEMINI_MODEL

    if cloud_provider == "gemini":
        cloud_configured = bool(settings.GEMINI_API_KEY)
        cloud_model = settings.GEMINI_MODEL
    elif cloud_provider == "anthropic":
        cloud_configured = bool(settings.ANTHROPIC_API_KEY)
        cloud_model = settings.ANTHROPIC_MODEL
    elif cloud_provider == "openai":
        cloud_configured = bool(settings.OPENAI_API_KEY)
        cloud_model = settings.OPENAI_MODEL

    return {
        "local": {
            "status": local_status,
            "provider": "ollama",
            "model": settings.OLLAMA_CHAT_MODEL,
            "embedding_model": settings.OLLAMA_EMBEDDING_MODEL,
            "available_models": available_local_models,
            "error": local_error,
        },
        "cloud": {
            "status": "configured" if cloud_configured else "unconfigured",
            "provider": cloud_provider,
            "model": cloud_model,
            "configured": cloud_configured,
        },
        "default_provider": settings.DEFAULT_PROVIDER,
    }
