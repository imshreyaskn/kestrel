# The Lenny Growth Assistant (Codename: Kestrel)

An evidence-first product and growth research workbench that synthesizes knowledge from **Lenny’s Podcast transcripts** into grounded decisions, structured Growth Briefs, Ship 30 essays, and sandboxed visual deliverables—with 100% source provenance.

---

## 1. Architecture Overview

Kestrel is built with a dual-service architecture designed for strict evidence provenance, multi-provider flexibility, and isolated artifact rendering:

```mermaid
flowchart TD
    subgraph Frontend ["Editorial Research Studio (React 18 + TypeScript + Vite)"]
        UI[Dossier Interface: Frontmatter, Manuscript & Marginalia]
        PV[Sandboxed Plate Viewer: iframe sandbox + CSP]
    end

    subgraph Backend ["FastAPI Application Core (Python 3.13)"]
        Router[REST & SSE Endpoints: /sessions, /sources, /briefs, /artifacts]
        ConvSvc[Conversation Service & SSE Stage Generator]
        Hybrid[Hybrid Retrieval: pgvector Dense + tsvector Sparse FTS]
        Validator[Schema & Citation Hallucination Pruner]
        Sanitizer[nh3 HTML Sanitizer & CSP Meta Injector]
    end

    subgraph Gateway ["Agent Gateway Service (Node.js 22 Container)"]
        PiCore[@earendil-works/pi-ai Runtime & Model Provider Registry]
    end

    subgraph Database ["PostgreSQL 16 + pgvector"]
        PG[(Tables: users, chat_sessions, messages, sources, chunks, briefs, artifacts)]
    end

    subgraph Inference ["Inference Providers"]
        Ollama[Host Ollama: qwen2.5:1.5b / embeddinggemma]
        Cloud[Google Gemini 2.0 Flash / Anthropic Claude / OpenAI]
    end

    UI -->|REST & SSE Events| Router
    Router --> ConvSvc
    ConvSvc --> Hybrid
    Hybrid -->|Cosine + TSVECTOR @@ FTS| PG
    ConvSvc -->|Internal HTTP| PiCore
    PiCore -->|Local Offline| Ollama
    PiCore -->|Cloud Key| Cloud
    ConvSvc --> Validator
    ConvSvc --> Sanitizer
    ConvSvc --> PG
    PV -.->|Isolated Preview| UI
```

- **FastAPI Backend (`backend/`):** Authoritative owner of session identity, PostgreSQL persistence, hybrid retrieval (`pgvector` + `tsvector`), citation verification, and security boundaries.
- **Pi Agent Gateway (`agent-gateway/`):** Execution runtime implementing multi-provider generation via the **Pi Coding Agent SDK (`@earendil-works/pi-ai`)** in Node.js 22.
- **Workbench Frontend (`frontend/`):** Editorial Research Studio (Dossier) visual language, conversation stream, and side-by-side artifact preview in isolated sandboxed iframes.
- **PostgreSQL 16 with pgvector:** Single persistent store of truth for sessions, transcript chunks, embeddings, briefs, and artifacts.

---

## 2. Quickstart & One-Command Startup

### Prerequisites
- [Docker & Docker Desktop](https://www.docker.com/) (recommended) OR Python 3.12+, Node.js 20+, and PostgreSQL 16.
- [Ollama](https://ollama.com/) running on the host machine for local offline inference.

### Step 1: Clone and Configure Environment
```bash
git clone https://github.com/imshreyaskn/kestrel.git
cd kestrel
cp .env.example .env
```

If using cloud inference, configure your API key in `.env`:
```ini
# Optional Cloud Provider
GEMINI_API_KEY=your_gemini_api_key_here
```

### Step 2: Prepare Host Ollama Models (Local Mode)
Pull the required local chat and embedding models:
```bash
ollama pull qwen2.5:1.5b
ollama pull embeddinggemma
```

### Step 3: Launch with Docker Compose
```bash
docker compose up --build -d
```
Alembic migrations are applied automatically when the `api` container boots
(`alembic upgrade head` runs before `uvicorn`), so a fresh clone starts with
a fully migrated schema.

Services will start at:
- **Workbench Frontend:** [http://localhost:5173](http://localhost:5173)
- **FastAPI Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)

The PostgreSQL and agent-gateway services are **internal only** (no host
ports by default, per the implementation spec). Gateway health is visible
through the API readiness probe at
[http://localhost:8000/api/v1/health/ready](http://localhost:8000/api/v1/health/ready).
For local debugging ports, run:
`docker compose -f docker-compose.yml -f compose.dev.yml up -d`.

### Step 4: Ingest Transcript Knowledge Base (First Run)
To sync and ingest transcripts into PostgreSQL with 768-dim embeddings:
```bash
# Run ingestion inside the running API container
docker compose exec api python -m backend.app.ingestion.cli sync
docker compose exec api python -m backend.app.ingestion.cli index
```
*(Ingestion is content-hash idempotent; unchanged files are skipped on subsequent runs).*

---

## 3. Key Capabilities & Deliverables

### 1. Grounded Research Mode & Margin Sidenotes
- Ask questions across growth, activation, retention, pricing, and product-market fit.
- Answers are structured with Roman numeral sections (`I.`, `II.`).
- Every claim cites a request-scoped marker (`[1]`, `[2]`). Sidenotes in the right margin render verbatim transcript passages from stored PostgreSQL chunks (`transcript_chunks.content`), linked with dynamic SVG leader lines.
- **Zero Hallucinated Citations:** If an LLM emits a tag `[E99]` not present in the retrieved evidence, the backend automatically prunes it before persistence.

### 2. The Fold — Growth Brief Deliverable
- Switch mode to `Brief` or click **The Fold** in the Running Head.
- Produces a 7-section executive deliverable: *Problem Framing*, *Grounded Research Insights*, *Strategic Recommendation*, *Assumptions*, *Controlled Growth Experiment* (Hypothesis, Change, Audience, Primary Metric, Guardrails, Decision Rule), and *Next Deliverable*.
- Readers can edit sections directly; clicking **Bind impression** persists updates to PostgreSQL with **optimistic concurrency checks** (detecting version conflicts with HTTP 409).

### 3. Ship 30 for 30 Atomic Essays
- Powered by a dynamic runtime skill (`runtime-skills/ship-30-for-30/SKILL.md`).
- Generates a single-thesis digital essay targeting **~1,250 words** (accepted first-draft range 1,150–1,350 per the skill contract) with a strong hook, varied rhythm, and grounded citations.
- **Word-count gate:** essays outside the accepted range are rejected by the backend validator (`ESSAY_LENGTH_OUT_OF_RANGE`) rather than persisted. Local small models frequently undershoot the target; switch to a cloud provider for essay-length synthesis.

### 4. Plate Viewer & Sandboxed HTML Preview
- Switch mode to `Plate` to generate HTML/CSS deliverables (e.g. experiment one-pagers).
- Rendered exclusively inside `<iframe sandbox="">` with **no** `allow-scripts`, `allow-same-origin`, `allow-forms`, or `allow-popups`.
- Enforces strict Content Security Policy (CSP):
  `default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`.
- Includes live toggle between **Preview** and **Source Code**, plus one-click **Copy** and **Download**.

### 5. Insufficient Evidence Detection
- If a question outruns the podcast archive (e.g., specific quantitative SaaS conversion averages across the entire industry), the system does not invent figures.
- Displays a dedicated *"Not in the archive"* notice explaining the corpus limitation and suggesting actionable alternative queries.

---

## 4. Engineering Quality Gates & Verification

Quality gates re-verified during the 2026-10-10 hardening audit (real commands, real containers):

```powershell
# 1. Lint checks (Ruff, incl. format check)
python -m ruff check backend tests
# Output: All checks passed!

# 2. Static type checking (Mypy)
python -m mypy backend tests
# Output: Success: no issues found in 70 source files

# 3. Frontend production build (TypeScript + Vite)
npm run build --prefix frontend
# Output: built in 2.16s with 0 errors

# 4. Full test suite (Pytest)
python -m pytest
# Output: 125 passed in 27.72s (integration suite additionally: 7 passed live)

# 5. Gateway type check (inside the Node 22 container)
docker compose run --rm --no-deps agent-gateway npx tsc --noEmit
# Output: clean exit, no type errors
```

Live end-to-end rehearsal evidence (2026-10-10, real stack, real models):
- **Local mode:** grounded research answer generated by host Ollama `qwen2.5:1.5b` through the full pipeline with a validated citation (verbatim chunk excerpt from PostgreSQL + canonical episode URL).
- **Cloud mode:** grounded answer via Google `gemini-3.5-flash-lite` (model availability verified against the live Generative Language API).
- **Abstention:** an out-of-corpus benchmark question returned `insufficient_evidence: true` with **zero** gateway generation calls (verified via gateway logs).
- **Ingestion idempotency:** second `index` run: `discovered 303, skipped 303, created 0, failed 0` in 2.65s.
- **Contract gates:** bogus `model_id` → 422; null byte in content → 422; `artifact_format` mismatch → 422; session rename `PATCH` → 200.

Detailed verification transcripts are preserved in [`agent-transcripts/`](file:///e:/Drizzle/Oogway/agent-transcripts/) (see especially `010-phase-3-audit-remediation.md`).

---

## 5. Repository Layout

```
.
├── agent-gateway/           # Pi Agent Gateway (Node.js 22 container + @earendil-works/pi-ai)
├── agent-transcripts/       # Genuine empirical verification evidence & audit logs
├── backend/
│   ├── app/
│   │   ├── agent_client/    # Prompts, gateway client, validator, skill loader
│   │   ├── api/v1/          # FastAPI routers (/sessions, /sources, /briefs, /artifacts, /providers)
│   │   ├── core/            # Settings, JSON extractor, logging
│   │   ├── db/              # SQLAlchemy async session & engine
│   │   ├── ingestion/       # Parser, chunker, syncer, indexer, CLI
│   │   ├── models/          # SQLAlchemy ORM entities & constraints
│   │   ├── retrieval/       # Hybrid search (pgvector + tsvector), RRF fusion, embedder
│   │   ├── security/        # nh3 HTML sanitizer & CSP builder
│   │   └── services/        # Session, Conversation, Growth Brief, Artifact services
│   └── migrations/          # Alembic database migrations
├── docs/
│   ├── architecture.md      # Dual-service architecture, ERD, and failure modes
│   ├── design.md            # Editorial Research Studio design tokens & layout
│   ├── manual-test-plan.md  # Step-by-step evaluator testing guide
│   ├── PRD.md               # Product Requirements Document & traceability matrix
│   └── evaluation/          # 20-case retrieval benchmark fixtures
├── frontend/                # Editorial Research Studio (React 18 + TypeScript + Vite)
├── runtime-skills/          # Modular agent skills (ship-30-for-30)
├── docker-compose.yml       # Production Compose topology
└── pytest.ini               # Pytest configuration
```

---

## 6. Trade-offs & Known Boundaries

1. **Local Model Capacity vs. Latency:**
   - Defaulting to `qwen2.5:1.5b` ensures the application runs smoothly on any laptop with $\ge 4\text{ GB}$ VRAM or CPU without crashing.
   - For complex multi-section reasoning or nuanced synthesis, switching to Google Gemini or Claude via the Running Head yields superior prose fluency.
2. **HTML Sandbox Restrictions:**
   - The preview iframe enforces `sandbox=""` and `script-src 'none'`. This deliberately prevents interactive JavaScript execution (charts, calculators) in v1 to ensure strict zero-XSS safety. Visual deliverables rely entirely on responsive HTML and scoped inline CSS.
3. **Single-User Demo Scope:**
   - The system is configured for local evaluation with a seeded demo user (`DEMO_USER_ID`). Enterprise multi-tenant authentication and team workspaces are planned for v2.
