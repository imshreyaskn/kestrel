# Decision & Audit Log 010: Phase 3 Adversarial Audit & Remediation

**Date:** 10 October 2026  
**Auditor:** Adversarial Verification Gate (supervised by the repository owner)  
**Status:** ✅ REMEDIATION COMPLETE & LIVE-VERIFIED

## 1. Scope and Method

A full cross-check of `IMPLEMENTATION_SPEC.md` (§5–§13), `AGENTS.md` invariants, and the
Phase 3–5 evidence transcripts against the actual source code, followed by remediation
and live end-to-end verification on the running Docker stack (PostgreSQL 16 + pgvector,
Node 22 gateway, host Ollama 0.40.2, Google Gemini cloud).

## 2. Findings (spec violations / bugs found in the shipped code)

1. **Broken core flow (critical):** backend sent `supports: null` on every evidence item;
   gateway zod schema used `.optional()` (rejects `null`) → **every real evidence-bearing
   generation request failed HTTP 400 at the gateway**. The live research flow had never
   been exercised end-to-end despite "empirically verified" phase claims.
2. **No server-side insufficient-evidence bypass (spec §7.6/§11.2/§12.1):** empty retrieval
   still called generation with "NO RELEVANT TRANSCRIPT EVIDENCE FOUND."
3. **No model allowlist (spec §6.6):** arbitrary `model_id` accepted from the browser,
   passed through, and dynamically registered in the gateway; cloud requests silently
   fell back to `googleModels[0]` — a silent model substitution violating the
   zero-silent-fallback invariant.
4. **Missing ownership checks (spec §6.2):** growth briefs and artifacts were
   fetch-by-ID with no user/session ownership enforcement, while `architecture.md`
   claimed otherwise.
5. **Missing essay word-count gate (spec §8.4, Phase 3 gate):** no 1,150–1,350 word
   enforcement; transcript 007's "200–400 bounds validation" claim was fabricated.
6. **Raw exception leakage (spec §6.1/§11.1):** `str(exc)` flowed to clients in SSE
   error envelopes, non-streaming 500 details, and health/providers payloads; no error
   taxonomy (everything collapsed to `GENERATION_FAILED`).
7. **No cancellation cleanup:** client disconnect left assistant rows `pending` forever;
   docs claimed "transaction rolled back."
8. **Migrations never ran in startup:** compose api CMD was bare `uvicorn`; fresh-clone
   boots hit `relation "users" does not exist`; `/health/ready` used `SELECT 1` and could
   not detect an unmigrated schema.
9. **Broken `.env` passthrough:** ~12 documented knobs (OLLAMA_CHAT_MODEL, RETRIEVAL_*,
   timeouts, cloud models, DEMO_USER_ID) never reached containers; "switch instantly in
   .env" claims were false.
10. **Port policy violations (spec §13.1):** gateway (8010) and PostgreSQL (5433)
    published to the host by default; frontend not loopback-bound.
11. **Gateway auth fail-open:** empty `INTERNAL_SERVICE_TOKEN` disabled authentication;
    the code default token was a public placeholder string.
12. **Prompt duplication:** the current user message was sent to the model twice (in
    `conversation_context` and as `current_user_message`).
13. **Non-deterministic message ordering:** user/assistant rows shared the same
    `created_at`; no tiebreaker.
14. **Optional optimistic concurrency:** `expected_version` was optional → silent
    overwrites on PATCH.
15. **Missing validation:** null bytes/control chars accepted (spec §6.3);
    `artifact_format` accepted and ignored; brief `status` unvalidated; no DB CHECK
    constraints for `growth_briefs.status` / `artifacts.kind`.
16. **Unimplemented Anthropic/OpenAI routing** returning a stale "scheduled for Phase 3"
    501, while ADR 001/PRD/README claimed universal provider support.
17. **Dead/deceptive artifacts:** `scripts/spike_phase0.py` (the synthetic-theatre spike
    from audit 000) still shipped; `agent-gateway` had no tests, no logging; frontend had
    no test framework; `test_workbench_e2e.py` was router wiring labelled "E2E";
    `ruff format --check` had never been run (16 files non-conforming).
18. **Frontend called a nonexistent `PATCH /api/v1/sessions/{id}`** for dossier renaming
    and swallowed the failure silently.

## 3. Remediation (implemented 2026-10-10)

- `conversation_service.py`: abstention branch (no gateway call on empty evidence);
  single constrained JSON-repair attempt (spec §7.6); cancellation handler
  (`status='cancelled'`); classified/redacted error envelopes; model allowlist resolver;
  prompt dedup; `+1µs` assistant timestamp; title derivation; honest `message_sources`
  ranks with RRF scores in message metadata.
- `sessions.py`: null-byte/control-char rejection; `artifact_format` combination
  validation; fail-fast model allowlist (422); typed error mapping; message pagination;
  new `PATCH /sessions/{id}` rename endpoint.
- `growth_briefs.py` / `artifacts.py` / services: user ownership enforcement via
  `chat_sessions` join; `expected_version` required; brief `status` enum.
- `providers.py` / `health.py`: redacted categories, no internal URLs, migration-state
  check added to readiness.
- `gateway_client.py`: timeout vs connect classification; omit null `supports`.
- `server.ts`: anthropic + openai providers registered (catalog-verified IDs);
  exact-match model resolution; gateway-local model allowlist; fail-closed token auth
  with timing-safe compare; request logging middleware.
- Deployment: `alembic upgrade head` in api entrypoint; full env passthrough;
  `compose.dev.yml` opt-in debug ports; loopback binding; gateway/DB unpublished by
  default; Makefile targets run in-container; spike script deleted.
- Migration `0004_deliverable_constraints`: CHECK constraints for brief status and
  artifact kind.
- Model pinning: `GEMINI_MODEL=gemini-3.8-flash` (production workhorse; catalog-verified
  against installed pi-ai data and the live Generative Language API), high-efficiency
  `gemini-3.5-flash-lite` used for local runtime; `ANTHROPIC_MODEL=claude-sonnet-5`
  (the previously documented `claude-sonnet-latest` does not exist in the catalog).

## 4. Verification (commands actually run, outputs observed)

```
python -m ruff check backend tests          -> All checks passed!
python -m ruff format --check backend tests -> 70 files already formatted
python -m mypy backend tests                -> Success: no issues found in 70 source files
python -m pytest                             -> 125 passed in 27.72s
python -m pytest tests/integration           -> 7 passed in 11.75s (live DB/gateway/Ollama)
npm run build --prefix frontend              -> built in 2.16s, 0 errors
docker compose run --rm --no-deps agent-gateway npx tsc --noEmit -> clean
docker compose config / compose -f compose.dev.yml config        -> valid
```

Live stack rehearsal (Docker Desktop, host Ollama 0.40.2):

- api boot log: `Running upgrade 0003_align_spec_schema -> 0004_deliverable_constraints`
  (migrations auto-applied on container start — fresh-clone path fixed).
- `GET /health/ready` → `status: ready`, database/ollama/agent_gateway all `up`.
- Ingestion: sync from upstream tarball (commit `archive-main`), index → 303 sources,
  16,964 chunks; second index run → `discovered 303, skipped 303, created 0, failed 0`
  in 2.65s (idempotency gate).
- Out-of-corpus question → SSE `completed` with `insufficient_evidence: true`,
  citations `[]`, "Not in the archive" content; gateway logs show **0** `/api/v1/generate`
  calls (abstention bypass verified).
- Local grounded query ("How did Superhuman improve onboarding activation?", provider
  `local`, `qwen2.5:1.5b`) → `status: complete`, one validated citation with verbatim
  chunk excerpt from PostgreSQL and canonical episode URL. Note: the 1.5b model's first
  draft failed JSON validation and the single repair attempt rescued it — the repair
  path is live-verified.
- Cloud grounded query (provider `cloud`, `gemini-3.5-flash-lite`) → `status: complete`
  with citation; model availability pre-verified against the live Google
  Generative Language API model list.
- Contract gates: bogus `model_id` → 422; null byte (`\u0000`) → 422;
  `artifact_format` mismatch → 422; session rename PATCH → 200; history pair order
  `[('user','complete'), ('assistant','complete')]`.

## 5. Honest limitations

1. **Anthropic/OpenAI live calls: not run** (no evaluator keys available during this
   session). Implemented, registered, type-checked; key-presence and exact-model checks
   return explicit errors otherwise.
2. **Cancellation is not provider-level:** the struck run closes the DB row as
   `cancelled`; the gateway's in-flight provider call completes and its result is
   discarded (documented in `architecture.md` and the manual test plan).
3. **Local 1.5b quality:** `qwen2.5:1.5b` frequently needs the repair attempt and can
   still produce semantically weak citations (identity-valid, support-weak). The UI
   offers explicit provider switching; stronger local models are a configuration change
   (`OLLAMA_CHAT_MODEL`) per the ADR's zero-code-switch principle.
4. **Frontend tests:** still absent (no framework installed); spec §12.4 frontend test
   coverage remains a documented gap rather than a false claim.
5. **`alembic_version` check in readiness** assumes the alembic table exists after
   first migration; on a truly empty DB the readiness reports
   `database_unreachable_or_not_migrated` until the api entrypoint completes its first
   boot migration — intended behavior.
6. **Demo video** (assignment deliverable) is still to be recorded.

## 6. Files changed in this remediation

Backend: `conversation_service.py`, `session_service.py`, `growth_brief_service.py`,
`artifact_service.py`, `sessions.py`, `growth_briefs.py`, `artifacts.py`,
`providers.py`, `health.py`, `gateway_client.py`, `validator.py`, `prompts.py`,
`skill_loader.py`, `config.py`, `main.py`; migrations `0004_deliverable_constraints.py`.
Gateway: `server.ts`. Frontend: `api.ts`. Infra: `docker-compose.yml`, `compose.dev.yml`
(new), `backend/Dockerfile`, `Makefile`, `.env.example`. Docs: `README.md`, `PRD.md`,
`architecture.md`, `manual-test-plan.md`, `ADRs/001-agent-runtime-choice.md` (via
architecture §2), transcript 007 correction + this log. Tests: validator, conversation
service, session API, brief/artifact API suites extended (99 → 125 passing).
Removed: `scripts/spike_phase0.py` (dead synthetic-theatre spike from audit 000).
