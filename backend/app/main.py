"""
FastAPI Application Baseline (Codename: Kestrel)
Conforming strictly to IMPLEMENTATION_SPEC.md §6 & §11
"""

import logging
import time
import uuid

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.v1 import api_v1_router
from backend.app.core.config import settings

# Configure basic structured logging
logging.basicConfig(
    level=getattr(logging, settings.APP_LOG_LEVEL.upper(), logging.INFO),
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("kestrel.app")

app = FastAPI(
    title="The Lenny Growth Assistant (Kestrel)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
origins = [
    settings.APP_BASE_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Correlation ID and Request Timing Middleware
@app.middleware("http")
async def correlation_id_and_timing_middleware(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    request.state.correlation_id = correlation_id

    start_time = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000
        response.headers["x-correlation-id"] = correlation_id
        response.headers["x-response-time-ms"] = f"{duration_ms:.2f}"

        # Avoid spamming logs on health probes
        if not request.url.path.endswith("/health/live"):
            logger.info(
                f'{{"method":"{request.method}","path":"{request.url.path}","status":{response.status_code},"duration_ms":{duration_ms:.2f},"correlation_id":"{correlation_id}"}}'
            )
        return response
    except Exception as exc:  # noqa: BLE001
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            f'{{"method":"{request.method}","path":"{request.url.path}","error":"{exc!s}","duration_ms":{duration_ms:.2f},"correlation_id":"{correlation_id}"}}'
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_server_error",
                    "message": "An unexpected server error occurred.",
                    "correlation_id": correlation_id,
                }
            },
            headers={"x-correlation-id": correlation_id},
        )


# Include API v1 Router
app.include_router(api_v1_router)


@app.get("/", summary="Root Health Ping")
async def root_ping():
    return {
        "app": "The Lenny Growth Assistant (Kestrel)",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health/ready",
    }
