"""
Health Endpoints (IMPLEMENTATION_SPEC.md §6.2)
GET /api/v1/health/live  - Process alive
GET /api/v1/health/ready - Dependency readiness checks (DB, Ollama, Gateway)
"""

import time

import httpx
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.db.session import AsyncSessionLocal

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/live", summary="Liveness Probe")
async def live_check() -> dict:
    """Liveness probe: verifies process is alive without making deep external network calls."""
    return {
        "status": "ok",
        "service": "kestrel-api",
        "timestamp": time.time(),
    }


@router.get("/ready", summary="Readiness Probe")
async def ready_check() -> JSONResponse:
    """Readiness probe: verifies PostgreSQL (including migration state),
    then reports upstream provider health without blocking readiness."""
    components: dict[str, dict] = {}
    is_ready = True

    # 1. Database Check (PostgreSQL + pgvector + migration state per §11.3)
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1;"))
            # Verify the Alembic migration has actually been applied; a
            # bare SELECT 1 succeeds even on an empty schema.
            await session.execute(
                text("SELECT version_num FROM alembic_version LIMIT 1;")
            )
            components["database"] = {"status": "up", "type": "postgresql"}
    except Exception:  # noqa: BLE001
        # Redacted category only (spec §6.2: readiness must not leak secrets
        # or internal connection details).
        is_ready = False
        components["database"] = {
            "status": "down",
            "error": "database_unreachable_or_not_migrated",
        }

    # 2. Host Ollama Check (optional provider: does not block readiness)
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            ollama_res = await client.get(f"{settings.OLLAMA_BASE_URL}/api/version")
            if ollama_res.status_code == 200:
                components["ollama"] = {
                    "status": "up",
                    "version": ollama_res.json().get("version"),
                }
            else:
                components["ollama"] = {
                    "status": "degraded",
                    "code": ollama_res.status_code,
                }
    except Exception:  # noqa: BLE001
        components["ollama"] = {"status": "unreachable"}

    # 3. Agent Gateway Check (required for generation; reported, not fatal,
    # so the UI can surface provider guidance while the API stays inspectable)
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            gw_res = await client.get(f"{settings.AGENT_GATEWAY_URL}/health")
            if gw_res.status_code == 200:
                components["agent_gateway"] = {"status": "up"}
            else:
                components["agent_gateway"] = {
                    "status": "degraded",
                    "code": gw_res.status_code,
                }
    except Exception:  # noqa: BLE001
        components["agent_gateway"] = {"status": "unreachable"}

    status_code = (
        status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    )

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if is_ready else "not_ready",
            "components": components,
            "timestamp": time.time(),
        },
    )
