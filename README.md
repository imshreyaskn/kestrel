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

### The One-Command Bootstrap (Recommended)

Kestrel provides single-command bootstrap scripts conforming to IMPLEMENTATION_SPEC §13.2 that automate prerequisites checking, model readiness, environment configuration, database migrations, knowledge-base indexing, and browser launch:

**On Windows (PowerShell / Command Prompt):**
```powershell
.\start.ps1
# or from cmd:
start.bat
```

**On Linux / macOS / WSL (Bash):**
```bash
./start.sh
# or via Makefile:
make up
```

#### What the One-Command Script Does Automatically:
1. **Engine Check:** Verifies Docker Engine is running.
2. **Ollama Check:** Tests host Ollama connectivity at `http://localhost:11434`; pulls required models (`qwen2.5:1.5b` and `embeddinggemma`) if missing.
3. **Environment Init:** Copies `.env.example` to `.env` if missing and generates a cryptographically secure 32-byte `INTERNAL_SERVICE_TOKEN`.
4. **Topology Start:** Launches container services (`db`, `agent-gateway`, `api`, `frontend`).
5. **Database Migration:** Waits for `kestrel-db` healthy status and applies Alembic migrations to `head`.
6. **Knowledge Base Verification:** Checks indexed chunks; automatically syncs and indexes Lenny's Podcast transcripts if database is unseeded.
7. **Readiness Probe:** Polls `/api/v1/health/ready` until all components are operational.
8. **Studio Launch:** Opens [http://localhost:5173](http://localhost:5173) in your default browser.

---

### Manual Setup (Step-by-Step Alternative)

If you prefer step-by-step control:

#### Step 1: Configure Environment
```bash
cp .env.example .env
```

#### Step 2: Prepare Host Ollama Models (Local Mode)
```bash
ollama pull qwen2.5:1.5b
ollama pull embeddinggemma
```

#### Step 3: Launch with Docker Compose
```bash
docker compose up -d
```
Alembic migrations are applied automatically when the `api` container boots
(`alembic upgrade head` runs before `uvicorn`).

Services will start at:
- **Workbench Frontend:** [http://localhost:5173](http://localhost:5173)
- **FastAPI Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health & Readiness:** [http://localhost:8000/api/v1/health/ready](http://localhost:8000/api/v1/health/ready)

The PostgreSQL and agent-gateway services are **internal only** (no host
ports by default, per the implementation spec). For local debugging ports, run:
`docker compose -f docker-compose.yml -f compose.dev.yml up -d`.

#### Step 4: Ingest Transcript Knowledge Base (If unindexed)
```bash
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

---

## 7. Forward Deployed Engineer (FDE) Operational Handoff Guide

This system is engineered for zero-friction handoff to another engineering team to operate, test, troubleshoot, and extend.

### 7.1 One-Command Startup
- **Windows:** Run `.\start.ps1` (or `start.bat`).
- **macOS / Linux / CI:** Run `./start.sh` (or `make up` / `make demo`).
- The script checks host Docker and Ollama availability, pulls missing local models with real download feedback, copies `.env.example` with cryptographically secure tokens, starts Compose services, runs Alembic migrations, verifies knowledge base indexing, probes API readiness, and opens the studio UI.

### 7.2 Configuration & Secret Management
- **Safe Defaults:** [`.env.example`](file:///e:/Drizzle/Oogway/.env.example) contains safe local defaults pointing to internal container network names and host Ollama.
- **Zero Committed Secrets:** `.env` is strictly `.gitignore`'d. Provider API keys (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) stay server-side inside `agent-gateway` and are never embedded into frontend bundles or client responses.
- **Internal Service Authentication:** Communication between the FastAPI application core and the internal Node.js Agent Gateway is secured via a shared bearer token (`INTERNAL_SERVICE_TOKEN`).

### 7.3 Observability & Structured Diagnostics
- **Structured JSON Logging:** FastAPI emits machine-readable JSON logs via [`JsonLogFormatter`](file:///e:/Drizzle/Oogway/backend/app/main.py) with correlation IDs (`x-request-id`, `x-correlation-id`), duration in milliseconds, HTTP method/path, and status code.
- **Retrieval & Latency Metadata:** Assistant messages store detailed retrieval metrics in `metadata_`:
  - `evidence_rrf_scores`: Exact Reciprocal-Rank Fusion score for each retrieved candidate.
  - `gateway_latency_ms`: Generation latency in milliseconds from the Pi agent runtime.
  - `token_usage`: Prompt, completion, and total tokens reported by the model.
- **Live Health Diagnostics:**
  - `GET /api/v1/health/live`: Process liveness check.
  - `GET /api/v1/health/ready`: Deep dependency readiness check testing PostgreSQL connection, host Ollama version, and internal Agent Gateway reachability.
  - `GET /api/v1/ingestion/status`: Real-time knowledge base statistics (active sources, total indexed chunks, latest commit hash).

### 7.4 Resilience & Graceful Degradation
| Failure Scenario | How the System Handles It |
|:---|:---|
| **Missing Cloud API Key** | The router inspects configured keys before streaming; fails fast with safe 422 error and instructions to switch provider or configure key in `.env`. |
| **Unavailable / Offline Ollama** | Detected during startup script and readiness probe; UI Running Head indicators reflect status; fails fast with pre-classified safe error rather than hanging. |
| **Model Generation Timeout** | Enforces a strict 120-second timeout (`GENERATION_TIMEOUT_SECONDS`); cancels hanging tasks cleanly and returns `GENERATION_TIMEOUT` (504). |
| **Proxy Idle Disconnection** | The SSE streaming generator emits periodic `: ping\n\n` heartbeat comments every 15 seconds during model thinking silence to prevent reverse proxies (Nginx, Cloudflare) from dropping long-running streams. |
| **Empty Retrieval / Archive Gaps** | When evidence is insufficient, the system abstains with `insufficient_evidence: true`, displays a clear *"Not in archive"* banner, and never hallucinates facts or fake episode citations. |
| **Database Disconnection / Server Crash** | On startup, `reconcile_stale_pending_messages()` automatically sweeps messages stuck in `pending` and marks them as `failed` with code `SERVER_RESTARTED`. |
| **Concurrent Brief / Artifact Edits** | SQLAlchemy `version_id_col` enforces atomic optimistic locking; concurrent conflicting updates raise `StaleDataError` mapped to `HTTP 409 VERSION_CONFLICT`. |
| **Duplicate Message Submission** | Requests can pass `Idempotency-Key` or `X-Idempotency-Key` headers; replaying an identical key returns the cached completed turn rather than creating duplicate work. |

---

## 8. Knowledge Base & Transcript Persistence Lifecycle

### How Ingested Transcripts Survive Across Restarts
1. **Docker Named Volume Persistence:**
   - PostgreSQL stores all cluster data in a dedicated named volume (`postgres_data:/var/lib/postgresql/data`).
   - Named volumes exist independently of container lifecycles. Running `docker compose down`, rebuilding images, or restarting the Docker daemon does **not** erase the database. The 303 episodes and 16,964 chunks remain fully preserved on disk.
2. **PostgreSQL Relational & Vector Storage:**
   - Episode metadata is persisted in `transcript_sources` (`source_key`, `title`, `guest`, `episode_url`, `publish_date`, `content_hash`).
   - Verbatim text and 768-dimensional vectors are stored in `transcript_chunks` with an HNSW cosine index (`vector_cosine_ops`) for sub-millisecond retrieval.
3. **Idempotent Ingestion & Soft-Delete Citation Protection:**
   - When running `python -m backend.app.ingestion.cli index`, files are checked against stored MD5 `content_hash` values. Unchanged episodes are skipped in milliseconds.
   - If an episode's transcript is modified upstream, existing chunks are **soft-deactivated** (`is_active = FALSE`) instead of cascade-deleted. This guarantees that historical chat messages and saved Growth Briefs citing those chunks **never break** and continue to render their verbatim excerpts in margin sidenotes.
4. **Local Transcript Cache:**
   - Raw upstream transcripts are mirrored in `transcripts-cache/` on disk, allowing offline re-indexing without re-downloading from GitHub.
