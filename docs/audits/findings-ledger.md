# Kestrel Harness Audit — Living Findings Ledger (v0.2 — decisions applied)

Status legend: **C1** confirmed-by-code · **C2** confirmed-externally (pi-ai@1.1.0 package inspected) · **S3** suspected, needs runtime
Severity: **S1** critical · **S2** high · **S3** medium · **S4** low
Fix type: **patch** (local) · **structural** (redesign of a component/flow)

## Decisions recorded (product owner, audit conversation)
1. **Kestrel is a conversational growth-research companion** — converses, clarifies, and *thinks on its own*: retrieved data is a base, and the model adds its own intelligence. Not a RAG presentation tool.
2. **Capability self-description**: choose highest-intelligence option → decided: **prompt-side capability card** (model self-describes accurately; UI keeps deterministic mode buttons).
3. **Deterministic retrieval stays** (no agent tool loop, no second-search callback in v1).
4. **Multi-provider is the architecture**; current workhorses: qwen2.5:1.5b (local) + Gemini (cloud) → context/output limits must be provider-aware, not local-only.
5. Tie-breaker for all open choices: **highest intelligence ROI without unwanted complexity**.

## Consequential status/severity changes in v0.2
- **NEW A5 (C1, S1, structural-prompt)**: BASE_SYSTEM_INSTRUCTIONS principle 1 ("All substantive claims ... must be grounded directly in the provided transcript evidence") *forbids* the companion behavior in decision 1. Only SKILL.md (essay mode) has the correct three-way epistemics (source claim / labeled synthesis / proposed application). Fix = base-prompt rewrite (full text in audit report §4). Highest intelligence-ROI change in the audit; zero new machinery.
- **A1 severity S2→S1**: a conversational companion whose greeting path is corpus-accidental and whose honest-gap answers are a single canned string contradicts the core thesis. Fix direction locked: delete the pre-generation abstention gate; always generate with (possibly empty) evidence; canned string demoted to last-resort fallback when output validation fails on a zero-evidence run. Spec §11.2 satisfied by the model's `insufficient_evidence: true` output, not by skipping generation; test `test_conversation_service_abstains_when_evidence_empty` must be rewritten (documented reason: product decision 1).
- **C2 severity S2→S1** (same root as A1).
- **B1 remains S1**, fix upgraded from "host env var" to verified per-request mechanism: pi-ai `samplingParams` merges as-is into the OpenAI-compatible body (openai-completions.js:748-750) → `samplingParams: { options: { num_ctx } }` reaches Ollama; plus `maxTokens` option (types.d.ts:134, sent as max_tokens/max_completion_tokens at openai-completions.js:588-594). Host `OLLAMA_CONTEXT_LENGTH` kept as deploy-level fallback.
- **F1 fix path concretized**: pi-ai constrained sampling works via **forced tool calls** (types.d.ts:246 `toolChoice`, :552 `tools`; constrained-sampling.js `resolveGrammarConstrainedSampling`), not plain completions. Wave-3 structural option: single `submit_response` tool per mode with strict JSON schema; would retire extractor-as-necessity, reminder, and most repair traffic. Requires live check on qwen2.5:1.5b + Gemini.
- **E2 refined**: essay word gate must skip when `insufficient_evidence: true` (honest decline can't be 1,150 words) — interlocks with A1 fix.
- **A4 decided**: prompt-side capability card (text in report §4).
- **G6 decided**: compose passes through with no model defaults (`${VAR:?}` for token; model vars backend-only); gateway's unused `*_MODEL` envs deleted.

> Full fix directions, steps, and code/prompt snippets for every entry: **kestrel-harness-audit.md**.

## A. Identity & self-awareness
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| A1 | C1 | conversation_service.py:402 vs prompts.py:21, server.ts:243-244 | Greeting/identity contract unreachable when retrieval is empty: deterministic abstention fires before any model call, yet system prompt promises "respond warmly as Kestrel" and gateway has a no-evidence "respond warmly" reminder branch that is dead code. Live behavior depends on corpus accident (whether "hello" sparse-matches transcripts). | S2 | structural: intent pre-routing before retrieval |
| A2 | C1 | prompts.py BASE_SYSTEM_INSTRUCTIONS principle 4 vs mode schemas | Base prompt instructs model to set `scope` for all turns, but essay/growth_brief/artifact schemas contain no `scope` field. Instruction–contract contradiction. | S3 | patch: scope rules into research-mode section only |
| A3 | C1 | prompts.py vs server.ts fallbackSystemPrompt | Two identity/persona/schema definitions. Fallback is unreachable in production (backend always sends system_prompt) = untested divergent personality. | S3 | patch: make system_prompt required; delete fallback |
| A4 | C1 | prompts.py (whole) | Model is never told the 5 workflow modes, artifacts, or briefs exist → cannot accurately self-describe capabilities; UI vocabulary ("plates", "cast", "bind to archive") absent from prompt. | S3 | patch: capability paragraph for identity/help turns |

## B. Context engineering
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| B1 | C2+S3 | server.ts (`models.complete(model, ctx)`, no options) + pi-ai dist (0 hits for `num_ctx`) + repo (no OLLAMA_CONTEXT_LENGTH) | Nothing sets Ollama context length or max output tokens. System prompt alone (~4-5k tokens with 8 evidence chunks) exceeds plausible Ollama defaults (2k/4k) → silent front-truncation of identity/grounding/schema on the default local path. Essay output (~1.7k tokens) may also truncate. | S1 | structural: token budgeting + explicit num_ctx/maxTokens |
| B2 | C1 | conversation_service history build; citeInline.ts | Stale citation IDs: persisted assistant text contains inline [E#] from prior runs; IDs are request-scoped, so history's E1 ≠ current E1. Contradictory referents replayed as plain text; UI renders unknown markers literally. | S2 | structural: unique labels per turn (e.g. T3E1) or strip markers from history |
| B3 | C1 | conversation_service.py retrieval call (`query=content`) | Retrieval ignores conversation context; follow-ups retrieve on pronouns. Spec §7.5(1) reformulation unimplemented; fixtures contain follow_up cases. | S2 | structural: query reformulation stage |
| B4 | C1 | hybrid_search.py:277 (`insufficient = len(items)==0`) | Sufficiency is binary, uncalibrated; top_dense_score computed but unused; any single weak match = "sufficient". | S3 | structural: calibrated threshold/count per §7.5(7) |
| B5 | C1 | chunker (75-token overlap) + compute_rrf_fusion (chunk_id dedupe only) | Near-duplicate chunks not removed (spec §7.5(6) violation); up to 3 overlapping chunks/source waste evidence slots. | S3 | patch: char-range/content-hash overlap suppression |
| B6 | C1 | gateway payload vs system prompt | Evidence sent twice (embedded in system_prompt AND as payload array; array ignored when system_prompt present); two divergent formatters (prompts.py vs server.ts evidenceText). | S4 | patch: single formatter, drop unused field or use it |
| B7 | C1 | context contents | No current date/time, no mode/provider labels on history turns, artifact content invisible to later turns ("Created HTML artifact: title"). | S4 | patch: add date line; consider artifact summaries |

## C. Unambiguous-query handling
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| C1 | C1 | routing design | Deterministic UI-mode routing, no mid-run clarification, server-side defaults — good; consistent with spec §3.3. No findings against directness itself. | — | — |
| C2 | C1 | ABSTENTION_ANSWER usage | Clear conversational queries ("hello", "thanks") can receive canned "Not in the archive" — a non-answer to a query that needed no evidence. Same string used for out-of-scope ("pasta recipe") = category error (missing-evidence copy for a scope refusal). | S2 | covered by A1 structural fix |
| C3 | C1 | sessions.py MessageRequest + strip | Whitespace-only content passes min_length=1, is stripped to "", persisted as empty user message, answered with canned abstention instead of 422. | S4 | patch: validate post-strip |

## D. Tool engineering (pipeline-stage engineering; agent has zero runtime tools)
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| D1 | C1 | architecture | No model-invoked tools by design (spec §6.6 endorses deterministic retrieval for small models). Minimum-tooling trivially satisfied. Optional second-search callback unimplemented (was optional). | — | — |
| D2 | C1 | prompts.py:64 + validator.py:26 + conversation_service.py:464 | Repair prompt hardcodes "rejected because it was not a single valid JSON object" but the same path fires for EssayLengthError (subclass of StructuredExtractionError). Repair gives no length guidance; zero test coverage for repair flow. | S2 | patch: typed failure reasons → tailored repair text |
| D3 | C1 | gateway_client.py:150 | `stop_reason` returned by gateway but discarded → truncation indistinguishable from malformed output → blind repair likely re-truncates. | S2 | patch: propagate stopReason; typed TRUNCATED handling |
| D4 | C1 | ADR-001, package.json, spike.ts | Docs claim "agent tool loop" via Pi Coding Agent SDK; `pi-coding-agent` dependency unused; spike tool is a mock. Violates own AGENTS.md ("don't describe planned behavior as completed"). | S4 | patch: align ADR/deps with reality |
| D5 | C1 | hybrid_search sparse fallback | Sparse SQL failure silently degrades to dense-only (logged warning) — reasonable recovery. Embedding failure → retryable envelope — fine. | — | — |

## E. Response engineering
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| E1 | C1 | validator.filter_valid_citations | Inline [E#] labels in answer text never validated against evidence map (only citations array pruned). Spec §7.6 violation; dangling markers surface as literal text in UI. | S2 | patch: regex-scan answer text; strip/flag unknown labels (feeds B2 structural fix) |
| E2 | C1 | validator essay gate vs spec §8.4 | Hard 1,150–1,350 gate with no "user explicitly requested another length" override (spec allows it) → 422 loop for legitimate short-essay requests. Word count includes [E#] tokens. | S3 | patch: override flag + marker-aware count |
| E3 | C1 | validator research branch | Empty `answer_markdown` passes validation (defaults "") → empty assistant message persisted as complete. | S3 | patch: non-empty check or route to repair |
| E4 | C1 | research schema wording | "Detailed, synthesis-rich" biases verbose answers for simple factual queries; no length calibration per query type. | S4 | patch: proportionality instruction |
| E5 | C1 | server.ts userPromptReminder | Reminder appended to live user turn but not persisted → replayed history diverges from what model actually saw. | S4 | patch: move into system prompt tail |
| E6 | S3 | streaming design | Stage-only SSE, no token streaming; first content at full-generation latency (timeout 120s). Product choice, flag for UX. | S4 | optional |

## F. Prompt engineering (architecture + duct-tape inventory)
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| F1 | C1 | json_extractor.py (whole) | Progressive-heuristics extractor is a patch layer for "small model won't start with {" — repo's own transcript 001 shows qwen2.5:1.5b emitting prose preamble despite STRICT JSON rule. pi-ai ships constrained-sampling support (dist/api/constrained-sampling.js) — root-fix candidate. | S2 | structural: constrained decoding / structured outputs |
| F2 | C1 | prompts.py principle 5 vs observed behavior | Format rule is last and most-violated; priority order reflects product values, not failure statistics. No grammar/format enforcement at API level. | S3 | covered by F1 |
| F3 | C1 | server.ts fallback prompt | Duct tape for a can't-happen case (see A3). | S3 | patch |
| F4 | C1 | repair prompt narrative | Duct tape fixing one observed failure text (bad JSON) that misfires on the other class it serves (length) — see D2. | S2 | patch |
| F5 | C1 | ABSTENTION_ANSWER | Static string patches over absent intent routing; one voice for three distinct situations (no evidence / greeting / out-of-scope). | S3 | covered by A1 |
| F6 | C1 | conversation_service +1µs timestamp | Micro-patch for pair ordering; benign but sequence column is the ground-up fix. | S4 | optional |

## G. Architecture around the prompt
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| G1 | C2 | docker-compose.yml:34,65 vs pi-ai catalog data | Default `ANTHROPIC_MODEL=claude-sonnet-latest` NOT in pi-ai@1.1.0 anthropic catalog (contains claude-sonnet-4-5/4-6/5/5-5 only). Default compose deploy on anthropic → gateway 404 → flattened to "Generation failed unexpectedly. Retry" (retryable=true, misleading). config.py already knew ("not present in the catalog") — compose contradicts it. Spec §3.2 example also stale. | S2 | patch: compose default → claude-sonnet-5; typed error mapping |
| G2 | C1 | gateway_client error mapping | All gateway 4xx (missing API key, bad token, model not found, 413 payload) → generic retryable GENERATION_FAILED. Retryability lies for config errors. | S3 | patch: map status/error codes to typed non-retryable envelopes |
| G3 | C1 | api/v1/__init__.py + config.py:52,73 + providers.py | Duplicate GET /api/v1/providers; config.py route shadows providers.py (registration order); winner leaks `str(e)` (violates own redaction policy); loser is dead code. | S3 | patch: delete one, redact |
| G4 | C1 | server.ts:24 (2mb limit) + unbounded history | No token budgeting anywhere (spec §8.6 "keep prompt payload bounded"); 12 msgs × essays/10k-char inputs + evidence can exceed 2mb → 413 → misleading retryable error. | S3 | structural (same budget fix as B1) |
| G5 | S3 | server.ts history reconstruction | All history assistant turns relabeled with CURRENT provider/api/model, fabricated zero usage, Date.now() timestamps. Mid-session provider switch may break openai-responses replay or skew logs. | S3 | needs verification: read pi-ai transform-messages or live test |
| G6 | C1 | config truth drift | 4 sources disagree (spec example, .env.example, config.py, compose defaults) incl. GEMINI_MODEL 2.0/3.5-lite/3.8; gateway receives unused *_MODEL envs and its error text advises setting them. | S3 | patch: single canonical source |
| G7 | C1 | session_service.get_session_messages + frontend api.ts | Ascending pagination, default limit 200, frontend passes no offset → sessions >200 msgs reload showing OLDEST 200. | S3 | patch: newest-page default |
| G8 | C1 | compose INTERNAL_SERVICE_TOKEN | Published placeholder default; fail-closed only when unset. Mitigated: gateway not host-published except loopback dev override. | S4 | patch: require explicit token in compose |

## H. Personality
| ID | Status | Component | Finding | Severity | Fix |
|----|--------|-----------|---------|----------|-----|
| H1 | C1 | overall | Tone coherent and function-supporting: honest-abstention voice, SKILL.md bans fake certainty/anecdotes/AI-recap, no sycophancy anywhere, brief schema forces guardrails + decision rules. Strong. | — | — |
| H2 | C1 | abstention moments | Personality is most scripted exactly where prompt promises it live (A1/F5): one canned string for all failure shapes; repetition reads evasive over time; out-of-scope gets missing-evidence copy (category error). | S3 | covered by A1 |
| H3 | C1 | server.ts fallback | Second, colder personality definition (no warmth/scope rules) — drift risk if ever reached. | S3 | covered by A3 |

## Open decisions (drive severities/fix choices)
1. Product intent: conversational companion vs pure retrieval instrument? (A1/C2/H2)
2. Is local (qwen2.5:1.5b + Ollama defaults) the primary demo path? (B1 severity)
3. Appetite for the three structural fixes (constrained decoding, intent routing, token budgeting) vs hardening patch layers? (F1/A1/B1)
4. Canonical config source? (G1/G6)

## Checks not completable statically
- Live greeting/abstention outcomes vs real corpus; actual Ollama default num_ctx on target host version.
- Essay mode e2e on qwen2.5:1.5b (output-token ceiling vs 1,250 words).
- Recall@5 vs §7.7 target (≥80%) — needs ingested corpus + DB.
- Semantic citation-support rate (spec: identity validation ≠ support validation) — needs sampling/LLM-judge.
- Browser verification of sandbox/CSP (§9.1).
- pi-ai constrained-sampling compatibility with Ollama + Gemini paths (tarball on hand; can inspect on request).
