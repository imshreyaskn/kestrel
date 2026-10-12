# Re-Baseline Verification — kestrel @ `7a93941` ("latest")

**Range verified:** `0881858` (state of all four prior audits) → `7a93941`, 13 commits, 87 files, +11,446/−1,199.
**Method:** static re-read of every remediated file + **independent test execution in this sandbox**:
- Backend: `pytest tests/unit tests/evaluation` → **175 passed** (4.4s) ✅ (their transcript 016 claimed 159; suite has grown since)
- Frontend: `vitest run` → **99 passed / 10 files** (6.3s) ✅
- Their verification discipline (transcripts 014-016 with test tables, ruff/tsc/readiness evidence) matches what I could independently reproduce.

**Headline:** ~90% of all findings across the four audits are verifiably fixed, several *better than specified*. The remediation introduced **one submission-grade new risk (font licensing)** and a handful of small coherence bugs. Multi-provider (the Foundry design) is not yet built — expected, it was delivered as a proposal.

---

## 1. Fix-verification matrix

### Harness audit (`kestrel-harness-audit.md`)
| Finding | Status | Evidence |
|---|---|---|
| A5 epistemics rewrite (S1) | ✅ FIXED | `prompts.py:14-27` — three-tier base prompt (ARCHIVE KNOWLEDGE / YOUR OWN REASONING / user-context fence), companion framing, capability card, proportionality rule, honest-gap shape (`:258`) |
| A1 abstention gate (S1) | ✅ FIXED **beyond spec** | Gate deleted; generation always runs; `_CONVERSATIONAL_QUERY_RE` pre-router (`conversation_service.py:78-84,518`) skips retrieval for pure pleasantries; prose fallback for non-JSON greeting replies (`:602-614`); canned string demoted to corrupt-output-on-empty-evidence last resort (`:624`). Regex is `$`-anchored — "hey what about pricing?" correctly does NOT skip retrieval |
| A2 scope contradiction | ✅ FIXED | scope mechanics moved to research mode |
| A3 dual persona / fallback | ✅ FIXED | `server.ts:124` `system_prompt: z.string().min(1)`; fallbackSystemPrompt + duplicate formatter deleted |
| A4 capability self-description | ✅ FIXED | "WHAT YOU CAN DO" block in base prompt |
| B1 num_ctx/maxTokens/budget (S1) | ⚠️ FIXED with caveat → **N2** | gateway `OLLAMA_NUM_CTX=16384` via `samplingParams.options` + per-provider `maxTokens` (`server.ts:303-322`); backend `HISTORY_TOKEN_BUDGET_LOCAL/CLOUD` + `_trim_history_to_budget` (`config.py:67-68`, `conversation_service.py:124`). **Caveat:** the `/v1` `options` passthrough is not documented by Ollama; no `OLLAMA_CONTEXT_LENGTH` belt-and-braces in docs/compose |
| B2 stale [E#] in history | ✅ FIXED | `_CITATION_MARKER_RE` strip (handles `[E1, E2]` multi-markers too) |
| B3 context-blind retrieval | ✅ FIXED **beyond spec** | `build_retrieval_query` expands short/anaphoric queries with prior user msg **+ first line of prior assistant answer** (markers stripped) |
| B4 binary sufficiency | ✅ FIXED | `weak_evidence` advisory flag added to RetrievalResult |
| B5 near-dupe chunks | (not re-verified in fusion code; 0005 soft-delete changes the dedupe surface — spot-check recommended) | ⚠️ VERIFY |
| B7 missing ambient context | ✅ FIXED | `_clean_artifact_digest` for artifact turns; digest bounded 600 chars |
| C2/C3 query handling | ✅ FIXED | whitespace rejection (`sessions.py:105-107`) |
| D2 typed repair | ✅ FIXED | `AgentOutputError.reason_code` + `REPAIR_GUIDANCE` map + reason passthrough at call site |
| D3 stop_reason discarded | ✅ FIXED | dataclass field → validator truncation check → service wiring (`gateway_client.py:48,229`, `validator.py:300-308`) |
| D4 phantom ADR/deps | ✅ FIXED | `pi-coding-agent` removed from package.json |
| E1 inline labels unvalidated | ✅ FIXED **beyond spec** | `reconcile_inline_labels` — strips invalid, **auto-adds text labels missing from citations array** (CIT5 union fix), applied to research + brief fields |
| E2 essay gate override | ✅ FIXED | `target_word_count` API field, mode-validated, threaded to prompt + validator |
| E3 empty answers | ✅ FIXED | `EMPTY_ANSWER` typed error |
| E5 reminder placement | ✅ FIXED | appended to system prompt tail, user turn verbatim (`server.ts:193`) |
| G1/G6/G8 config drift | ✅ FIXED | compose: `INTERNAL_SERVICE_TOKEN:?required`, model envs passthrough-with-empty-default; gateway unused `*_MODEL` envs deleted |
| G2 retryability lies | ✅ FIXED | `GatewayConfigError`/`PayloadTooLargeError`/`ModelNotAllowedError`, all `retryable=False` |
| G3 duplicate /providers + str(e) leak | ✅ FIXED | config.py handler deleted (0 `str(e)` remaining) |
| G5 history metadata fabrication | ✅ FIXED | conversation_context entries carry per-turn `provider`/`model_id`; zod extended |
| G7 oldest-page pagination | ✅ FIXED | monotonic `seq` column (migration 0006) + newest-first query reversed for display |
| F1 constrained outputs (Wave 3) | ⬜ NOT DONE (was gated on probe) | no tools/toolChoice in gateway; extractor remains load-bearing — fine for now |
| SK2/SK4/SK5 skill fixes | ✅ FIXED | `min_model_tier: mid` in SKILL.md frontmatter; `writing_path` enum-validated; skill version stamped into message metadata (`ship-30-for-30@v{n}`) |
| AR1 artifact quality direction | ✅ FIXED | `runtime-skills/document-craft/SKILL.md` committed **and wired** — `prompts.py:_get_document_craft_parts()` splits it per-mode (hard-bans into essays, full rules into artifacts) — more surgical than my single-blob proposal |
| MM1 mermaid | ✅ FIXED | `MermaidFrame.tsx`: pinned `mermaid@11.17.2`, `securityLevel:'strict'`, `%%{init}%%` stripping, sandboxed display iframe, error fallback UI, `mermaidSecurity.test.tsx` |

### Backend audit (`backend-architecture-audit.md`)
| Finding | Status | Evidence |
|---|---|---|
| BA1 provenance CASCADE (S2) | ✅ FIXED | migration 0005: `transcript_chunks.is_active` + partial indexes; indexer soft-deactivates instead of deleting |
| BA2 no ANN index (S2) | ✅ FIXED | 0005 creates HNSW `vector_cosine_ops` |
| BA3 two-phase save (S2) | ✅ FIXED | Wave-B "atomic transactions" commit + `test_wave_b_remediation.py` |
| BA4 broken make targets (S2) | ✅ FIXED | commit 2d255f3 (BA4 listed); Makefile containerized |
| BA5 check-then-set locking | ✅ FIXED | `version_id_col` + `version_id_generator: False` on both entities; `StaleDataError` → 409 in both services |
| BA6 SSE silence | ✅ FIXED | 15s `: ping` heartbeat + dedicated test file |
| BA7/BA8 client pooling + lifespan | ✅ FIXED | `lifespan` with shared `httpx.AsyncClient` + `verify_availability()` at boot (spec §7.4 satisfied) |
| BA9 f-string JSON logs | ✅ FIXED | `JsonLogFormatter` class (+ follow-up commit for non-string serialization) |
| BA10a untyped brief PATCH | ✅ FIXED | `GrowthBriefData`/`GrowthBriefExperimentData` models on the request |
| BA11 no lockfile | ✅ FIXED | `backend/requirements.lock` added |
| BA16 legacy columns | ✅ FIXED | 0006 drops `messages.mode`, `chat_sessions.provider`, `users.full_name` |
| BA17 timestamp hack | ✅ FIXED | `seq` monotonic column |
| BA18/BA19/BA22 | ✅ FIXED | commit 2d255f3; gateway Dockerfile now `npm run build` + `node dist/server.js` |
| BA15 idempotency key | ⬜ OPEN | no `client_message_id`/Idempotency-Key anywhere |
| BA20/BA21 (docs/pgvector-register) | ⬜ OPEN (S4, optional) | — |

### Design audit (`design-implementation-audit.md`)
| Finding | Status | Evidence |
|---|---|---|
| §3.1 `--crimson` undefined | ✅ FIXED | aliased to `--danger` (`dossier.css:52`) |
| §3.5 `--faint` contrast 2.57:1 | ✅ FIXED | `#716A64` (4.69:1 — exactly the recommended value) with comment |
| §3.3 settleEntry dead CSS | (transcript 014 claims motion wiring complete; `.is-arrived` rule presence not re-verified line-by-line) | ⚠️ SPOT-CHECK |
| §3.4 toast tones/exit/cap | ✅ FIXED per commit history + Toasts test presence | ⚠️ spot-check danger tone on error toasts |
| Focus traps | ✅ FIXED | shared `useFocusTrap.ts` + tests |
| Signature moments | ✅ FIXED | `signatureMoments.test.ts` + transcript 014 (Bind/Strike/etc. wired) |
| Rail `width` transition (anti-slop #7) | ⬜ STILL PRESENT | `dossier.css:727` |
| Global scrollbar hiding | ⬜ STILL PRESENT (owner decision pending) | `:196,420,805` |
| Typography | 🔁 SUPERSEDED by owner | Fraunces/Newsreader replaced by Maghfirea + PP Mori + Cabinet Grotesk stack (commit 03eee9f) → see **N1** |

### Citation audit (`citation-system-audit.md`)
| Move | Status | Evidence |
|---|---|---|
| Move 1 unify on E-number | ✅ FIXED | `citeInline.ts:25-35` — `num` from evidence_id, sorted, `refIndex = num`; history ordered by `retrieval_rank` (`session_service.py:143`) |
| CIT4 retrieval_rank semantics | ✅ FIXED | true rank stored; exposed to FE |
| CIT5 WYSIWYG invariant | ✅ FIXED | via `reconcile_inline_labels` auto-add |
| CIT6 bare-`[n]` false positives | ✅ FIXED | matching now keyed on E-tokens (`citeInline.ts:85-92`) |
| CIT7 vertical space | ✅ FIXED | collapsed-by-default sidenotes (`SideNote` `collapsed/open` + `aria-expanded`), auto-expand on bead click, **hover peek tooltip** (`sn-peek` role=tooltip), leaders calmed to 0.38 opacity at rest with hot emphasis |
| CIT8 keyboard hot-state | (not line-verified) | ⚠️ SPOT-CHECK focusin wiring in LeaderLines |
| CIT9 provenance layer | ✅ FIXED | SideNote shows `Rank #n · Fused 0.xxx`; history API surfaces `rrf_score` |

---

## 2. NEW findings introduced by the remediation

### N1 · **S2 — Commercial font binaries committed to a public repo (submission-grade risk)** · confirmed
`frontend/public/fonts/` ships **PP Mori** (Regular+SemiBold .woff) and **Maghfirea** (.otf/.ttf) as binaries in a public GitHub repo, and the CSS stack also names **Cabinet Grotesk** (`--f-disp`, `--f-ui`). PP Mori and Cabinet Grotesk are Pangram Pangram / Indian Type Foundry **commercial** families whose EULAs prohibit redistribution (trial fonts are evaluation-licensed only); Maghfirea is a retail display face. The stack they replaced — Fraunces, Newsreader, Space Grotesk, Spline Sans Mono — was **100% SIL OFL**. For a take-home that is publicly evaluated (rubric: "Code quality", repo deliverable "no committed secrets" — same hygiene principle), redistributing unlicensed typefaces is an unforced legal/professional error, and an evaluator who knows type will notice.
**Also:** Cabinet Grotesk is referenced in three font stacks but **no file is shipped or linked** — a phantom reference (their own AGENTS.md anti-pattern #3), so `--f-disp` silently falls back to PP Mori.
**Fix options (pick one before submission):**
1. **Revert to the OFL stack** (Fraunces/Newsreader — the design doc's system, variable-axis mechanics included), keeping the new layout work; safest, zero cost, and restores the SOFT/WONK interactions the design audit praised.
2. **OFL lookalikes** for the new direction: e.g. Schibsted Grotesk / Hanken Grotesk (Cabinet/PP-Mori-adjacent, OFL) + an OFL display face (Instrument Serif, Fraunces, or Bricolage Grotesque for character) — keeps the fresh identity, stays legal.
3. **Buy/verify licenses** for all three families *including web-embedding + open-source-repo redistribution rights*, commit the license evidence, and remove the phantom Cabinet Grotesk reference if unlicensed.
Whichever path: delete or ship Cabinet Grotesk — no phantom stacks.

### N2 · S3 — Local context fix rides an undocumented Ollama behavior; docs don't cover the guaranteed path · confirmed
`server.ts` sends `samplingParams: { options: { num_ctx } }` to Ollama's `/v1/chat/completions`. Ollama's official compatibility docs state the OpenAI endpoints have **no supported way to set context size** (Modelfile `PARAMETER num_ctx` or server-level `OLLAMA_CONTEXT_LENGTH` are the documented mechanisms). Transcript 015 asserts it works; transcript 016's verification table doesn't include a context-size probe. Meanwhile `OLLAMA_CONTEXT_LENGTH`/`OLLAMA_NUM_CTX` appear **nowhere** in README/.env.example/compose — if the host's Ollama ignores the body `options`, the S1 truncation risk silently returns.
**Fix (15 min):** run the marker-echo probe (harness report §6 probe 3) against the actual host Ollama; regardless of outcome, document `OLLAMA_CONTEXT_LENGTH=16384` in `.env.example`/README as the guaranteed mechanism and add `OLLAMA_NUM_CTX` passthrough to compose so the gateway value is operable. Also: the repo-root `kestrel-harness-audit.md` is the **pre-correction copy** — it's missing the Ollama correction block; refresh it (the committed audit should match the repo it audits).

### N3 · S4 — Mermaid theme references a font that no longer exists · confirmed
`MermaidFrame.tsx` themeVariables: `fontFamily: 'Newsreader, Georgia, serif'` — Newsreader was removed in the typography swap; diagrams silently render in Georgia (and inside the sandboxed iframe, no app font is available at all). Set the theme font to a stack the srcdoc actually has (`Georgia, serif` honestly, or embed the self-hosted face into the srcdoc if diagram typography matters).

### N4 · S4 — MermaidFrame parent listener lacks source/origin validation · confirmed (low exploitability)
The handler validates `frameId`, payload type, and clamps height 60-1200 — decent — but any window that guesses the frameId can resize the frame. One-line hardening: `if (e.source !== iframeRef.current?.contentWindow) return;`. (Rendering itself is sound: pinned 11.17.2, strict level, init-directive stripping, display isolated in `sandbox="allow-scripts"` — residual risk is a mermaid 0-day executing transiently in the parent during `render()`; acceptable with the security test they added, eliminable later with a full opaque-iframe renderer.)

### N5 · S4 — Design-discipline leftovers · confirmed
Rail still animates `width` (anti-slop #7, `dossier.css:727`); global scrollbar-hiding persists (`:196` et al.). Both were owner-decision items — now that everything else conforms, they're the last visible doctrine breaks. Clip-path replacement and scoped-scrollbar snippets are in the design audit §P4.

### N6 · cosmetic — Starlette deprecation noise
13 test warnings: `HTTP_422_UNPROCESSABLE_ENTITY` deprecated → `HTTP_422_UNPROCESSABLE_CONTENT`. One-line swap keeps the suite output clean for evaluator eyes.

---

## 3. Still open (not attempted in this range)

1. **Multi-provider "Foundry" system** — design delivered (`design/multi-provider-system.md`), zero implementation (`provider_keys` table absent). Note: migrations 0005/0006 are now taken; the Foundry migration becomes **0007**. The pi-ai per-request `apiKey` enabler is unchanged (and `completeOptions` in server.ts is now the exact seam to add it to).
2. **BA15 idempotency** on message POST (S4 in demo, S3 if multi-user ever lands).
3. **F1 constrained outputs** (Wave 3 gated option) — extractor + typed repair are carrying the load successfully; revisit only if local-model JSON failure rates show up in the new `reason_code` telemetry.
4. **BA20/BA21** (sources-endpoint auth documentation; pgvector register_vector) — optional polish.
5. **Spot-checks** flagged ⚠️ above: B5 dedupe behavior under soft-delete, `.is-arrived` CSS presence, toast danger tone, CIT8 focusin wiring — each is a 2-minute look; none showed contrary evidence.

## 4. Recommended action order (from this re-baseline)

1. **N1 font licensing decision** — the only finding with external (legal) exposure; everything else is internal quality.
2. **N2 num_ctx probe + doc belt-and-braces + refresh committed audit doc** — protects the S1 fix that the whole local demo rides on.
3. N3/N4/N6 — sub-hour hygiene batch.
4. Then start Foundry Phase 1 (migration 0007) per `design/multi-provider-system.md`.

**Overall:** this remediation range is exceptional — 40+ findings closed, several beyond spec (pleasantry pre-router, citation auto-add invariant, per-mode skill splitting, provenance display), independent test evidence reproducing their claims (175+99 green in a fresh sandbox), and verification transcripts that match reality. The discipline their AGENTS.md demands is visibly operating. Fix the fonts and the num_ctx guarantee, and the codebase is in genuinely strong submission shape.
