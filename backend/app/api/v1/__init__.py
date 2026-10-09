from fastapi import APIRouter

from backend.app.api.v1.config import router as config_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.sources import router as sources_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health_router)
api_v1_router.include_router(config_router)
api_v1_router.include_router(sources_router)

__all__ = ["api_v1_router"]
