# Brutal Bug Hunt — Kestrel working tree @ `223e0e4` + uncommitted cleanup
**Date:** 2026-10-12 · **Method:** static tooling executed independently (ruff check, ruff format --check, mypy, pytest, tsc, vitest) + fresh line-level reads of every file touched by the 13 remediation commits + scripts/compose/migrations. Bug classes hunted: races, resource leaks, state-machine holes, regex edges, error swallowing, type coercion, security regressions, doc-vs-code drift.

**Totals: 16 findings — 0 crash-the-demo, 2 gate-breaking, 4 functional, 10 hygiene/hardening. Plus a verified-clean list (§4) — the core pipeline is genuinely solid.**

---

## 1. Gate-breaking (your own quality claims are false at HEAD)

### BUG-1 · S2 · `make typecheck` fails: mypy reports 13 errors in 5 files
Transcript 016 records mypy clean; later waves drifted it. Errors:

| Location | Error | Real risk | Fix |
|---|---|---|---|
| `hybrid_search.py:91-92` | `int \| None` arithmetic in `_overlaps` | **None at runtime? No** — a `None in (...)` guard precedes the math, but mypy can't narrow through tuple membership | Replace with explicit `if a.char_start is None or a.char_end is None or b.char_start is None or b.char_end is None:` |
| `conversation_service.py:895` | `citation_payloads` re-annotated (first at :422) | Runtime-safe (mutually exclusive branches) | Annotate once at first use; drop the second annotation |
| `session_service.py:210` | `Result` has no `rowcount` | Runtime fine (asyncpg returns CursorResult) | `from sqlalchemy import CursorResult` + cast, or `getattr(result, "rowcount", 0)` |
| `providers.py:28-29`, `sessions.py:377`, `test_api_endpoints.py:84` | untyped-def bodies unchecked (notes) | — | annotate the handlers |
| `test_syncer_and_indexer.py:178,236` | `None` for `repo_url: str`; `Join.name` union attr | test-only | `repo_url=""` sentinel; `str(...)` guard |

### BUG-2 · S3 · `make lint` fails: `ruff format --check` wants 10 files reformatted
Including `backend/app/main.py:107` and `backend/app/models/entities.py:128` (wave-commit drift). **Fix:** run `ruff format backend tests` once and commit. Zero behavior change; restores the gate the README and transcripts claim.

---

## 2. Functional bugs

### BUG-3 · S2 · Idempotency key is poisoned forever after a failed or cancelled run
`conversation_service.py` replay logic handles two states of a keyed prior turn: `complete` (replay stored result) and `pending` (`REQUEST_IN_PROGRESS`). A prior turn that ended **`failed` or `cancelled` falls through to the normal pipeline**, which INSERTs a new user message carrying the *same* `(session_id, idempotency_key)` → violates the partial unique index `ix_messages_session_idempotency` → `IntegrityError` → generic 500 `GENERATION_FAILED "Retry, or switch provider"` — and **every subsequent retry with that key fails identically**. The system's own error envelopes say `retryable: true` and the UI offers "Recompose", inviting exactly this retry.

Latent today (the frontend doesn't send keys — MT-16 tests only the happy path via curl), but the feature is documented in README, architecture.md §4.1, and the resilience matrix, so it's a contract bug, not a hypothetical.

**Fix (re-run semantics — release the key from the dead attempt):**
```python
# after the REQUEST_IN_PROGRESS branch, before fall-through:
if assistant_reply and assistant_reply.status in ("failed", "cancelled"):
    # A dead attempt must not block its own retry: release the key so the
    # new turn can claim it. The failed pair stays visible as history.
    existing_user_msg.idempotency_key = None
    await db.commit()
```
(Alternative: replay the stored failure envelope — but that contradicts `retryable: true`.) Add a unit test: key → failed run → same key → new run succeeds.

### BUG-4 · S3 · Idempotent replay lies about the answer type
The replayed `completed` event hardcodes `"insufficient_evidence": False, "weak_evidence": False` (`conversation_service.py:478,485`) while the live path emits the true flags (`:980`). The frontend branches on `data.insufficient_evidence` to render the "Not in the archive" notice — so **replaying a stored abstention renders it as a normal grounded answer** (different entry kind, missing the honest-gap styling and the "0 citations · the question outran the evidence" stamp). The flags aren't persisted anywhere, so replay *can't* reconstruct them today.

**Fix:** persist at save time, read at replay:
```python
# save stage, where meta_payload is assembled (~:869):
meta_payload["insufficient_evidence"] = bool(getattr(validated, "insufficient_evidence", False))
meta_payload["weak_evidence"] = bool(weak_evidence)
# replay path (:478/:485):
"insufficient_evidence": (assistant_reply.metadata_ or {}).get("insufficient_evidence", False),
"weak_evidence": (assistant_reply.metadata_ or {}).get("weak_evidence", False),
```

### BUG-5 · S3 · Composing-stage labels drift off the real pipeline (breaks a documented product claim)
Backend streams **five** stages: `loading_context, retrieving, drafting, validating, saving`. `stageMap` in `App.tsx` maps them to indices 0-4, but every mode in `COMPOSING_STAGES` has **four** steps. Net effect for research mode: while the backend is *retrieving*, the UI shows "drafting the entry" as running; while *drafting*, it shows "verifying citations"; at *saving*, index 4 exceeds the array — all steps flip to done while work continues. README ("stage labels map 1:1 to real pipeline stages"), design.md §5, and PRD observability all claim the 1:1 property; it isn't one.

**Fix (per-mode mapping, no copy changes):**
```ts
const STAGE_MAP_BY_MODE: Record<ComposeMode, Record<string, number>> = {
  research:      { loading_context: 0, retrieving: 0, drafting: 1, validating: 2, saving: 3 },
  growth_brief:  { loading_context: 0, retrieving: 0, drafting: 1, validating: 2, saving: 3 },
  artifact:      { loading_context: 0, retrieving: 0, drafting: 1, validating: 2, saving: 3 },
  essay:         { loading_context: 0, retrieving: 1, drafting: 2, validating: 3, saving: 3 },
};
// onStage: const activeIdx = STAGE_MAP_BY_MODE[mode][stage] ?? 0;
```
(Essay's 4 steps align naturally: consulting covers load+retrieve, outlining+drafting cover drafting — or give essay a 5th "binding" step; either restores honesty.)

### BUG-6 · S3 · The manual setup path deploys with the published placeholder token
`.env.example:14` ships `INTERNAL_SERVICE_TOKEN=replace-with-a-long-random-local-token`. Compose's `${INTERNAL_SERVICE_TOKEN:?…}` rejects only *unset/empty* — the placeholder is non-empty, so `cp .env.example .env && make demo` runs the whole stack on a **secret that is public in the repo**. The start scripts catch both known placeholders (fixed earlier today); the documented manual path doesn't.

**Fix (fail-closed everywhere):** set `.env.example:14` to `INTERNAL_SERVICE_TOKEN=` with the comment "required — start scripts generate one automatically; manual setup: `openssl rand -hex 32`". Empty value trips compose's `:?` with a clear message, and both start scripts already regenerate on empty. Non-Docker dev keeps the `config.py` default.

---

## 3. Smaller functional issues & hardening

| # | Sev | Location | Issue | Fix |
|---|-----|----------|-------|-----|
| BUG-7 | S4 | `start.ps1:125` | Token generated with `Get-Random` — a non-cryptographic PRNG — while README step 3 claims "cryptographically secure" | `$b=[byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToHexString($b)` |
| BUG-8 | S4 | `api.ts streamMessage` | If the stream closes cleanly **without** a terminal `completed`/`error` event (server bug, odd proxy), no callback fires → UI sticks in composing forever; only a reload recovers | After the read loop: `if (!cancelled && !sawTerminal) callbacks.onError?.({code:'STREAM_CLOSED', message:'The stream ended without a result'})` |
| BUG-9 | S4 (suspected) | `App.tsx:681` View Transition | `startViewTransition(() => { setView(...); appendQueryEntry(); })` — React 18 batches these updates; the VT callback returns non-Promise, so the "new" snapshot may be captured before React flushes. Usually works (flush lands before next paint), occasionally captures the old state → transition shows nothing | Wrap the state updates in `flushSync` inside the callback (official React+VT pattern) |
| BUG-10 | S4 | `App.tsx handleRetryLast` | Retry drops the original `productContext` (only text/mode/format stored in `lastRunRef`) → a brief retried after failure silently loses the user's context fencing | Store `productContext` in `lastRunRef` and pass through |
| BUG-11 | S4 | `App.tsx handleProviderChange` | Switching to an offline provider fires a danger toast **and** a success toast ("Provider set to …") back-to-back — contradictory feedback | `else`-branch the success toast |
| BUG-12 | S4 | `conversation_service` error classification | Ollama-embedding outage raises `EmbeddingError` → classified as generic retryable `GENERATION_FAILED "Generation failed unexpectedly"` — wrong subsystem named to the user | Add branch: `EmbeddingError → ("RETRIEVAL_UNAVAILABLE", "The embedding model is unreachable — verify Ollama is running.", True)` |
| BUG-13 | S5 | `MermaidFrame.tsx` message listener | Validates `frameId`, type, and clamps height, but not `e.source` — any window knowing the id can resize the frame (nuisance ceiling only) | `if (e.source !== iframeRef.current?.contentWindow) return;` |
| BUG-14 | S5 | gateway `userPromptReminder` | Instructs "Out of scope → decline with `scope: 'out_of_scope'`" on **all five modes**, but only the research schema has a `scope` field — small models may emit stray fields (validator ignores them; prompt self-inconsistency) | Gate the scope sentence on `payload.mode === "research"` |
| BUG-15 | S5 | `api.ts:494` comment | Says the providers contract is the "config.py route shape" — that handler was deleted in the G3 dedupe; the code defensively handles both shapes (works), the comment misleads | Update comment to providers.py shape |
| BUG-16 | S5 | `docker-compose.yml` | Only `db` has a healthcheck; `api` waits on gateway via `service_started` — a crash-looping gateway isn't caught by compose (start scripts compensate via HTTP polling) | Add `test: ["CMD","node","-e","fetch('http://localhost:8010/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]` to gateway; python-urllib equivalent for api; upgrade `depends_on` to `service_healthy` |

---

## 4. Verified clean (swept, no bugs found)

- **SSE plumbing, both ends.** Heartbeat producer/queue with `finally`-cancel of the producer task; `extractSSEEvents` handles `\r\n`, comment frames, multi-line data, partial-frame buffering correctly.
- **Citation reconciler.** Multi-label `[E1, E2]` splitting, case normalization, strict/lenient repair paths, punctuation-whitespace cleanup, rank-sorted auto-add — genuinely well engineered.
- **Optimistic locking.** Manual `version += 1` + `version_id_col` + `StaleDataError → 409` is the correct SQLAlchemy pattern (the `version_id_generator: False` trap is avoided).
- **Atomic save stage.** `commit=False` flushes + single terminal commit; artifact auto-links the session's latest brief.
- **Soft-delete re-ingestion.** Deactivation inside the savepoint; retrieval filters `tc.is_active AND ts.is_active` in both SQL paths; historical `message_sources` keep resolving.
- **Migration 0006.** IDENTITY `seq` backfills existing rows safely; partial-unique idempotency index correct.
- **Gateway client error mapping.** 400/403/404/413 → typed non-retryable exceptions; `response.json()` failure degrades safely into the generic envelope.
- **JsonLogFormatter.** Proper `json.dumps(default=str, ensure_ascii=False)`, exception serialization, no f-string corruption.
- **useFocusTrap.** Visibility-aware focusable filtering, stale-closure-safe escape via ref, focus restore with `isConnected` check.
- **LeaderLines.** focusin/focusout wired (keyboard parity), non-ratcheting 100% SVG sizing, first-appearance-only ink draw.
- **Shared httpx client.** Lifespan-created, injected via `set_http_client`, closed on shutdown.
- **MarkdownViewer tables.** Header-driven cell counts, alignment parsing, cells through the escape-only inline renderer — no injection surface.
- **Mermaid isolation.** Pinned 11.17.2, strict level, `%%{init}%%` stripped, opaque-origin frame; even with `script-src 'unsafe-inline'` inside the frame, sandbox-without-same-origin + `connect-src 'none'` + no navigation allowances contain a renderer zero-day.
- **Suites:** pytest 176+3 green, tsc clean, vitest 102 green (post-cleanup), ruff check clean.

## 5. Fix order (deadline-aware)

1. **BUG-2** — `ruff format backend tests` (one command, restores `make lint`).
2. **BUG-1** — the five mypy fixes (~30 min, restores `make typecheck`).
3. **BUG-6 + BUG-7** — `.env.example` empty token + ps1 CSPRNG (10 min, closes the security-hygiene pair; update README step-3 wording if needed).
4. **BUG-5** — stage map (15 min, restores a claim the demo narrates aloud — your script's filler lines say "each stage is a real backend phase").
5. **BUG-4 + BUG-3** — replay flags + key release (~1h with tests; API-surface correctness).
6. **BUG-8/10/11/12** — small frontend/classification patches (~45 min).
7. **BUG-9/13/14/15/16** — hardening batch, post-submission acceptable.

Every fix above is local; none conflicts with the uncommitted cleanup in the tree. After applying 1-4, re-run `make lint typecheck test` + `npm test` and the quality claims in README/transcripts are true again at HEAD.
