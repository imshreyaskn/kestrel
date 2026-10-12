# Backend Architecture, Process Flow & Functionality Audit — "Clean · Coherent · State of the Art?"

**Target:** github.com/imshreyaskn/kestrel @ `0881858` — `backend/` (FastAPI, 39 modules), `agent-gateway/`, migrations, ingestion pipeline, tooling
**Method:** full read of all backend modules + migrations + Makefile/tooling; spec-conformance cross-check (IMPLEMENTATION_SPEC.md §5-§12); web research for current best practice per functionality (sources cited inline); over/under-engineering judgment against the repo's own AGENTS.md doctrine ("simplest architecture that meets the contract").
**Companion reports:** `kestrel-harness-audit.md` (agent harness), `design-implementation-audit.md` (frontend). Cross-referenced findings keep their original IDs (G1-G8, B1-B7, D2-D3).

---

## 0. Verdict

**The skeleton is genuinely clean and coherent — better than most production FastAPI codebases at this scale. The gaps are at the joints: transaction boundaries, provenance durability, index infrastructure, and a handful of documented-but-dead contracts.**

- **Layering: A−.** Consistent API → Service → Model flow, typed Pydantic boundaries at the edges, ownership checks on every user-data path, one error-envelope discipline (§6.1) applied nearly everywhere. No circular imports found; module responsibilities match `docs/architecture.md`, which is itself honest about what is *not* verified ("Anthropic and OpenAI routing … has not been live-verified") — rare and commendable.
- **Coherence: B.** Four real integrity breaks: re-ingestion silently destroys citation history (BA1), documented `make` commands cannot work on the default deployment (BA4), a shadowed duplicate route leaks raw exceptions (G3/BA12), and ORM metadata doesn't know about DB CHECK constraints (BA10c). Plus config truth spread across four sources (G6).
- **State of the art: B−.** Stack choices are current and correct (Python 3.13, FastAPI, SQLAlchemy 2.0 async, Pydantic v2, pgvector, nh3 — the sanitizer bleach's users are told to migrate to). But several functionalities sit one well-known step below SOTA: no ANN index (sequential scan), hand-rolled optimistic locking instead of SQLAlchemy's built-in `version_id_col`, hand-rolled SSE without heartbeat instead of sse-starlette, f-string-interpolated "JSON" logs instead of a real structured logger, per-request httpx clients instead of a pooled lifespan-managed client, and no lockfile despite the repo's own rule demanding one.
- **Over-engineering: minimal.** The codebase is mostly *under*-engineered at the edges and slightly *dead*-engineered in the middle (unused contract fields, shadowed routers, a fallback prompt for a can't-happen case). The one genuinely justified "extra" layer — `json_extractor.py` — exists because the default 1.5B model can't hold the output contract; it retires naturally when structured outputs land (harness report F1 + BA-13).

Scorecard: **22 findings — 4×S2, 11×S3, 7×S4.** Nothing found requires re-architecting; every fix lands inside the existing layer structure.

---

## 1. Architecture map & layering

```
Browser ──HTTP/SSE──▶ FastAPI (backend/app)
                       ├─ api/v1/*        routers: validation, auth stub, envelopes      [thin ✓]
                       ├─ services/*      orchestration + domain logic                   [mostly thin ✓]
                       │    └─ conversation_service  (the pipeline: context→retrieval→
                       │       draft→validate→repair?→persist→SSE)
                       ├─ agent_client/*  gateway HTTP client, prompts, validator, skills [✓]
                       ├─ retrieval/*     hybrid search, embedder, benchmark             [✓]
                       ├─ ingestion/*     syncer→parser→chunker→embedder→indexer (CLI)   [✓]
                       ├─ security/*      nh3 sanitizer + CSP preview builder            [✓]
                       └─ models/db/core  SQLAlchemy 2.0 entities, async engine, config  [✓]
FastAPI ──internal token──▶ agent-gateway (Express+zod+pi-ai) ──▶ Ollama / Gemini / Anthropic / OpenAI
FastAPI ──asyncpg──▶ PostgreSQL 16 + pgvector (tsvector GIN ✓, ANN index ✗ BA2)
```

**What's right (keep):** routers do no business logic; services own transactions (mostly — see BA3); retrieval is deterministic and server-owned per spec §6.6; the gateway is a thin provider adapter with a fail-closed token gate (`timingSafeEqual` ✓); ingestion is a separate CLI world that never touches request paths; `docs/architecture.md` matches the tree.

**Where behavior leaks across layers:**
1. Persona/schema defined twice (backend `prompts.py` vs gateway `fallbackSystemPrompt`) — harness A3.
2. Error *semantics* flatten at the gateway boundary: the gateway knows `model_not_found` vs `missing_api_key` vs 413; the client collapses all 4xx into one retryable `RuntimeError` — G2.
3. `api/v1/config.py` contains a *second* providers-status implementation (route-shadowing `providers.py`) — G3/BA12.
4. CHECK constraints live only in migrations, not in ORM `__table_args__` — the schema has two sources of truth (BA10c).
5. `services/*` mix patterns: `SessionService`/`GrowthBriefService`/`ArtifactService` are static-method classes committing internally, while `ConversationService` is an instantiated orchestrator that *also* commits — transaction ownership is ambiguous by design (BA3).

---

## 2. Process-flow audit (the message pipeline, end to end)

Walkthrough of `POST /sessions/{id}/messages` (stream path), with integrity verdicts per stage:

| Stage | Behavior | Verdict |
|---|---|---|
| 1. Validate | Pydantic: bounded content (1-10k), mode/provider enums, control-char rejection, allowlist pre-check → 422 fast-fail | ✅ strong (gaps: whitespace-only C3; no idempotency key BA15) |
| 2. Persist pair | user msg + pending assistant msg, `+1µs` ordering hack, committed **before** generation | ✅ correct: user turn survives generation failure; assistant failure states are typed (`failed`/`cancelled` + `error_code`) |
| 3. Context load | last 12 complete msgs, desc→reverse, current pair excluded (no duplication) | ✅ correct ordering; ❌ no token budget (B1/G4), stale `[E#]` markers replayed (B2) |
| 4. Retrieve | embed query (batched, retry+backoff ✓), dense (min-score cutoff) + sparse (GIN ✓), RRF k=60 w/ 0.6/0.4, per-source cap 3, request-scoped E-labels | ✅ architecture is the industry-standard hybrid pattern; ❌ no ANN index (BA2), no near-dupe removal (B5), binary sufficiency (B4), context-blind query (B3) |
| 5. Abstain gate | `len(items)==0` → canned string, model never called | ❌ A1 (harness) — contradicts companion product thesis |
| 6. Draft | gateway call **outside** any DB transaction | ✅ correct (no long-held tx during LLM call — a classic mistake avoided) |
| 7. Validate | extract JSON → per-mode validation → citation-ID pruning → one typed repair | ✅ bounded, no loops; ❌ repair narrative wrong for non-JSON failures (D2), `stop_reason` discarded (D3), inline labels unvalidated (E1) |
| 8. Persist | brief/artifact services **commit internally mid-stage**, then message_sources + title + content commit at stage end | ❌ **BA3**: two-phase save. Crash between commits ⇒ orphaned brief/artifact + assistant row stuck `pending` forever. No startup sweep reconciles stale pendings |
| 9. Stream out | hand-rolled SSE: `run_started`/`stage`/`completed`/`error`; `X-Accel-Buffering: no` ✓; `GeneratorExit` → `cancelled` ✓ | ✅ disconnect semantics are genuinely well done; ❌ **BA6**: zero bytes during the drafting stage (up to `GENERATION_TIMEOUT_SECONDS=120s` silence) — proxies/LBs with idle timeouts will drop the stream; no heartbeat |
| Error path | typed classification → redacted envelope → server-side `logger.exception` | ✅ envelope discipline; ❌ retryability lies for config errors (G2); ❌ logs are f-string JSON (BA9) |

**Concurrency:** two simultaneous submits to one session both pass (no locking, interleaved history, both persist). Acceptable for the single-user demo (`DEMO_USER_ID` stub is documented); must be listed as a known limitation for multi-user. Cancellation: the 0.3s disconnect-poll around the gateway call is pragmatic and correct; true provider-side cancellation is documented as a limitation in architecture.md — honest ✓.

---

## 3. Functionality-by-functionality: quality + state-of-the-art comparison

### 3.1 Retrieval (hybrid search)
**Current:** two SQL round-trips (pgvector cosine + `websearch_to_tsquery`/`ts_rank_cd` on a stored `search_vector` GIN column), Python-side weighted RRF (k=60, 0.6/0.4), per-source diversity, deterministic E-labeling, provenance-honest metadata (RRF scores not mislabeled as semantic scores — spec §5.6 ✓).

**SOTA check:** this *is* the industry-standard pattern — tsvector + pgvector fused with RRF is exactly what the canonical references prescribe ([1](https://jkatz.github.io/post/postgres/hybrid-search-postgres-pgvector/), [2](https://medium.com/@aysebilgegunduz/all-you-need-to-know-about-pgvector-part-4-hybrid-search-8a655d3b0087)). No over-engineering: skipping cross-encoder reranking and external vector DBs matches both the spec's non-goals and the "simplest architecture" rule.

**Gaps vs current best practice:**
- **No ANN index — BA2 (S2).** Neither migration creates HNSW or IVFFlat on `embedding`; dense retrieval is an exact sequential scan (`ORDER BY embedding <=> …`). Fine at 10k chunks; degrades linearly and is simply not how pgvector is deployed in 2026 — HNSW is the default recommendation for query performance ([4](https://github.com/pgvector/pgvector)). Fix:

```python
# backend/migrations/versions/0005_add_hnsw_index.py
op.execute(
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_transcript_chunks_embedding_hnsw "
    "ON transcript_chunks USING hnsw (embedding vector_cosine_ops) "
    "WITH (m = 16, ef_construction = 64)"
)
# NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction:
# alembic env needs `with context.autocommit_block():` around it (or accept a lock at this corpus size).
```
- **Filtered-ANN caveat:** the query joins `ts.is_active = TRUE`; with HNSW, post-filtering can under-return k. pgvector ≥0.8's **iterative index scans** exist precisely for this ("For more rows, enable iterative index scans, which will automatically scan more of the index until it finds enough rows that match the filter" — [4](https://github.com/pgvector/pgvector); tuning tradeoffs in [3](https://www.crunchydata.com/blog/hybrid-vector-search)). The `pgvector/pgvector:pg16` image ships a current extension; set `SET hnsw.iterative_scan = relaxed_order` on the retrieval connection (or per-query) once the index exists.
- **Fusion in Python vs SQL CTE:** two round-trips + in-memory merge is fine at this scale and keeps the RRF unit-testable (`compute_rrf_fusion` is a pure function — good design). Single-CTE SQL fusion is the common one-query recipe ([1](https://jkatz.github.io/post/postgres/hybrid-search-postgres-pgvector/)) but would *reduce* testability. **Verdict: keep Python fusion — consciously not-SOTA-shaped, correctly so.** (Anti-over-engineering note: don't "fix" this.)
- `ts_rank_cd` vs BM25 (`pg_search`/ParadeDB): tsvector is the standard, dependency-free choice; BM25 is an optional future upgrade, not a gap.
- Calibration: `RETRIEVAL_MIN_SCORE=0.25` and binary sufficiency are untuned against the 20-case fixture that exists for exactly this purpose (spec §7.5: "Do not treat one arbitrary similarity score threshold as a universal truth") — B4, plus BA4's benchmark-target problem below.

### 3.2 Ingestion pipeline
**Current:** syncer (shallow git clone → `--ff-only` pull → tarball fallback with **PEP 706 `filter="data"`** ✓), parser (frontmatter + regex fallbacks, never drops body), chunker (paragraph-aware, 350-550 tok target, 60-100 overlap, char offsets, SHA-256), embedder (batched, retry/backoff, dimension assert), indexer (content-hash idempotency, per-file savepoint isolation + rollback, embeddings computed **outside** the DB transaction, wipeout guard before deactivating sources, counts reported).

**Verdict: this is the highest-quality subsystem in the repo.** Idempotency, failure isolation, and the anti-wipeout guard are exactly right; spec §7.2 compliance is near-complete.

**The one real flaw — BA1 (S2): re-ingesting a changed transcript destroys citation history.** The update path does `DELETE FROM transcript_chunks WHERE source_id=…` and reinserts; `message_sources.chunk_id → transcript_chunks.id ON DELETE CASCADE` (entities.py:253) ⇒ every historical citation to that episode's chunks is **silently deleted**, and `get_session_messages` resolves excerpts through that join, so old answers lose their margin notes. Spec §7.2: "do not silently delete citation history referenced by old messages." The inactive-source path complies (deactivate, keep chunks); the *changed*-source path doesn't. Fix (structural, one migration + small service change): **soft-deactivate chunks instead of deleting** —

```python
# migration 0005: add flag + partial index
op.add_column("transcript_chunks", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
op.execute("CREATE INDEX ix_transcript_chunks_active ON transcript_chunks (source_id) WHERE is_active = TRUE")

# indexer._index_single_file — replace delete+insert:
await session.execute(
    update(TranscriptChunk)
    .where(TranscriptChunk.source_id == source_id)
    .values(is_active=False)
)
# insert new chunks with is_active=True; retrieval SQL gains `AND tc.is_active = TRUE`
```
Provenance becomes permanent (old citations still resolve to the exact text they supported), storage grows only on changed episodes, and retrieval semantics are unchanged. Alternative (snapshot `excerpt` into `message_sources` + `ON DELETE SET NULL`) is cheaper but freezes stale text and weakens the "read from stored chunk" principle (§5.6) — recommend soft-delete.

**Smaller:** `verify_availability()` is defined (embedder.py:75) but **called nowhere** — spec §7.4 requires a bootstrap embedding assertion; there is no lifespan hook at all (BA8). The tarball fallback's `else: tar.extractall(path)` unsafe branch (syncer.py) is dead on Python 3.13 — delete it rather than keep a dangerous dead path (BA19). `make reindex`/`make benchmark` run **host** Python against a database the default compose topology doesn't publish (BA4, §3.9).

### 3.3 Persistence & data model
**Current:** SQLAlchemy 2.0 declarative + `Mapped[]` typing throughout, asyncpg, `pool_pre_ping`, Alembic hand-written migrations with pre-validated constraint additions (0004 rewrites legacy values *before* adding CHECKs, with an actionable-error comment — genuinely careful migration craft), unique `(source_id, chunk_index)` ✓, timezone-aware timestamps ✓, JSONB for flexible payloads ✓.

**Gaps:**
- **BA10c (S3):** CHECK constraints (`messages.role/status`, `growth_briefs.status`, `artifacts.kind`) exist only in migrations — `entities.py` declares no `CheckConstraint`s in `__table_args__`. Any `create_all()`-based test database silently lacks them; ORM and DB disagree. Declare them on the models so metadata is the single source of truth (alembic autogenerate then stays coherent).
- **BA16 (S4):** three "legacy compatibility" duplicate columns (`mode`/`workflow_mode`, `provider`/`provider_preference`, `full_name`) — the codebase carries two names for one concept everywhere (`Message` even sets both). Nothing in the repo consumes the legacy names; pick one, migrate, delete. This is debt, not over-engineering, but it doubles the surface of every query and response.
- **BA17 (S4):** the `+1µs` timestamp hack exists because `get_session_messages` tie-breaks on `id.asc()` — a random UUID, which does **not** guarantee user-before-assistant order for same-microsecond rows. The hack works but a `BIGSERIAL seq` column (or `Identity`) is the state-of-the-art ordering primitive and deletes the hack.
- **Optimistic locking — BA5 (S3):** briefs/artifacts implement `expected_version` as check-then-set (`if brief.version != expected: raise`), which races under concurrency (two writers both read v1, both pass, last-write-wins). SQLAlchemy has this built in: `version_id_col` stamps the version into the UPDATE's WHERE clause and raises `StaleDataError` on a lost race ([1](http://docs.sqlalchemy.org/en/latest/orm/versioning.html), [3](https://oneuptime.com/blog/post/2026-01-25-optimistic-locking-sqlalchemy/view)). Fix:

```python
# entities.py — GrowthBrief & Artifact
version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
__mapper_args__ = {"version_id_col": version}

# services: keep the expected_version API check (client coordination), but wrap the flush:
from sqlalchemy.orm.exc import StaleDataError
try:
    await db.commit()
except StaleDataError as exc:
    await db.rollback()
    raise ValueError(f"Version conflict on {brief_id}") from exc   # API already maps to 409
```
- **BA10a (S3):** `UpdateGrowthBriefRequest.data: dict[str, Any]` — PATCH accepts *any* JSON shape into the typed brief contract (§5.7/§8.3 five-section structure). Creation goes through validated models; updates bypass them entirely. Define `GrowthBriefData(BaseModel)` (problem/research_summary/recommendation/assumptions/experiment/risks/next_deliverable) and validate on PATCH (partial updates: `model_copy(update=…)` over the stored payload, then `model_validate` the result).

### 3.4 API layer
**Current:** consistent envelope errors (§6.1), request-ID middleware propagating to the gateway (`x-request-id` ✓ both hops), control-char rejection, ownership enforcement everywhere user data is touched, demo-auth stub documented as such, SSE with proper `no-cache`/`X-Accel-Buffering`.

**Gaps:** duplicate `/providers` route with the leaky winner (G3/BA12 — delete `config.py`'s handler, keep the redaction-aware `providers.py`); oldest-page pagination (BA14/G7); no idempotency on `POST …/messages` (BA15 — a client retry after a 504 duplicates the user turn; SOTA is an optional `Idempotency-Key` header or client-supplied message UUID with a unique constraint — cheap: `UNIQUE (session_id, client_message_id)`); untyped `dict` returns on `/config`/`/providers` while every other endpoint has response models (consistency nit); `GET /sources/{id}` & `/chunks/{id}` carry no user dependency (corpus data, defensible for demo — document it).

**SSE — BA6 (S3):** hand-rolled `f"event: …\ndata: …\n\n"` is correct but silent for the whole drafting stage (up to 120s). The production-standard library for exactly this stack is sse-starlette — "Production ready Server-Sent Events implementation for Starlette and FastAPI following the W3C SSE specification", with built-in periodic pings sized against proxy idle timeouts ([2](https://github.com/sysid/sse-starlette)). Minimal fix without a dependency: emit `": heartbeat\n\n"` comments every 15s from a parallel task during the gateway call (comment lines are ignored by EventSource clients). Recommended: adopt sse-starlette and delete the manual framing.

### 3.5 Gateway client & provider layer
**Current:** typed dataclass result, fail-closed internal token, timeout/connect error mapping to typed exceptions, model allowlist enforced twice (backend + gateway), no silent provider substitution (spec §3.2 ✓ — "never silently substitute" comments match behavior).

**Gaps:**
- **BA7 (S3):** `httpx.AsyncClient` is constructed and closed **per request** when not injected (`_get_client`/`close_client` logic) — no connection pooling, fresh TCP+TLS per generation. SOTA: one lifespan-managed client with `limits=httpx.Limits(max_keepalive_connections=…)`:

```python
# main.py
from contextlib import asynccontextmanager
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.gateway_http = httpx.AsyncClient(timeout=settings.GENERATION_TIMEOUT_SECONDS)
    yield
    await app.state.gateway_http.aclose()
# AgentGatewayClient receives it via constructor injection (the seam already exists: `http_client` param)
```
- `stop_reason`/`usage`/`latency_ms` returned by the gateway, discarded by the client (D3 + BA18) — wire `usage` into `assistant_message.metadata_` (observability for free; §11.1 wants token metadata logged, not prompt bodies).
- 4xx flattening (G2) — typed mapping snippet in the harness report.
- **BA13 correction (affects harness B1/F1):** Ollama's OpenAI-compatible endpoints have **no documented context-size parameter** — official docs direct you to a Modelfile `PARAMETER num_ctx` ([2](https://docs.ollama.com/api/openai-compatibility); same in [1](https://github.com/ollama/ollama/issues/2677)). The guaranteed local-path fixes are host `OLLAMA_CONTEXT_LENGTH` or a pinned Modelfile. Notably, the **native** `/api/chat` documents both `options` (num_ctx etc.) and `format: "json" or a JSON schema` ([2](https://docs.ollama.com/api/chat)) — i.e., Ollama ships native structured output. For the constrained-decoding wave (harness F1), the local path can bypass pi-ai's completions adapter for a small native-API client, or use a Modelfile; Gemini has native response schemas; this is the cleanest route to retiring the extractor patch-stack.

### 3.6 Security
**Current:** nh3 allowlist sanitization + CSP preview builder + sandboxed iframe contract — nh3 is precisely the modern choice (Rust/ammonia binding, ~20× faster than bleach, which is deprecated; actively released through 2026 — [2](https://github.com/messense/nh3), [3](https://pypi.org/project/nh3/)). Timing-safe token compare, fail-closed gateway auth, parameterized SQL everywhere (including `websearch_to_tsquery` with bound params), PEP 706 tar filter, redaction discipline at the API boundary, no secrets in compose (env passthrough), loopback-only port publishing.

**Gaps:** the `str(e)` leak in the shadowing `/providers` handler (BA12); the published default `INTERNAL_SERVICE_TOKEN` placeholder (G8); unsafe-branch tar fallback dead code (BA19); `sources`/`chunks` endpoints unauthenticated (documented-demo acceptable). **Verdict: security posture is coherent and current — this layer needs cleanup, not redesign.**

### 3.7 Observability
**Current:** request/correlation IDs end-to-end (middleware → gateway header → structured gateway log line ✓), stage-level SSE telemetry, server-side-only exception detail, log-noise suppression on liveness probes, "counts not content" logging policy honored (gateway logs method/path/status/duration only ✓).

**Gap — BA9 (S3):** the "JSON" logging is f-string interpolation into a JSON-shaped format string:

```python
format='{"timestamp":"%(asctime)s", … ,"message":"%(message)s"}'      # main.py basicConfig
logger.info(f'{{"method":"{request.method}", … ,"error":"{exc!s}", …}}')  # middleware
```

Any message containing `"`, `\n`, or `\` (exception text routinely does) emits **invalid JSON** — the exact failure §11.1's "Use JSON logs" exists to prevent, and log pipelines choke on it. SOTA for this stack is structlog (or python-json-logger) with contextvars-bound `request_id` — the standard recipe in current FastAPI observability guides ([1](https://oneuptime.com/blog/post/2026-02-02-fastapi-structured-logging/view), [2](https://apitally.io/blog/fastapi-logging-guide)). Minimal fix: `python-json-logger`'s formatter (one dependency, zero call-site changes — proper escaping everywhere); better: structlog with `request_id` bound in the middleware so per-line interpolation disappears.

### 3.8 Configuration & dependencies
**Current:** pydantic-settings with `.env` support ✓, typed Literal enums ✓, allowlist-derived model resolution ✓.

**Gaps:** four disagreeing config sources incl. the catalog-invalid compose default (G1 — verified against pi-ai's real anthropic catalog: `claude-sonnet-latest` absent, `claude-sonnet-5` present; G6); gateway receives `*_MODEL` envs it never reads; **no lockfile** — `requirements.txt` mixes a range (`fastapi>=0.115.0,<=0.136.3`) with exact pins, and AGENTS.md mandates "pinned with lockfiles". SOTA in 2026 Python: `uv` with `uv.lock` (or pip-tools hashes) — one `uv lock` fixes reproducibility and the range/pin mixture; keep `requirements.txt` as an export if desired.

### 3.9 Developer tooling & process coherence
**Current:** Makefile covers the spec §7.2 command contract (`ingest`/`ingest-check`/`reindex` names match ✓), ruff + mypy + pytest configured, 126 test functions across unit/integration/evaluation with real negative-path coverage (cancellation, allowlist, hallucinated-citation pruning, control chars), integration tests honestly opt-in.

**Gaps — BA4 (S2, coherence):** `make ingest`/`ingest-check` run via `docker compose exec api`, but `make reindex` and `make benchmark` run **host** `$(PYTHON)`: (a) on the default topology the DB port isn't published, so both fail with a connection error; (b) `make benchmark` passes `--fake-embed` — deterministic hash embeddings queried against a **real** embeddinggemma index produce meaningless dense rankings, so the headline "Mean Recall@5" it prints is misleading exactly where spec §7.7 sets the ≥80% gate. Fix: `reindex` → `$(DOCKER_COMPOSE) exec api python -m backend.app.ingestion.cli index --force`; split `benchmark` (real embedder, live Ollama required) from `benchmark-ci` (fake embedder **and** fake-embedded index, documented as CI-only).
Also: mypy is invoked by `make typecheck` but absent from `requirements-dev.txt`?? — it *is* present (`mypy==2.3.0` ✓ — verified); no mypy.ini/pyproject config found, so it runs with defaults (acceptable; consider `--strict` ratchet). No repair-path tests (harness D2). No route-duplication guard test (BA12 fix includes one).

---

## 4. Over-engineering inventory (AGENTS.md: "simplest architecture that meets the contract")

| Item | Verdict |
|---|---|
| `RetrievalResult(Sequence[EvidenceItem])` subclass | Borderline-justified: keeps call sites list-like while adding metadata. Simpler: plain dataclass + `.items`. **Keep** — churn isn't free |
| Python-side RRF fusion | **Correctly not** collapsed into SQL — unit-testable pure function. Keep |
| `json_extractor.py` heuristic stack | Over-engineered *relative to a constrained-decoding world*, necessary in the current one (their transcript 001 documents the 1.5B preamble behavior). Keep until F1/BA13 lands, then shrink to a thin safety net |
| `output_contract_version` field | **Speculative generality** — validated by zod, never read by anything. Either enforce (reject unknown versions) or delete |
| `usage`/`latency_ms` in `GatewayGenerationResult` | Fetched, unused → wire into metadata/logs (BA18) or delete |
| Gateway `fallbackSystemPrompt` + `evidenceText` | Dead duplicate persona (harness A3) — delete |
| `providers.py` router | Shadowed dead code (BA12) — delete one of the pair |
| `pi-coding-agent` dependency + `spike.ts` mock tool | Unused dependency + historical mock (harness D4) — remove dep, label spike as Phase-0 evidence |
| `DeterministicFakeEmbeddingProvider` | **Justified** — makes retrieval unit-testable without Ollama; but see BA4: fake embeddings against a real index is the one misuse to prevent |
| `benchmark.py` + 20-case fixture | Justified — spec §7.7 requires it; fix the Makefile semantics (BA4) |
| Dual legacy columns (BA16) | Not over-engineering — *under*-cleanup. Delete after one migration |

**Net:** the backend does not suffer from architectural over-engineering (no queues, no microservices, no Redis — the spec's banned list is respected). Its over-engineering is *dead code* and *unused contract surface*, both cheap to amputate.

## 5. Under-engineering / missing-SOTA summary (the upgrade list)

1. HNSW index + iterative scans (BA2) — [4](https://github.com/pgvector/pgvector), [3](https://www.crunchydata.com/blog/hybrid-vector-search)
2. `version_id_col` optimistic locking (BA5) — [1](http://docs.sqlalchemy.org/en/latest/orm/versioning.html)
3. sse-starlette or heartbeat comments (BA6) — [2](https://github.com/sysid/sse-starlette)
4. structlog / python-json-logger (BA9) — [1](https://oneuptime.com/blog/post/2026-02-02-fastapi-structured-logging/view), [2](https://apitally.io/blog/fastapi-logging-guide)
5. Lifespan-managed shared httpx client + bootstrap `verify_availability()` per spec §7.4 (BA7/BA8)
6. `uv lock` (BA11)
7. Ollama structured output via native `format: <JSON schema>` / Modelfile `num_ctx` (BA13) — [2](https://docs.ollama.com/api/chat), [2](https://docs.ollama.com/api/openai-compatibility)
8. Soft-delete chunks for permanent citation provenance (BA1)
9. Single-transaction save stage + stale-pending startup sweep (BA3)
10. Idempotency key on message POST (BA15)

---

## 6. Prioritized findings

| ID | Sev | Status | Component | Finding | Fix type |
|----|-----|--------|-----------|---------|----------|
| BA1 | S2 | C1 | indexer + entities FK | Re-ingest of a changed transcript CASCADE-deletes `message_sources` → citation history silently lost; violates spec §7.2 | structural (migration 0005 + soft-delete) |
| BA2 | S2 | C1 | migrations | No HNSW/IVFFlat index — exact sequential scan for every dense query | patch (migration + `hnsw.iterative_scan`) |
| BA3 | S2 | C1 | conversation_service save stage | Multi-commit save stage: crash window orphans brief/artifact + leaves `pending` forever; no recovery sweep | structural-lite (unit-of-work: services flush, orchestrator commits once; lifespan sweep for stale pendings) |
| BA4 | S2 | C1 | Makefile/cli | `make reindex`/`make benchmark` run host-side against an unpublished DB; default benchmark mixes fake query embeddings with a real index → misleading Recall vs the §7.7 gate | patch |
| BA5 | S3 | C1 | brief/artifact services | Check-then-set optimistic lock races; use SQLAlchemy `version_id_col` + `StaleDataError`→409 | patch |
| BA6 | S3 | C1 | sessions SSE | No heartbeat during ≤120s drafting silence; proxy drop risk | patch (sse-starlette or `: heartbeat` task) |
| BA7 | S3 | C1 | gateway_client | Per-request httpx client; no pooling | patch (lifespan client; seam exists) |
| BA8 | S3 | C1 | main.py/embedder | No lifespan; `verify_availability()` dead; spec §7.4 bootstrap assertion unimplemented; no startup config sanity warnings | patch |
| BA9 | S3 | C1 | logging | f-string "JSON" logs corrupt on quotes/newlines in exception text (§11.1 violation) | patch (python-json-logger min / structlog better) |
| BA10 | S3 | C1 | growth_briefs API/entities | a) PATCH `data: dict[str,Any]` bypasses the typed brief contract; b) service accepts any `status` string (request enum ✓, defense-in-depth ✗); c) CHECK constraints migration-only, absent from ORM metadata | patch |
| BA11 | S3 | C1 | requirements | No lockfile (AGENTS.md violation); mixed range/exact pins | patch/process (`uv lock`) |
| BA12 | S3 | C1 | api/v1 | Duplicate `/providers`; winner leaks `str(e)`; loser dead (=G3) | patch (+ route-dup test) |
| BA13 | S3 | C2 | local LLM path | Ollama `/v1` has no documented context-size param; guaranteed fixes are `OLLAMA_CONTEXT_LENGTH` / Modelfile; native API documents `options` + JSON-schema `format` (structured-output route for F1). Harness-report B1 corrected | patch + wave-3 input |
| BA14 | S3 | C1 | session_service | Oldest-200 pagination; frontend never pages (=G7) | patch |
| BA15 | S4 | C1 | messages POST | No idempotency key; retries duplicate turns | patch |
| BA16 | S4 | C1 | entities | Legacy duplicate columns (`mode`/`workflow_mode`, `provider`/`provider_preference`, `full_name`) carried everywhere | patch (migration + delete) |
| BA17 | S4 | C1 | ordering | `+1µs` hack + UUID tie-break; `seq` identity column is the clean primitive | patch (optional) |
| BA18 | S4 | C1 | gateway_client | `usage`/`latency_ms`/`output_contract_version` fetched-but-unused contract surface | patch (wire to metadata/logs or delete) |
| BA19 | S4 | C1 | syncer | Unsafe `extractall` fallback branch (dead on py3.13) | patch (delete) |
| BA20 | S4 | C1 | sources API | No auth dependency on corpus endpoints (defensible for demo; document) | note |
| BA21 | S4 | C1 | hybrid_search | `embedding_str` hand-joined floats; pgvector-python `register_vector` is cleaner/faster | patch (optional) |
| BA22 | S4 | C1 | compose | `npm run dev` (tsx watch) as the gateway's runtime CMD + `NODE_ENV=development` in the prod-ish topology | patch (build + `node dist/server.js`) |

**Confirmed vs suspected:** everything above is C1 (code-proven) except BA13's runtime magnitude (C2 for the documentation facts; the live truncation effect remains S3 pending probe 3 of the harness report). No findings in this report required assumptions about runtime state.

---

## 7. Strengths worth preserving (do not "fix")

Ingestion idempotency + per-file isolation + anti-wipeout guard · generation called outside DB transactions · cancellation semantics (GeneratorExit → typed `cancelled`, nothing partial persisted) · two-layer model allowlist with explicit no-substitution comments · nh3 + CSP + sandbox artifact pipeline · fail-closed internal auth with timing-safe compare · PEP 706 tar filter · request-ID propagation across both services · envelope redaction discipline · migration 0004's pre-validated constraints · `compute_rrf_fusion` as a pure testable function · honest architecture.md · 126 tests with real negative paths · Makefile command names matching the spec contract.

## 8. Checks not completable statically

1. **Query latency at corpus scale** (does the missing HNSW actually hurt?) — needs the ingested corpus; `EXPLAIN ANALYZE` on both retrieval queries settles it in one command.
2. **Ollama build behavior** for context defaults and `/v1` `options` passthrough — probe 3 A/B in the harness report.
3. **Real SSE behavior behind proxies** (heartbeat necessity) — curl through nginx with `proxy_read_timeout` 60s while a 90s generation runs.
4. **mypy/ruff/pytest actually green at HEAD** — sandbox has no Python deps installed; `make lint typecheck test-unit` on a dev box closes this (AGENTS.md requires evidence, so should the fix PRs).
5. **Concurrent-update race on briefs (BA5)** — demonstrable with two parallel PATCHes at the same `expected_version`; unit-testable with an async fixture once `version_id_col` lands.

## 9. Recommended sequencing (integrates with the harness waves)

- **With harness Wave 1 (prompt/gate):** BA12 route dedupe, BA19, BA18 (delete-or-wire) — trivial diffs in the same files.
- **With harness Wave 2 (reliability):** BA1 + BA2 (one migration, 0005: soft-delete flag + HNSW + iterative scan), BA3 unit-of-work + pending sweep, BA5 `version_id_col`, BA6 heartbeat, BA7 lifespan client, BA8 bootstrap verify, BA9 logging formatter, BA10 a-c, BA11 `uv lock`, BA13 host env/Modelfile + Makefile fixes (BA4), BA14, BA22.
- **With harness Wave 3 (structured outputs):** BA13's native-`format` route folds into F1; json_extractor shrinks to a safety net; `output_contract_version` finally earns its keep.
- **Anytime:** BA15 idempotency, BA16 legacy-column purge, BA17 seq column, BA20 documentation, BA21.
