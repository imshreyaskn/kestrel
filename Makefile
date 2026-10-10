.PHONY: help dev demo test test-unit test-integration lint typecheck ingest ingest-check reindex stats benchmark down clean reset-demo-data

PYTHON ?= python
DOCKER_COMPOSE ?= docker compose

help:
	@echo "Lenny Growth Assistant (Kestrel) - Makefile"
	@echo "==========================================="
	@echo "  make dev          Start local dev services (Docker)"
	@echo "  make demo         One-command demo/bootstrap"
	@echo "  make test         Run all unit and integration tests"
	@echo "  make lint         Run ruff checks and formatting check"
	@echo "  make typecheck    Run mypy on backend and tests, tsc on frontend"
	@echo "  make ingest       Sync and index upstream podcast transcripts"
	@echo "  make ingest-check Show database knowledge base stats"
	@echo "  make reindex      Force full transcript re-index"
	@echo "  make benchmark    Run 20-case retrieval evaluation benchmark"
	@echo "  make down         Stop all running containers"
	@echo "  make clean        Clean build caches and artifacts"

dev:
	$(DOCKER_COMPOSE) up -d db agent-gateway
	@echo "Development services started."

dev-expose:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f compose.dev.yml up -d
	@echo "Services running with debug ports (db on 5433, gateway on 127.0.0.1:8010)."

demo:
	$(DOCKER_COMPOSE) up -d
	@echo "All services running at http://localhost:5173"
	@echo "Note: first boot applies Alembic migrations automatically inside the api container."
	@echo "Run 'make ingest' to load the transcript knowledge base."

migrate:
	$(DOCKER_COMPOSE) exec api alembic -c /app/alembic.ini upgrade head

test:
	$(PYTHON) -m pytest -v

test-unit:
	$(PYTHON) -m pytest tests/unit/ -v

test-integration:
	$(PYTHON) -m pytest tests/integration/ -v

lint:
	$(PYTHON) -m ruff check backend tests
	$(PYTHON) -m ruff format --check backend tests

typecheck:
	$(PYTHON) -m mypy backend tests
	cd frontend && npm run build

ingest:
	$(DOCKER_COMPOSE) exec api python -m backend.app.ingestion.cli sync
	$(DOCKER_COMPOSE) exec api python -m backend.app.ingestion.cli index

ingest-check:
	$(DOCKER_COMPOSE) exec api python -m backend.app.ingestion.cli stats

stats: ingest-check

reindex:
	$(PYTHON) -m backend.app.ingestion.cli reindex

benchmark:
	$(PYTHON) -m backend.app.ingestion.cli benchmark --fake-embed

down:
	$(DOCKER_COMPOSE) down

clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov frontend/dist

reset-demo-data:
	@echo "WARNING: Resetting all local database containers and volumes..."
	$(DOCKER_COMPOSE) down -v
