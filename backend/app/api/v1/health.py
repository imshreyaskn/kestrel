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
    """Readiness probe: verifies PostgreSQL database and upstream providers."""
    components: dict[str, dict] = {}
    is_ready = True

    # 1. Database Check (PostgreSQL + pgvector)
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1;"))
            components["database"] = {"status": "up", "type": "postgresql"}
    except Exception as e:  # noqa: BLE001
        is_ready = False
        components["database"] = {"status": "down", "error": str(e)}

    # 2. Host Ollama Check
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            ollama_res = await client.get(f"{settings.OLLAMA_BASE_URL}/api/version")
            if ollama_res.status_code == 200:
                components["ollama"] = {"status": "up", "version": ollama_res.json().get("version")}
            else:
                components["ollama"] = {"status": "degraded", "code": ollama_res.status_code}
    except Exception as e:  # noqa: BLE001
        components["ollama"] = {"status": "unreachable", "error": str(e)}

    # 3. Agent Gateway Check
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            gw_res = await client.get(f"{settings.AGENT_GATEWAY_URL}/health")
            if gw_res.status_code == 200:
                components["agent_gateway"] = {"status": "up", "details": gw_res.json()}
            else:
                components["agent_gateway"] = {"status": "degraded", "code": gw_res.status_code}
    except Exception as e:  # noqa: BLE001
        components["agent_gateway"] = {"status": "unreachable", "error": str(e)}

    status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if is_ready else "not_ready",
            "components": components,
            "timestamp": time.time(),
        },
    )
