# ADR 001: Multi-Provider Agent Runtime via Pi Coding Agent SDK

## Status
**Accepted** (Codename: Kestrel)

## Context
The external assignment contract mandates:
> *"3.1 Agent integration: Build the agent layer using the Anthropic Claude Agent SDK or Pi Coding Agent."*
> *"3.2 Flexible LLM configuration: Create a configuration layer that allows the evaluator to switch the underlying model without changing application code: Cloud LLM (such as Anthropic Claude or OpenAI) and Local LLM (mandatory for demo via Ollama)."*

We evaluated two compliant approaches:
1. **Anthropic Claude Agent SDK:** Pure Python, but inherently vendor-locked to Anthropic. It does not natively support Google Gemini (which is our primary free developer API key) or local Ollama without brittle external translation proxies.
2. **Pi Coding Agent SDK (`https://pi.dev`):** Specifically architected for multi-model coding and tool-calling agents. It has native first-class support for:
   - **Google Gemini** (allowing zero-cost local development with free Gemini 2.0 / 1.5 Flash API keys)
   - **Ollama** (for the mandatory local offline demo)
   - **Anthropic Claude & OpenAI** (for external evaluators to test using their own keys)

## Decision
We standardize on the **Pi Coding Agent SDK** hosted within a lightweight Node.js/TypeScript gateway service (`agent-gateway/`), orchestrated deterministically by the FastAPI application.

1. **Architecture & Service Boundaries:**
   - **FastAPI (`backend/`):** Authoritative owner of session identity, PostgreSQL persistence, hybrid retrieval (pgvector + tsvector), citation mapping, and security boundaries.
   - **Pi Agent Gateway (`agent-gateway/`):** Thin execution runtime implementing the agent tool loop and multi-provider routing via the Pi SDK.
2. **Topology:** 4-service Docker Compose topology:
   - `db`: PostgreSQL 16 + pgvector
   - `api`: FastAPI (Python 3.12+)
   - `agent-gateway`: Node.js (Pi Coding Agent SDK runtime)
   - `frontend`: React / TypeScript / Vite / Tailwind
3. **Multi-Cloud & Local Provider Flexibility:**
   - **Gemini:** `GEMINI_API_KEY` (developer free tier)
   - **Ollama:** `OLLAMA_BASE_URL` (mandatory local demo)
   - **Claude:** `ANTHROPIC_API_KEY` (evaluator option)
   - **OpenAI:** `OPENAI_API_KEY` (evaluator option)
   Evaluator or developer can switch providers instantly in `.env` or via UI without touching code.

## Consequences

### Positive
- **100% Contract Compliance:** Formally fulfills the assignment requirement to integrate the Pi Coding Agent SDK (`https://pi.dev`).
- **Free Development:** Enables full development and end-to-end testing with Google Gemini's free tier.
- **Universal Provider Support:** Native switching between Gemini, Ollama, Claude, and OpenAI with zero code changes.
- **Clear Separation of Concerns:** Agent inference is decoupled from database storage and business logic.

### Mitigations for Dual-Runtime
- The gateway remains thin: zero direct database access, zero filesystem tools, and no independent state. All persistent data lives in PostgreSQL managed by FastAPI.
- Internal communication between FastAPI and the gateway uses typed JSON schemas and internal Docker networking.
