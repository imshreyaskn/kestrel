# Product Requirements Document — The Lenny Growth Assistant (Codename: Kestrel)

| | |
|---|---|
| Version | 2.0 |
| Date | 2026-10-12 |
| Status | Implemented; v1 acceptance criteria in §9 |
| Repository state | commit `223e0e4` |
| Companion documents | `architecture.md` (system design) · `design.md` (UI system) · `manual-test-plan.md` (human verification) · `../IMPLEMENTATION_SPEC.md` (canonical build specification) · `../README.md` (operator guide) |

---

## 1. Executive summary and product thesis

Kestrel is an evidence-first growth research workbench built on the Lenny's Podcast transcript corpus. It exists because product teams face a two-sided failure: re-skimming hours of transcripts is expensive, and generic assistants answer podcast questions by inventing plausible things guests never said.

The product thesis is a division of intelligence:

- **Archive knowledge.** Claims about what a guest said, what a company did, or what an episode covered must be grounded in retrieved transcript evidence and carry a citation the reader can open.
- **Labeled reasoning.** The assistant is expected to think — synthesize, extrapolate, challenge, apply evidence to the reader's situation — provided its own analysis is framed as analysis and never attributed to the archive.

Kestrel is therefore a conversational growth-research companion, not a retrieval front end. Its defining behavior is what it does when the archive runs out: it names the gap, offers the nearest angle the evidence does support, and refuses to fill the space with invention.

### Core product journey

```text
ask a growth question  →  read a grounded answer with clickable evidence
                       →  cast a deliverable (Growth Brief · essay · plate)
                       →  edit, version, and export the deliverable
```

### Product promise

Every substantive claim is either cited to a stored transcript passage or visibly labeled as the assistant's reasoning. Every deliverable renders inside the product. Every failure is explained in plain language with a recoverable next step.

---

## 2. Forward deployment brief

This section is the discovery brief required by the engagement contract (assignment §2), recorded before implementation and updated to reflect the shipped system.

### 2.1 User and problem

**Primary user.** A product manager, growth lead, or founder on a small team that treats Lenny's Podcast as a reference library. The user is not an engineer and should never need to think about prompts, models, chunking, or retrieval.

**Job to be done.** Turn a specific business situation ("our B2B trial activation is flat") into a defensible point of view, backed by what credible practitioners actually said, and produce written artifacts that can circulate without further editing.

**Pain removed.**

| Pain today | Kestrel's removal |
|---|---|
| Hours spent skimming transcripts and show notes for the one relevant passage | Retrieval over the full corpus returns the exact passages, ranked |
| AI answers that sound confident and cite nothing, or cite wrongly | Every archive claim carries an openable citation resolved from the stored chunk |
| Advice detached from the team's actual context | User product context is accepted, labeled, and fenced off from transcript evidence |
| Research dying in chat logs | Structured, versioned deliverables: Growth Briefs, essays, Markdown/HTML plates |
| Uncertainty about whether an answer is invented | Explicit insufficient-evidence states; the system abstains rather than improvises facts |

**Secondary users.** The client engineer who operates the deployment (README, handoff sections, Makefile contract), and the evaluator who must understand, run, test, and trust the system quickly (this document set, verification transcripts, reproducible test commands).

### 2.2 Success metrics

Each metric states its definition, measurement method, and current status. Targets derive from `../IMPLEMENTATION_SPEC.md` §7.7 and §12.6; they are gates to run, not claimed results.

| # | Metric | Definition | Measurement | Status |
|---|---|---|---|---|
| M1 | Relevant-source recall | Recall@5 over the 20-case curated fixture | `make benchmark` against the ingested corpus | Target ≥ 80%; mechanism shipped; run requires live corpus + Ollama |
| M2 | Citation support rate | Share of reviewed substantive claims actually supported by their cited passage | Sampled human review (identity validation is automated; semantic support is not — see risk R2) | Target ≥ 90%; method defined, campaign pending |
| M3 | Dangling citation markers | Markers in persisted answers that resolve to no note | Zero by construction: the reconciler strips invalid labels and auto-adds omitted ones before persistence | Enforced; unit-tested (`tests/unit/agent_client/test_validator.py`) |
| M4 | Honest-abstention accuracy | Unsupported fixture questions answered with `insufficient_evidence: true` | `tests/evaluation/test_retrieval_benchmark.py` unsupported cases | Mechanism shipped and tested |
| M5 | Structured-output validity | Share of generations passing validation without repair, and without repair failure | `reason_code` telemetry on every failed first pass (JSON_PARSE, ESSAY_LENGTH, EMPTY_ANSWER, INVALID_LABELS, TRUNCATED, ARTIFACT_STYLE) | Instrumented; rates collectible from logs |
| M6 | Run failure rate | Terminal `failed`/`cancelled` assistant rows per 100 runs | SQL over `messages.status` | Instrumented |
| M7 | Evaluator time-to-first-answer | Minutes from clone to a grounded answer on screen | One-command startup (`./start.sh` / `.\start.ps1`) + README quickstart | Mechanism shipped; timed walkthrough in `manual-test-plan.md` MT-01 |
| M8 | Provenance completeness | Persisted citations resolving to a stored chunk with rank and fused score | `message_sources` rows + `evidence_rrf_scores` metadata | Enforced by pipeline; surfaced in UI |

### 2.3 Assumptions

Recorded because the client brief was incomplete. Each was made explicitly and is revisitable.

1. **Single-user local deployment.** v1 authenticates with a server-owned demo identity (`DEMO_USER_ID`). Session ownership is enforced per request so the authorization layer is real; only the authentication layer is a stub. Multi-user requires an identity provider, not a rewrite.
2. **Corpus is the upstream transcript repository.** `ChatPRD/lennys-podcast-transcripts` at sync time. No paywalled newsletter content, no video processing, no web fetching.
3. **English-only corpus and UI.** The retrieval pipeline uses an English tsquery configuration; no translation layer is in scope.
4. **Local-first demo.** Ollama on the host is mandatory for the submitted demo (assignment §3.2). Cloud providers are configuration, not infrastructure dependencies.
5. **Small local models are a floor, not a target.** The default `qwen2.5:1.5b` demonstrates the offline path; deliverable-heavy modes declare `min_model_tier: mid` and the UI documents this.
6. **Editors, not engineers, read the output.** All user-facing copy avoids model and provider jargon; technical detail lives in logs, provenance metadata, and these documents.
7. **Generated content is hostile until proven otherwise.** Model output and transcript text are both treated as untrusted inputs at every boundary (assignment security expectation).

### 2.4 Scope choices

**Included (v1).**

| Area | Included |
|---|---|
| Conversation | Sessions with independent context, SSE stage streaming with heartbeat, strike/cancel, idempotent replay |
| Grounding | Hybrid retrieval (dense HNSW + sparse GIN + weighted RRF), request-scoped evidence labels, citation reconciliation, provenance display |
| Deliverables | Growth Briefs (typed, versioned), Ship 30 for 30 essays (skill-driven, length-gated), Markdown/HTML plates (sanitized, sandboxed), mermaid diagrams in Markdown |
| Providers | Ollama local; Gemini, Anthropic, OpenAI cloud; explicit switching; no silent fallback |
| Operations | One-command startup scripts, Docker Compose topology, migrations at boot, JSON logs, health probes, Makefile command contract |
| Quality | 176 backend unit tests + 3 evaluation tests, 102 frontend tests, security payload tests, evaluation fixture |

**Excluded (deliberately, with reasons).**

| Excluded | Reason |
|---|---|
| Multi-user authentication | Out of scope for a local demo; ownership model is auth-ready (§2.3.1) |
| Token-level streaming | Stage-level SSE with heartbeat covers the honesty requirement; token streaming is a UX upgrade, not a correctness one |
| In-app credential management (named key profiles, activation, live verification, dynamic model discovery) | Fully designed (`docs/proposals/multi-provider-credential-management.md`); intentionally deferred beyond v1. Environment-configured keys meet the assignment contract |
| Agentic retrieval (model-invoked search tools) | Empirically rejected: Ollama ignores forced `tool_choice` on small models (transcript 016). Deterministic retrieval is the reason the offline path works — see ADR-001 |
| JavaScript-bearing artifacts | v1 renders visual HTML/CSS only; interactive artifacts require a separate isolation ADR (spec §9.1) |
| Dark mode | Paper-first metaphor; a token set is specified in `../uiux-research/` for v2 |
| UI states tray in production | Removed for the production demo (`7050b29`); the tour fixture data was subsequently deleted from the bundle |

### 2.5 Risks and trade-offs

| # | Risk | Exposure | Mitigation in v1 | Residual |
|---|---|---|---|---|
| R1 | Hallucinated facts or citations | Credibility — the core product promise | Three-tier epistemic prompt; server-owned evidence labels; reconciliation strips hallucinated IDs and auto-adds omitted ones; excerpts read from stored chunks; abstention states | Semantic mis-support (a real passage cited for a claim it does not carry) is not machine-checkable — M2 sampling campaign required |
| R2 | Citation identity vs semantic support | Silent quality drift | Spec-mandated honesty: identity validation is automated; support validation is an evaluation activity | Until M2 runs, support rate is unmeasured |
| R3 | Local small-model output quality | Demo reliability | Hardened JSON extractor; typed single repair with true failure reasons; stop-reason truncation detection; prose fallback for conversational turns; model-tier guidance | Essay mode on 1.5B remains unreliable by design; documented, not hidden |
| R4 | Context truncation on local path | Silent grounding loss | Explicit `num_ctx` (16384) and output caps per provider; token-budgeted history (4k local / 20k cloud) | The `/v1` options passthrough is version-dependent; host `OLLAMA_CONTEXT_LENGTH` documented as the guaranteed mechanism; probe in MT-17 |
| R5 | Unsafe artifact rendering | XSS in the operator's browser | nh3 allowlist (68 tags), CSS sanitization, injected CSP, `sandbox=""` iframes, server-side preview derivation, payload tests | None known for v1 scope; SVG intentionally excluded |
| R6 | Diagram renderer supply chain | XSS via mermaid CVEs | Pinned version, `securityLevel: 'strict'`, in-band `%%{init}%%` directives stripped, rendered SVG displayed only inside a sandboxed opaque-origin frame | Keep the pin current; isolation contains renderer zero-days |
| R7 | Latency (local inference, 120s ceiling) | Perceived quality | Stage telemetry maps 1:1 to real pipeline phases; 15s SSE heartbeat; strike is one click | Long local generations remain slow; provider switch is the user's lever |
| R8 | Corpus drift upstream | Stale or vanished evidence | Content-hash idempotency; chunk soft-deactivation preserves historical citations; inactive-source reconciliation with wipeout guard | Re-embedding on embedding-model change is manual (`make reindex`) |
| R9 | Secret handling | Key leakage | Keys server-side only; browser sends enums and allowlisted IDs; redacted error envelopes; logs carry counts and IDs, never prompt bodies or secrets; startup scripts reject published placeholder tokens | `.env` on the operator's disk is the trust root, as with any self-hosted system |
| R10 | Font redistribution rights | Legal exposure if the repository is redistributed | Self-hosted files under `frontend/public/fonts/` | Redistribution rights for the display faces must be confirmed before external distribution; see `design.md` §2.2 |
| R11 | Concurrent edit loss | Deliverable corruption | ORM `version_id_col` optimistic locking on briefs and artifacts; 409 with reload guidance | None for v1 scale |
| R12 | Duplicate submission on retry | Doubled turns, doubled cost | `Idempotency-Key` / `X-Idempotency-Key` headers; DB-backed partial unique index; replay returns the stored turn | Keys are client-supplied; UI adoption is partial (API-complete) |

---

## 3. Product principles

These govern conflicting decisions. Ordered by precedence.

1. **Evidence before eloquence.** A shorter, fully cited answer beats a polished uncited one. When the archive is silent, the product says so.
2. **One number, one truth.** A citation's identifier is identical in the answer text, the bead, the margin note, and the database rank. Nothing renumbers between layers.
3. **Deterministic where it matters.** Routing, retrieval, validation, and persistence are backend-owned. The model's discretion is confined to composing the answer.
4. **Failures are sentences, not codes.** Every terminal state carries a plain-language explanation and a next step. Error codes exist for machines; copy exists for people.
5. **Security is a design feature.** The sandbox posture is explained in the UI and in these documents, not merely implemented.
6. **The resting page is still.** Motion responds to causes; nothing animates idly.
7. **Documentation matches the tree.** No document describes planned behavior as completed; verification claims carry the command that produced them.

---

## 4. Users and journeys

### 4.1 Personas

| Persona | Context | Primary need |
|---|---|---|
| Maya — PM at a seed-stage B2B tool | Prepares a growth review; watched four relevant episodes, remembers none precisely | Fast, citable recall of what guests actually recommended, applied to her context |
| Devon — founding marketer | Writes a weekly newsletter; needs a defensible angle | Essays and one-pagers that read as authored, with sources attached |
| Priya — client engineer | Receives the deployment | Run, test, troubleshoot, extend without archaeology |

### 4.2 Journeys

**J1 — Grounded research turn.** Maya asks a growth question. Stages stream: consulting the archive → drafting → verifying citations → binding. The answer arrives with numbered beads; hovering peeks the quote; clicking draws the leader line and expands the margin note with rank and fused score. Failure states: insufficient evidence (honest gap + nearest supported angle + reframed question), generation error (typed envelope + retry or switch provider), strike (nothing persisted, recompose offered).

**J2 — Follow-up.** "Why does he put retention first?" The query is deterministically expanded with prior-turn context before retrieval; citations from the same episode cluster surface. No user restatement required.

**J3 — Growth Brief.** Maya switches the composer to Brief, adds product context (stage, metrics, constraints), and binds. The Fold opens: problem, research summary with evidence labels, recommendation, experiment plan (hypothesis, change, segment, success metric, guardrail, decision rule), risks, next deliverable. Badges mark each field's tier: user context, transcript evidence, assistant synthesis. She edits inline; each save increments the version; a conflicting save returns 409 with reload guidance.

**J4 — Essay.** Devon requests a Ship 30 for 30 essay, optionally with an explicit word target. The runtime skill governs structure (hook, 4A writing path, rate of revelation, takeaway). Length is gate-enforced: outside the band, the draft is repaired once with the true reason or rejected with `ESSAY_LENGTH_OUT_OF_RANGE` — never silently truncated.

**J5 — Plate.** "Cast an HTML one-pager from our brief." The artifact renders as a margin plate and in a full viewer (Preview/Source). HTML is sanitized server-side and sandboxed client-side. Markdown plates may include one mermaid diagram, rendered under strict isolation.

**J6 — Operator.** Priya clones, runs `./start.sh`, gets engine checks, model pulls, token generation, migrations, ingestion-if-empty, readiness polling, and an open browser. She reads the README troubleshooting table, runs `make test`, and extends via the seams listed in `architecture.md` §15.

---

## 5. Functional requirements

Verification column: `T:` automated test path · `MT-##:` manual test plan scenario.

| ID | Requirement | Acceptance criteria | Verification |
|---|---|---|---|
| FR-1 | Session lifecycle | Create, list (newest activity first), rename, delete with cascade; ownership enforced server-side on every access | T:`tests/unit/test_session_api.py` · MT-01, MT-15 |
| FR-2 | Message pipeline | User turn persisted before generation; assistant row transitions pending → complete/failed/cancelled; partial output never persisted as complete | T:`test_conversation_service.py` · MT-03, MT-14 |
| FR-3 | SSE streaming | Events: `run_started`, `stage` (5 phases), `completed`, `error`; 15s heartbeat comments; client disconnect cancels the run and marks it cancelled | T:`test_sse_heartbeat.py` · MT-03, MT-14 |
| FR-4 | Hybrid retrieval | Dense (pgvector cosine, HNSW) + sparse (tsvector, GIN), weighted RRF (k=60, 0.6/0.4), top-8, ≤3 per episode, near-duplicate suppression, request-scoped E-labels | T:`tests/unit/retrieval/` · MT-04 |
| FR-5 | Follow-up grounding | Short/anaphoric queries expanded with prior-turn context before retrieval | T:`test_conversation_service.py` · MT-05 |
| FR-6 | Conversational turns | Pure pleasantries/identity questions bypass retrieval (end-anchored pattern match) and receive warm, citation-free answers; non-JSON prose from small models is accepted for this class only | T:service tests · MT-08 |
| FR-7 | Insufficient evidence | Empty retrieval still generates; the model's honest-gap answer (or, on validation failure with zero evidence, the canned notice) carries `insufficient_evidence: true`; no fabricated citations possible | T:service + validator tests · MT-06 |
| FR-8 | Citation integrity | Every persisted `[E#]` resolves to a stored chunk; hallucinated IDs stripped; text labels omitted from the citations array auto-added; excerpts read from chunks, never model text; numbering identical across text, bead, note, and `retrieval_rank` | T:`test_validator.py` · MT-04, MT-15 |
| FR-9 | Growth Briefs | Typed five-section contract; experiment plan complete; versioned edits with optimistic locking; 409 on conflict; user context stored and badged separately | T:`test_growth_brief_and_artifact_*` · MT-09 |
| FR-10 | Essays | Runtime skill injected; word gate 1,150–1,350 default or ±10% of explicit user target (200–3,000); gate skipped on honest decline; writing path validated against the 4A enum | T:`test_validator.py` · MT-10 |
| FR-11 | Artifacts | Markdown and complete HTML/CSS; rendered beside chat (margin plate) and in a viewer with Preview/Source; HTML sanitized (nh3, 68-tag allowlist) with server-derived preview; CSP + `sandbox=""` isolation | T:`tests/unit/security/` · MT-11, MT-12, MT-21 |
| FR-12 | Mermaid | Fences in Markdown render via pinned mermaid, strict security level, init-directives stripped, displayed in a sandboxed opaque-origin frame; syntax errors fall back to preserved source | T:`mermaidSecurity.test.tsx` · MT-11 |
| FR-13 | Provider configuration | Local (Ollama) + three cloud providers; per-message provider/model from server-side allowlists; gateway re-validates against its catalog; switching explicit and visible; no silent fallback | T:`test_conversation_service.py` · MT-13 |
| FR-14 | Provider limits | Ollama requests carry `num_ctx` (default 16384) and `num_predict`; per-provider output caps (3072 local / 8192 Gemini / 8192 Anthropic / 4096 OpenAI); history token-budgeted (4k local / 20k cloud) after a 12-message cap | T:gateway client tests · MT-17 |
| FR-15 | Validation and repair | Hardened JSON extraction; typed failure reasons; at most one repair, told the true reason; stop-reason truncation detection; gateway provider errors surfaced as typed 502 | T:`test_json_extractor.py`, validator tests · MT-03 |
| FR-16 | Idempotent submission | `Idempotency-Key`/`X-Idempotency-Key`; partial unique `(session_id, idempotency_key)`; replay returns the stored turn | T:`test_wave_c_remediation.py` · MT-16 |
| FR-17 | Crash recovery | Startup sweep marks stranded `pending` rows `failed` with `SERVER_RESTARTED` | T:`test_wave_b_remediation.py` · MT-17 |
| FR-18 | Knowledge base operations | Sync (git shallow, tarball fallback with PEP 706 filter), parse, chunk (350–550 tokens, 60–100 overlap), embed (768-d, dimension-asserted at bootstrap), index (SHA-256 idempotent, per-file savepoints, chunk soft-deactivation, wipeout-guarded reconciliation); stats and reindex commands | T:`tests/unit/ingestion/` · MT-01 |
| FR-19 | Deliverables shelf | Right-hand dock lists bound briefs and plates; hidden when empty; collision-avoidant against the colophon popover | T:`artifactsDock.test.tsx` · MT-09 |
| FR-20 | Provenance display | Each citation note shows retrieval rank and fused RRF score; message metadata stores per-evidence scores and the skill stamp | T:service tests · MT-04 |

---

## 6. Workflow modes and output contracts

| Mode | Trigger | Output contract | Gates |
|---|---|---|---|
| `research` | Default | `answer_markdown`, `citations[]`, `scope`, `insufficient_evidence`, `follow_up_question` | Citation reconciliation; empty-answer rejection; scope coerces insufficiency when out-of-scope |
| `growth_brief` | Composer mode | Title, problem, research summary, recommendation, assumptions[], experiment{6 fields}, risks[], next deliverable, citations[] | Typed brief model on create and PATCH; optimistic version lock |
| `essay` | Composer mode | Title, `essay_markdown`, word count, `writing_path` (actionable/analytical/aspirational/anthropological), citations[] | Word gate; writing-path enum; decline exempts the gate |
| `artifact_markdown` | Composer mode | `kind`, title, `content`, `source_evidence_ids[]` | Non-empty title/content; style lint (emoji ban); evidence-ID filtering |
| `artifact_html` | Composer mode | Complete standalone HTML/CSS | Sanitization at save; sandboxed render; style lint |

All modes emit a single JSON object; the extractor tolerates documented small-model deviations (reasoning tags, fences, preambles). Contract version travels with every gateway request (`output_contract_version`).

---

## 7. Non-functional requirements

| Class | Requirement | Implementation |
|---|---|---|
| Performance | Retrieval ≤ 2 queries + in-memory fusion per turn; HNSW-indexed dense path; leader-line redraws coalesced | `architecture.md` §7 |
| Resilience | Typed envelopes for every failure class; retryable flag truthful; heartbeat through proxy idle windows; crash sweep on boot | `architecture.md` §13 |
| Security | Allowlist sanitization; CSP; sandboxed frames; fail-closed internal auth with timing-safe compare; parameterized SQL throughout; PEP 706 archive extraction; redaction at every boundary | `architecture.md` §10 |
| Accessibility | WCAG AA contrast on all text tokens (weakest pair 4.69:1); focus traps in modals; live-region stage announcements; keyboard parity for citation grammar; reduced-motion honored in CSS and JS | `design.md` §6 |
| Observability | JSON logs with request/correlation IDs across services; counts-not-content logging policy; provenance metadata per message | `architecture.md` §12 |
| Operability | One-command startup on Windows/macOS/Linux; Makefile contract matching spec §7.2; migrations at boot; loopback-only exposure | README · `architecture.md` §11 |
| Compatibility | Current Chrome/Edge/Safari/Firefox; `linear()` spring easings carry `@supports` fallbacks; graceful degradation without View Transitions | `design.md` §5 |

---

## 8. Requirements traceability (assignment → implementation → verification)

| Assignment clause | Implementation | Verification |
|---|---|---|
| §3.1 FastAPI backend | `backend/` — routers, services, typed envelopes, health endpoints | `tests/unit/test_api_endpoints.py`; `/api/v1/health/*` |
| §3.1 Agent layer (Pi) | `agent-gateway/` on `@earendil-works/pi-ai`; ADR-001 (+ amendment) | `tests/unit/agent_client/`; transcript 002/016 |
| §3.1 Sessions/persistence in PostgreSQL | `chat_sessions`, `messages` (seq, idempotency, status lifecycle), migrations 0001–0006 | `test_session_*`; MT-15, MT-16 |
| §3.2 Flexible LLM configuration | Provider enums → server-side allowlists; colophon switching; `.env` configuration; `GET /api/v1/providers` | `test_conversation_service.py`; MT-13 |
| §3.2 Local LLM mandatory | Ollama path with explicit context/output limits; live-verified (transcripts 001, 016) | MT-17 |
| §3.3 Knowledge base | Ingestion CLI + hybrid retrieval + E-labels + `message_sources` provenance | `tests/unit/ingestion/`, `tests/unit/retrieval/`; MT-01, MT-04 |
| §4.1 Grounded assistant w/ follow-ups + honest gaps | FR-4…FR-8 | MT-03…MT-08 |
| §4.2 Ship 30 for 30 skill | `runtime-skills/ship-30-for-30/SKILL.md`, versioned loader, skill stamp, word gate | `test_prompts_and_skills.py`; MT-10 |
| §4.3 Artifacts + in-app viewer | Plates beside chat; viewer with Preview/Source; FR-11/FR-12 | `tests/unit/security/`; MT-11, MT-12 |
| §4.3 Security expectation | `architecture.md` §10; README "Artifact Security" (permits/blocks/why) | Payload tests; MT-21 |
| §5 One-command startup | `start.sh` / `start.ps1` / `start.bat`, `make demo` | MT-01 |
| §5 Configuration | `.env.example` (all variables documented); placeholder-token rejection at bootstrap | MT-01 |
| §5 Observability | JSON logs, request IDs, stage telemetry, provenance metadata | `architecture.md` §12; MT-22 |
| §5 Resilience | Risk register R3/R4/R7 + resilience matrix (README, `architecture.md` §13) | MT-14, MT-17 |
| §5 Handoff | README + this document set + `agent-transcripts/` + Makefile contract | Evaluator walkthrough MT-01…MT-22 |
| §6 Deliverables 1–7 | Repository, README, this PRD, `design.md`, `architecture.md`, transcripts, tests | Present at HEAD |
| §6 Deliverable 8 (demo video) | Recorded separately; script and shot list maintained outside the repository | — |

---

## 9. v1 acceptance

The build is accepted when all of the following hold on a fresh clone:

1. `./start.sh` (or `start.bat`) takes a clean machine from clone to open browser with an ingested corpus, generating its own `INTERNAL_SERVICE_TOKEN` — MT-01.
2. A research turn on the local provider returns a cited answer; a follow-up stays grounded; an archive-gap question abstains — MT-03…MT-08.
3. A Growth Brief round-trips: compose, open the Fold, edit, save (version increments), conflict on stale save returns 409 — MT-09.
4. An essay on a mid-tier-or-above provider passes the word gate; a short-target essay honors the target — MT-10.
5. A Markdown plate with a mermaid fence renders; an HTML plate renders sanitized and sandboxed with devtools-verified isolation — MT-11, MT-12, MT-21.
6. Provider switching works both directions with visible state and no silent fallback — MT-13.
7. Killing Ollama, the gateway, or the API mid-run produces typed, truthful errors; restarting the API sweeps stranded pendings — MT-17.
8. `make test`, `make lint`, `make typecheck`, and the frontend suite pass — recorded counts: 176 + 3 backend, 102 frontend.
9. No secret, prompt body, or transcript passage appears in logs or error responses — MT-22.

---

## 10. Beyond v1

Ordered by product value per unit of risk:

1. **Semantic citation-support evaluation (M2).** A sampled review campaign or judge-assisted pipeline measuring whether cited passages actually carry their claims. The highest-value quality instrument not yet built.
2. **Constrained output decoding.** Evaluated and rejected for the local path (Ollama ignores forced `tool_choice` on small models — transcript 016); remains viable for cloud providers via native structured-output APIs. Revisit per provider, keeping the extractor as the floor.
3. **In-app credential management.** Named key profiles, one-active semantics, live verification, catalog-driven model discovery. Design complete (`docs/proposals/multi-provider-credential-management.md`); deferred by scope decision (§2.4).
4. **Token-level streaming.** Upgrade stage telemetry to incremental answer streaming; the SSE and cancellation plumbing already exist.
5. **Multi-user identity.** Replace the demo stub; ownership checks and the `user_id` column are already in place.
6. **Dark mode ("roast aubergine").** Token set specified in design research; components avoid hard-coded bone.
7. **Retrieval upgrades.** Threshold calibration from benchmark distributions; optional reranking for synthesis-heavy queries.

---

## 11. Decision log

Significant decisions and their evidence live in `../docs/ADRs/` and `../agent-transcripts/`. Index of record:

| Decision | Location |
|---|---|
| Pi AI gateway over the Anthropic-only SDK; deterministic retrieval over an agent tool loop | ADR-001 (with 2026-10-12 amendment) |
| Forced-tool-call structured output rejected for local models | transcript 016 |
| Companion epistemics (labeled reasoning alongside cited archive facts) | `../backend/app/agent_client/prompts.py` base instructions; `audits/kestrel-harness-audit.md` (A5) |
| Citation numbering unified on retrieval rank | `../frontend/src/lib/citeInline.ts`; `audits/citation-system-audit.md` |
| States tray removed from production builds | commit `7050b29` |
