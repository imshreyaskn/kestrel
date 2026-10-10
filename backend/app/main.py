"""
FastAPI Application Baseline (Codename: Kestrel)
Conforming strictly to IMPLEMENTATION_SPEC.md §6 & §11
"""

import logging
import time
import uuid

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

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
                f'{{"method":"{request.method}","path":"{request.url.path}","status":{response.status_code},"duration_ms":{duration_ms:.2f},"request_id":"{req_id}"}}'
            )
        return response
    except Exception as exc:  # noqa: BLE001
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            f'{{"method":"{request.method}","path":"{request.url.path}","error":"{exc!s}","duration_ms":{duration_ms:.2f},"request_id":"{req_id}"}}'
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
