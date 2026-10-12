#!/usr/bin/env bash
# =============================================================================
# Lenny Growth Assistant (Codename: Kestrel) - One-Command Startup Script
# Conforms strictly to IMPLEMENTATION_SPEC.md §13.2.
# =============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}==> $1${NC}"; }
success() { echo -e "    ${GREEN}✓ $1${NC}"; }
warn() { echo -e "    ${YELLOW}⚠ $1${NC}"; }
fatal() { echo -e "\n${RED}[FATAL] $1${NC}" >&2; exit 1; }

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  Lenny Growth Assistant (Codename: Kestrel) - One-Command Bootstrap   ${NC}"
echo -e "${CYAN}========================================================================${NC}"

# 1. Verify Docker Engine
step "Checking Docker Engine..."
if ! command -v docker &>/dev/null; then
    fatal "Docker is not installed or not in PATH."
fi
if ! docker info &>/dev/null; then
    fatal "Docker daemon is not running. Please start Docker and retry."
fi
success "Docker is active and running."

# 2. Check Ollama
step "Checking host Ollama (http://localhost:11434)..."
OLLAMA_ONLINE=0
if curl -s -f -m 3 http://localhost:11434/api/tags &>/dev/null; then
    OLLAMA_ONLINE=1
    success "Host Ollama is online."
else
    warn "Host Ollama not detected at http://localhost:11434. Local inference will be unavailable until started."
fi

# 3. Environment configuration (.env)
step "Configuring environment (.env)..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        success "Created .env from .env.example."
    else
        fatal ".env.example not found."
    fi
fi

# Ensure INTERNAL_SERVICE_TOKEN is set
if ! grep -q "^INTERNAL_SERVICE_TOKEN=" .env || grep -q "INTERNAL_SERVICE_TOKEN=dev-internal-token-change-me" .env; then
    TOKEN=$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | head -c 64)
    if grep -q "^INTERNAL_SERVICE_TOKEN=" .env; then
        sed -i.bak "s/^INTERNAL_SERVICE_TOKEN=.*/INTERNAL_SERVICE_TOKEN=${TOKEN}/" .env && rm -f .env.bak
    else
        echo -e "\nINTERNAL_SERVICE_TOKEN=${TOKEN}" >> .env
    fi
    success "Generated secure INTERNAL_SERVICE_TOKEN."
fi

# 4. Launch containers
step "Starting container services (db, agent-gateway, api, frontend)..."
docker compose up -d
success "Containers started."

# 5. Wait for Database & Migrations
step "Waiting for PostgreSQL database health..."
DB_HEALTHY=0
for i in {1..30}; do
    STATUS=$(docker inspect --format='{{json .State.Health.Status}}' kestrel-db 2>/dev/null || echo '""')
    if [ "$STATUS" = '"healthy"' ]; then
        DB_HEALTHY=1
        break
    fi
    sleep 1
done

if [ "$DB_HEALTHY" -ne 1 ]; then
    fatal "Database failed to become healthy within 30 seconds."
fi
success "Database is healthy."

step "Applying database migrations (Alembic)..."
docker compose exec -T api alembic -c /app/alembic.ini upgrade head
success "Migrations applied to head."

# 6. Check API readiness
step "Verifying API readiness (http://localhost:8000/api/v1/health/ready)..."
API_READY=0
for i in {1..30}; do
    if curl -s -f http://localhost:8000/api/v1/health/ready 2>/dev/null | grep -q '"status":"ready"'; then
        API_READY=1
        break
    fi
    sleep 1
done

if [ "$API_READY" -ne 1 ]; then
    fatal "API failed readiness check within 30 seconds."
fi
success "API is ready."

# 7. Check knowledge base
step "Checking transcript knowledge base..."
CHUNKS=$(curl -s http://localhost:8000/api/v1/ingestion/status 2>/dev/null | grep -o '"total_chunks":[0-9]*' | cut -d: -f2 || echo "0")
if [ "${CHUNKS:-0}" -eq "0" ]; then
    warn "Knowledge base is empty. Syncing and indexing Lenny Podcast transcripts..."
    docker compose exec -T api python -m backend.app.ingestion.cli sync
    docker compose exec -T api python -m backend.app.ingestion.cli index
    success "Knowledge base indexed."
else
    success "Knowledge base ready (${CHUNKS} chunks indexed across 303 episodes)."
fi
    fatal "API failed readiness check within 30 seconds."
fi
success "API is ready."

echo -e "\n${GREEN}========================================================================${NC}"
echo -e "${GREEN}  ✓ APPLICATION ONLINE - EDITORIAL RESEARCH STUDIO IS READY            ${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo -e "  Studio Web UI:         ${CYAN}http://localhost:5173${NC}"
echo -e "  Backend API Service:   ${CYAN}http://localhost:8000${NC}"
echo -e "  OpenAPI Documentation: ${CYAN}http://localhost:8000/docs${NC}"
echo -e "${GREEN}========================================================================${NC}"
