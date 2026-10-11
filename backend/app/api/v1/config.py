"""
Configuration Introspection Endpoint (IMPLEMENTATION_SPEC.md §6.2)
GET /api/v1/config - UI-safe public configuration (no secrets)
(Provider status is served canonically by backend/app/api/v1/providers.py)
"""

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
