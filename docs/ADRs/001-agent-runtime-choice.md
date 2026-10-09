# ADR 001: Python-Native In-Process Agent Runtime (Claude Agent SDK)

## Status
**Accepted** (Codename: Kestrel)

## Context
The external assignment contract mandates:
> *"Agent layer uses either the Claude Agent SDK or Pi Coding Agent."*

The original candidate design proposed hosting the Pi Coding Agent SDK in a dedicated Node.js/TypeScript `agent-gateway` container to interface with local Ollama via OpenAI compatibility and cloud Anthropic.

However, introducing a secondary Node.js container adds substantial friction:
1. **Multi-language runtime complexity:** Requires maintaining Node/TypeScript toolchains, lockfiles, and container builds alongside Python.
2. **Network overhead & microservice sprawl:** Adds an internal HTTP hop, auxiliary service tokens, extra failure modes, and complicates Server-Sent Events (SSE) streaming back to the client.
3. **Violates simplicity principles:** [AGENTS.md](../../AGENTS.md) instructs:
   > *"Prefer the simplest architecture that meets the contract. No multi-agent orchestration, Redis, queues, extra vector database, microservices... unless a demonstrated requirement justifies it."*

## Decision
We standardize on the **Claude Agent SDK in pure Python**, running **in-process** directly within the FastAPI application (`backend/app/agent/`).

1. **Eliminate the Node.js Gateway:** The `agent-gateway/` directory and container service are removed.
2. **Topology:** Docker Compose is reduced to a lean, 3-service topology:
   - `db`: PostgreSQL 16 + pgvector
   - `api`: FastAPI (Python 3.12+) including in-process agent runtime, retrieval, and ingestion
   - `frontend`: React / TypeScript / Vite / Tailwind
3. **Provider Support:**
   - **Local Inference:** Direct Python HTTP integration with host Ollama (`http://host.docker.internal:11434`), supporting local models (e.g. `qwen3:4b`, `llama3.2`).
   - **Cloud Inference:** Native Anthropic API integration via Claude Agent SDK (`claude-sonnet-latest` / Claude 3.7).
4. **Architectural Guardrails:**
   - FastAPI retains authoritative ownership of session identity, PostgreSQL persistence, retrieval execution, citation mapping, and security boundaries.
   - The agent harness executes with read-only retrieval tools and bounded context. It does not have arbitrary filesystem, shell, or web access.

## Consequences

### Positive
- **Unified Language:** The entire backend, retrieval pipeline, database migrations, and agent orchestration are written in Python.
- **Simpler DevEx & Deployment:** One less container to build, run, and monitor.
- **Lower Latency:** Eliminates inter-process serialization overhead for SSE streaming.
- **Direct Testing:** Agent workflows and failure modes can be tested directly with `pytest` without mocking cross-container HTTP endpoints.
- **Contract Compliant:** Directly fulfills the assignment requirement to use the Claude Agent SDK.

### Risks and Mitigations
- **Risk:** Local small models (e.g. Qwen 4B) may occasionally output malformed structured JSON.
- **Mitigation:** FastAPI performs initial hybrid retrieval deterministically before calling the model, and wraps structured output extraction in Pydantic v2 schemas with a single bounded repair attempt before reporting insufficient evidence or validation errors.
