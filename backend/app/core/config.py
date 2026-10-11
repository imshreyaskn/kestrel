"""
Application Settings & Configuration
Loaded from environment variables with fallback to local development defaults.
"""

from __future__ import annotations

from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    APP_LOG_LEVEL: str = "INFO"
    APP_BASE_URL: str = "http://localhost:5173"
    API_PORT: int = 8000
    AGENT_GATEWAY_PORT: int = 8010

    # Database (PostgreSQL + pgvector)
    DATABASE_URL: str = (
        "postgresql+asyncpg://lenny:lenny_dev_only@localhost:5433/lenny_growth"
    )
    DEMO_USER_ID: str = "00000000-0000-4000-8000-000000000001"

    # Agent Gateway (Pi Coding Agent SDK)
    AGENT_GATEWAY_URL: str = "http://localhost:8010"
    INTERNAL_SERVICE_TOKEN: str = "replace-with-a-long-random-local-token"

    # Provider Configuration
    DEFAULT_PROVIDER: Literal["local", "cloud"] = "local"
    DEFAULT_CLOUD_PROVIDER: Literal["gemini", "anthropic", "openai"] = "gemini"

    # Cloud Providers (catalog-verified against the installed pi-ai Google
    # provider data; gemini-3.8-flash is the production workhorse default,
    # gemini-3.5-flash-lite the high-efficiency tier)
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    ANTHROPIC_API_KEY: str | None = None
    # Catalog-verified against the installed @earendil-works/pi-ai provider
    # data (claude-sonnet-latest is not present in the catalog; pinned ID
    # verified on 2026-10-10 inside the gateway container).
    ANTHROPIC_MODEL: str = "claude-sonnet-5"

    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o"

    # Host Ollama Configuration
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_CHAT_MODEL: str = "qwen2.5:1.5b"
    OLLAMA_EMBEDDING_MODEL: str = "embeddinggemma"
    EMBEDDING_DIMENSIONS: int = 768

    # Retrieval & Guardrails
    RETRIEVAL_TOP_K: int = 8
    RETRIEVAL_MIN_SCORE: float = 0.25
    RETRIEVAL_WEAK_DENSE: float = 0.32
    MAX_CONTEXT_MESSAGES: int = 12
    HISTORY_TOKEN_BUDGET_LOCAL: int = 4000
    HISTORY_TOKEN_BUDGET_CLOUD: int = 20000
    GENERATION_TIMEOUT_SECONDS: int = 120

    @model_validator(mode="after")
    def _validate_config(self) -> Settings:
        # If env vars pass empty strings, fallback to default canonical model IDs
        self.GEMINI_MODEL = self.GEMINI_MODEL or "gemini-3.5-flash-lite"
        self.ANTHROPIC_MODEL = self.ANTHROPIC_MODEL or "claude-sonnet-5"
        self.OPENAI_MODEL = self.OPENAI_MODEL or "gpt-4o"

        # Reject default placeholder token in non-development environments
        if (
            self.APP_ENV != "development"
            and self.INTERNAL_SERVICE_TOKEN == "replace-with-a-long-random-local-token"
        ):
            raise ValueError(
                "INTERNAL_SERVICE_TOKEN must be changed from the default placeholder in production/staging."
            )
        return self


settings = Settings()
