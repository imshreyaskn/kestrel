# The Lenny Growth Assistant (Codename: Kestrel)

An evidence-first product and growth workbench that turns knowledge from **Lenny's Podcast transcripts** into grounded decisions, structured Growth Briefs, Ship 30 essays, and rendered deliverables.

---

## Architecture Overview

Kestrel is built with a dual-service architecture designed for strict provenance, source citation, and multi-provider flexibility:

- **FastAPI Backend (`backend/`):** Authoritative owner of session identity, PostgreSQL persistence, hybrid retrieval (`pgvector` + `tsvector`), citation verification, and security boundaries. (Python 3.12+).
- **Pi Agent Gateway (`agent-gateway/`):** Thin execution runtime implementing multi-provider agentic generation via the **Pi Coding Agent SDK (`@earendil-works/pi-ai`)** in Node.js 22.
- **Workbench Frontend (`frontend/`):** Editorial Research Studio visual language, conversation stream, side-by-side artifact preview in isolated sandboxed iframe. (React / TypeScript / Vite).
- **PostgreSQL 16 with pgvector:** Single persistent source of truth.

---

## Runtime & Engine Constraints

> [!IMPORTANT]
> **Host Node vs Container Node Constraint:**
> The Pi Coding Agent SDK (`@earendil-works/pi-ai`) strictly requires **Node.js >= 22.19.0**.
> - On developer machines where the host Node version is `< 22` (e.g. host Node v20), the Agent Gateway **must be executed inside its Docker container** (`kestrel-agent-gateway`).
> - The gateway Dockerfile builds on `node:22-bookworm-slim` and is orchestrated via Docker Compose.
> - Do not run `npm start` directly on the host if host Node is `< 22`.

---

## Models & Inference Setup

Kestrel supports zero-code switching between local offline models and cloud inference:

1. **Local Offline Inference (Mandatory for Demo):**
   - **Chat Generation:** `qwen2.5:1.5b` via Host Ollama (`http://host.docker.internal:11434`).
   - **Semantic Embeddings:** `embeddinggemma` generating strictly **768 dimensions** (aligned with `vector(768)` in PostgreSQL).
2. **Cloud Inference:**
   - **Google Gemini:** `gemini-2.0-flash` / `gemini-2.5-flash` via `GEMINI_API_KEY` (developer free tier).
   - **Anthropic Claude:** `claude-sonnet-latest` via `ANTHROPIC_API_KEY`.
   - **OpenAI:** `gpt-4o` via `OPENAI_API_KEY`.

---

## Verification & Testing

### Running Tests
Ensure the Python virtual environment is activated:

```powershell
# Run full unit and integration test suite
pytest -v

# Run only unit tests
pytest tests/unit -v

# Run integration tests (requires Host Ollama and Agent Gateway container)
pytest tests/integration -v

# Run static type checking
python -m mypy backend tests
```

### Running the Agent Gateway Spike in Docker
```powershell
# Build gateway container
docker build -t kestrel-agent-gateway ./agent-gateway

# Run the live Pi AI verification spike inside the Node 22 container
docker run --rm --add-host=host.docker.internal:host-gateway kestrel-agent-gateway npm run spike
```

---

## Project Status

- **Phase 0 (Reconnaissance & Architecture Spike):** ✅ **PASSED & EMPIRICALLY VERIFIED**
  - Host Ollama verified (`embeddinggemma` 768-dim, `qwen2.5:1.5b` chat).
  - Agent Gateway powered by `@earendil-works/pi-ai` in Node 22 verified.
  - Robust JSON extractor tested with nested markdown code fences and conversational prose.
  - 13/13 automated tests passing in `pytest`.
- **Phase 1 (Foundation):** Next in progress.
