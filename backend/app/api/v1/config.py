"""
Configuration and Provider Introspection Endpoints (IMPLEMENTATION_SPEC.md §6.2)
GET /api/v1/config    - UI-safe public configuration (no secrets)
GET /api/v1/providers - Live availability of local & cloud providers
"""

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from backend.app.core.config import settings

router = APIRouter(tags=["Config & Providers"])


class UIConfigResponse(BaseModel):
    app_env: str
    default_provider: str
    default_cloud_provider: str
    local_chat_model: str
    local_embedding_model: str
    embedding_dimensions: int
    cloud_models: dict[str, str]
    cloud_enabled: dict[str, bool]


@router.get(
    "/config", response_model=UIConfigResponse, summary="Public UI Configuration"
)
async def get_ui_config() -> UIConfigResponse:
    """Return public, UI-safe configuration values only. Never exposes secrets or internal URLs."""
    return UIConfigResponse(
        app_env=settings.APP_ENV,
        default_provider=settings.DEFAULT_PROVIDER,
        default_cloud_provider=settings.DEFAULT_CLOUD_PROVIDER,
        local_chat_model=settings.OLLAMA_CHAT_MODEL,
        local_embedding_model=settings.OLLAMA_EMBEDDING_MODEL,
        embedding_dimensions=settings.EMBEDDING_DIMENSIONS,
        cloud_models={
            "gemini": settings.GEMINI_MODEL,
            "anthropic": settings.ANTHROPIC_MODEL,
            "openai": settings.OPENAI_MODEL,
        },
        cloud_enabled={
            "gemini": bool(settings.GEMINI_API_KEY),
            "anthropic": bool(settings.ANTHROPIC_API_KEY),
            "openai": bool(settings.OPENAI_API_KEY),
        },
    )


@router.get("/providers", summary="Provider Live Status")
async def get_providers_status() -> dict:
    """Check live status of providers with short timeouts without blocking the UI."""
    status_map: dict[str, dict] = {}

    # 1. Local Ollama Check
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            res = await client.get(f"{settings.OLLAMA_BASE_URL}/api/version")
            status_map["local"] = {
                "provider": "ollama",
                "available": res.status_code == 200,
                "version": res.json().get("version")
                if res.status_code == 200
                else None,
                "model": settings.OLLAMA_CHAT_MODEL,
            }
    except Exception as e:  # noqa: BLE001
        status_map["local"] = {
            "provider": "ollama",
            "available": False,
            "error": str(e),
            "model": settings.OLLAMA_CHAT_MODEL,
        }

    # 2. Cloud Providers Check
    status_map["cloud"] = {
        "configured_provider": settings.DEFAULT_CLOUD_PROVIDER,
        "gemini": {
            "configured": bool(settings.GEMINI_API_KEY),
            "model": settings.GEMINI_MODEL,
        },
        "anthropic": {
            "configured": bool(settings.ANTHROPIC_API_KEY),
            "model": settings.ANTHROPIC_MODEL,
        },
        "openai": {
            "configured": bool(settings.OPENAI_API_KEY),
            "model": settings.OPENAI_MODEL,
        },
    }

    return status_map
