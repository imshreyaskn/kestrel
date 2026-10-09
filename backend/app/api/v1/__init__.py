"""
API v1 Router Registration (Codename: Kestrel)
"""

from fastapi import APIRouter

from backend.app.api.v1.artifacts import router as artifacts_router
from backend.app.api.v1.config import router as config_router
from backend.app.api.v1.growth_briefs import router as growth_briefs_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.providers import router as providers_router
from backend.app.api.v1.sessions import router as sessions_router
from backend.app.api.v1.sources import router as sources_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health_router)
api_v1_router.include_router(config_router)
api_v1_router.include_router(providers_router)
api_v1_router.include_router(sources_router)
api_v1_router.include_router(sessions_router)
api_v1_router.include_router(growth_briefs_router)
api_v1_router.include_router(artifacts_router)

__all__ = ["api_v1_router"]
