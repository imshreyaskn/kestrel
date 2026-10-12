"""
FastAPI Application Baseline (Codename: Kestrel)
Conforming strictly to IMPLEMENTATION_SPEC.md §6 & §11
"""

import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.agent_client.gateway_client import default_agent_gateway_client
from backend.app.api.v1 import api_v1_router
from backend.app.core.config import settings
from backend.app.retrieval.embedder import get_embedding_provider


class JsonLogFormatter(logging.Formatter):
    """
    Structured JSON log formatter conforming to IMPLEMENTATION_SPEC.md §11.1.
    Safely serializes messages, exception tracebacks, and contextual metadata without
    f-string corruption on quotes, newlines, or escape sequences.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "extra_fields") and isinstance(record.extra_fields, dict):
            log_payload.update(record.extra_fields)
        return json.dumps(log_payload, ensure_ascii=False, default=str)


# Configure structured JSON logging
_handler = logging.StreamHandler()
_handler.setFormatter(JsonLogFormatter(datefmt="%Y-%m-%dT%H:%M:%S%z"))
_root_logger = logging.getLogger()
_root_logger.setLevel(getattr(logging, settings.APP_LOG_LEVEL.upper(), logging.INFO))
_root_logger.handlers.clear()
_root_logger.addHandler(_handler)

logger = logging.getLogger("kestrel.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager managing pooled HTTP connections and bootstrap verification.
    Conforms to spec §7.4 and architecture §6.
    """
    # 1. Startup: initialize shared pooled HTTP client for agent gateway with keep-alive limits
    limits = httpx.Limits(
        max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0
    )
    gateway_http = httpx.AsyncClient(
        timeout=float(settings.GENERATION_TIMEOUT_SECONDS),
        limits=limits,
    )
    app.state.gateway_http = gateway_http
    default_agent_gateway_client.set_http_client(gateway_http)

    # 2. Bootstrap verification: verify Ollama embedder availability (spec §7.4)
    embedder = get_embedding_provider()
    try:
        available = await embedder.verify_availability()
        if available:
            logger.info(
                "Ollama embedding model verified and ready",
                extra={"extra_fields": {"model": settings.OLLAMA_EMBEDDING_MODEL}},
            )
        else:
            logger.warning(
                "Ollama embedding model verification returned False; local embedding may fail if Ollama is not running",
                extra={"extra_fields": {"model": settings.OLLAMA_EMBEDDING_MODEL}},
            )
            if settings.APP_ENV == "production":
                raise RuntimeError(
                    f"Ollama embedding model {settings.OLLAMA_EMBEDDING_MODEL} unavailable; failing fast in production (spec §7.4)"
                )
    except Exception as exc:  # noqa: BLE001
        if settings.APP_ENV == "production":
            raise
        logger.warning(
            "Could not verify Ollama embedding availability on startup",
            extra={"extra_fields": {"error": str(exc)}},
        )

    # 3. Startup reconciliation: sweep stale pending messages from previous crashes (BA3)
    try:
        from backend.app.db.session import async_session_factory
        from backend.app.services.session_service import default_session_service

        async with async_session_factory() as db:
            reconciled = await default_session_service.reconcile_stale_pending_messages(db)
            if reconciled > 0:
                logger.info(
                    "Reconciled stale pending messages on startup",
                    extra={"extra_fields": {"reconciled_count": reconciled}},
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not reconcile stale pending messages on startup",
            extra={"extra_fields": {"error": str(exc)}},
        )

    yield

    # 4. Shutdown: clean up pooled HTTP client
    default_agent_gateway_client.set_http_client(None)
    await gateway_http.aclose()


app = FastAPI(
    title="The Lenny Growth Assistant (Kestrel)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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


# Request ID, Correlation ID, and Timing Middleware
@app.middleware("http")
async def request_id_and_timing_middleware(request: Request, call_next):
    req_id = (
        request.headers.get("x-request-id")
        or request.headers.get("x-correlation-id")
        or str(uuid.uuid4())
    )
    request.state.request_id = req_id
    request.state.correlation_id = req_id

    start_time = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000
        response.headers["x-request-id"] = req_id
        response.headers["x-correlation-id"] = req_id
        response.headers["x-response-time-ms"] = f"{duration_ms:.2f}"

        # Avoid spamming logs on health probes
        if not request.url.path.endswith("/health/live"):
            logger.info(
                "HTTP request completed",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "duration_ms": round(duration_ms, 2),
                        "request_id": req_id,
                    }
                },
            )
        return response
    except Exception as exc:  # noqa: BLE001
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            "HTTP request failed",
            exc_info=True,
            extra={
                "extra_fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "error": str(exc),
                    "duration_ms": round(duration_ms, 2),
                    "request_id": req_id,
                }
            },
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected server error occurred.",
                    "retryable": False,
                    "request_id": req_id,
                }
            },
            headers={"x-request-id": req_id, "x-correlation-id": req_id},
        )


# Standardized Exception Handlers (IMPLEMENTATION_SPEC §6.1)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    req_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    errors = exc.errors()
    first_msg = (
        errors[0].get("msg", "Validation error")
        if errors
        else "Invalid request parameters"
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": first_msg,
                "retryable": False,
                "request_id": req_id,
            }
        },
        headers={"x-request-id": req_id, "x-correlation-id": req_id},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    req_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    status_code_map = {
        400: ("BAD_REQUEST", False),
        401: ("UNAUTHORIZED", False),
        403: ("FORBIDDEN", False),
        404: ("NOT_FOUND", False),
        409: ("VERSION_CONFLICT", False),
        422: ("VALIDATION_ERROR", False),
        429: ("RATE_LIMITED", True),
        502: ("BAD_GATEWAY", True),
        503: ("SERVICE_UNAVAILABLE", True),
        504: ("GATEWAY_TIMEOUT", True),
    }
    default_code, default_retryable = status_code_map.get(
        exc.status_code, ("INTERNAL_SERVER_ERROR", False)
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": default_code,
                "message": str(exc.detail),
                "retryable": default_retryable,
                "request_id": req_id,
            }
        },
        headers={"x-request-id": req_id, "x-correlation-id": req_id},
    )


# Include API v1 Router
app.include_router(api_v1_router)

_PLACEHOLDER_TOKENS = {
    "replace-with-a-long-random-local-token",
    "replace-with-a-local-random-value",
}

if settings.INTERNAL_SERVICE_TOKEN in ("", *_PLACEHOLDER_TOKENS):
    logger.warning(
        "INTERNAL_SERVICE_TOKEN is unset or a known placeholder. "
        "The gateway now fails closed, so set a strong random value in .env "
        "before running the dockerized stack."
    )


@app.get("/", summary="Root Health Ping")
async def root_ping():
    return {
        "app": "The Lenny Growth Assistant (Kestrel)",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health/ready",
    }
