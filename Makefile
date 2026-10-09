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

demo:
	$(DOCKER_COMPOSE) up -d
	@echo "All services running at http://localhost:5173"

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
	$(PYTHON) -m backend.app.ingestion.cli sync
	$(PYTHON) -m backend.app.ingestion.cli index

ingest-check:
	$(PYTHON) -m backend.app.ingestion.cli stats

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
