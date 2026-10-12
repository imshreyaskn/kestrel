# Manual Verification and Evaluation Test Plan

| | |
|---|---|
| Version | 3.0 |
| Date | 2026-10-12 |
| Repository state | commit `223e0e4` |
| Audience | The evaluator, and any engineer verifying a deployment by hand |
| Relationship to automated tests | The suites (176 + 3 backend, 102 frontend) prove contracts and units. This plan proves the assembled product: the full stack, a real browser, a real corpus, and a real local model. Scenarios do not duplicate what automation already covers except where the end-to-end path is the point |

Record results in the sign-off table (§4). Capture evidence where the scenario asks for it — screenshots and log excerpts make the evaluation reproducible.

---

## 1. Environment readiness

Prerequisites: Docker with Compose; Ollama running on the host; approximately 15 GB free disk for the corpus and models; a Chromium-class browser (View Transitions) plus, for MT-19, a screen reader if available (VoiceOver, NVDA, or Orca).

```bash
git clone https://github.com/imshreyaskn/kestrel.git && cd kestrel
ollama pull qwen2.5:1.5b
ollama pull embeddinggemma
./start.sh            # Windows: start.bat   (or: cp .env.example .env, edit token, make demo && make ingest)
```

| Check | Command or action | Expected |
|---|---|---|
| Engine and models | script output | Docker active; both models present or pulled; `.env` created with a generated `INTERNAL_SERVICE_TOKEN` (verify it is not the example placeholder) |
| Migrations | script output, or `alembic upgrade head` visible in `docker compose logs api` | Applied without error |
| Readiness | `curl -s localhost:8000/api/v1/health/ready | jq .` | `status: "ready"`; components database `up`, ollama `up`, agent_gateway `up` |
| Corpus | `curl -s localhost:8000/api/v1/ingestion/status | jq .` | `total_sources` > 300, `total_chunks` in the thousands, `active_sources` = `total_sources` |
| Providers | `curl -s localhost:8000/api/v1/providers | jq .` | `local.status: "ready"` with the model list; cloud `configured` only where a key exists |
| UI | browser at `http://localhost:5173` (the startup script opens it) | Frontmatter view: hero, star note, composer dock; no console errors |

Timing note for M7 (PRD): record the wall-clock time from `./start.sh` to the open browser on a warm cache, and the duration of the first `make ingest`.

## 2. Test scenarios

Each scenario lists steps, expected results, and evidence to capture. Stop on the first hard failure in a scenario and record it.

### MT-01 — One-command startup and first run
Covered by §1. Additionally: reboot the machine (or `docker compose down && ./start.sh`) and confirm the corpus survives (named volume) and startup skips re-ingestion because chunks are already indexed.
Evidence: script transcript; `ingestion/status` output before and after reboot.

### MT-02 — First impression (frontmatter)
1. Load `http://localhost:5173` on a fresh profile.
2. Observe: hero headline with the single wonky word, star note with its leader, mode selector (Query / Brief / Essay / Plate), product-context toggle, index rail islands, composer dock.
3. Tab through the entire page without a mouse.
Expected: focus ring visible on every stop; star note reachable and operable by keyboard; no layout shift after fonts load (watch the hero during a hard refresh).
Evidence: one full-page screenshot; screen recording of the Tab walk if a screen reader is unavailable.

### MT-03 — Grounded research turn (local provider)
1. Confirm the colophon chip reads `Set in qwen2.5:1.5b · local` (open the colophon to verify the provider rows; switch to local if needed).
2. In Query mode submit: `How should an early-stage B2B startup increase activation without harming retention?`
3. Watch the stage labels during the run.
Expected: stages appear in order (consulting the archive → drafting → verifying citations → binding); no stage label appears that does not correspond to real work; the answer arrives with at least one numbered citation bead; the entry footer stamp names the model and citation count. On a 1.5B model a validation repair may occur — acceptable; a terminal `MODEL_OUTPUT_INVALID` is acceptable if the retry guidance appears (this is documented model-tier behavior, not a pipeline failure).
Evidence: screenshot mid-run showing stages; screenshot of the completed entry.

### MT-04 — Citation grammar
1. In the answer from MT-03, hover a bead. Expected: quote peeks near the cursor; the leader line to its margin chip highlights; the containing paragraph washes.
2. Click the bead. Expected: the margin chip expands to the full note; scroll adjusts if needed; note flashes once.
3. Verify numbering: the bead number, the note header number, the `[E#]` provenance stamp on the note, and the note's `Rank #n` line all agree.
4. Hover the note, then the leader. Expected: highlight propagates to the bead (the relationship is bidirectional).
5. Click the episode link. Expected: new tab, `rel="noopener noreferrer"` present in devtools.
Evidence: screenshot of expanded note showing quote, episode, and provenance stamp.

### MT-05 — Follow-up grounding
1. In the same session submit: `why does activation before paid acquisition matter?`
2. Expected: retrieval expansion occurs (debug logs show the expanded query when `APP_LOG_LEVEL=DEBUG`); citations cluster around the same episodes as MT-03 or a defensibly related set; the answer does not ask the user to restate the topic.
Evidence: the two entries side by side; the debug log line if enabled.

### MT-06 — Insufficient evidence (the honesty path)
1. Submit: `What's a good benchmark conversion rate for product-led growth companies?`
2. Expected: an insufficient-evidence notice — the archive gap named, the nearest supported angle offered where evidence exists, a reframed question suggested; zero citation beads; the entry visually distinct from a grounded answer.
3. If this query happens to retrieve marginal evidence on the current corpus, substitute another archive-gap question (for example `What is the best CRM for a seed-stage startup?`) and record the substitution.
Evidence: screenshot of the notice.

### MT-07 — Out-of-scope handling
1. Submit: `What's a good pasta recipe?`
Expected: a scope refusal in the assistant's voice (specialization explained, nearest useful alternative offered) — not an archive-gap notice and not a recipe.
Evidence: screenshot.

### MT-08 — Conversational turn without retrieval
1. In a new session submit: `hello — what can you do?`
2. Expected: a warm, citation-free self-description that names the actual capabilities (grounded answers, briefs, essays, plates) and does not invent features; near-instant relative to research turns.
3. With `APP_LOG_LEVEL=DEBUG`, confirm the log records retrieval being skipped for the conversational turn.
Evidence: screenshot; log line.

### MT-09 — Growth Brief lifecycle
1. Switch the composer to Brief. Open the product-context drawer and enter: `Seed-stage B2B task manager, ~400 trials/month, flat activation.`
2. Submit: `compose a growth brief for improving trial-to-paid activation`.
3. Expected: the Fold opens with the paper-fold animation; five sections present; the experiment plan carries hypothesis, change, segment, success metric, guardrail metric, decision rule; badges distinguish user context, transcript evidence, and assistant synthesis; the product context is not cited as podcast evidence anywhere.
4. Edit the recommendation text; save ("bind impression"). Expected: stamp-press feedback; version increments ("second impression bound — Version 2").
5. Conflict check: open the same brief in a second browser tab, edit a different field there with the stale version, save. Expected: 409 — conflict toast and the impression chip shakes; the second tab is instructed to reload; no data lost silently.
6. Verify the Folio Dock: the brief appears on the right shelf; with zero deliverables in a fresh session the shelf is absent entirely; open the colophon popover and watch the dock glide down to avoid it, then return.
Evidence: Fold screenshot showing badges; version stamp after save; the 409 toast.

### MT-10 — Essay contract
1. Switch to Essay mode. On a cloud provider (or a mid-tier local model), submit: `Write a Ship 30 for 30 essay on activation before acquisition.`
2. Expected: essay of 1,150–1,350 words; hook in the opening; headings and selective bold; a concrete closing takeaway; citations distributed across sections; the writing path coherent with the structure.
3. Word target: submit with an explicit request for ~600 words (or the API field `target_word_count: 600`). Expected: the gate re-bands around the target; no length error.
4. On `qwen2.5:1.5b`, an `ESSAY_LENGTH_OUT_OF_RANGE` or `MODEL_OUTPUT_INVALID` outcome is the documented expectation (skill declares `min_model_tier: mid`); record which occurs.
Evidence: essay screenshot; word count; the typed error if the local model was used.

### MT-11 — Markdown plate and mermaid
1. Switch to Plate (Markdown). Submit: `cast a markdown one-pager summarizing our activation plan, with a flow diagram of the trial-to-paid journey`.
2. Expected: a margin plate beside the chat; opening it shows rendered Markdown — headings, tables (if produced), rules — not raw source; a `mermaid` fence, if present, renders as a diagram styled in the product palette.
3. Diagram security (devtools): the rendered diagram lives inside an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`; the parent DOM contains no mermaid-injected markup outside that frame; a deliberate syntax error in a re-run falls back to the preserved source with an error stamp rather than breaking the page.
4. Toggle Preview/Source in the viewer. Expected: Source shows the exact stored Markdown.
Evidence: viewer screenshot (Preview and Source); devtools screenshot of the iframe attributes.

### MT-12 — HTML plate and sandbox
1. Switch to Plate (HTML). Submit: `cast an HTML one-pager experiment brief from our growth brief`.
2. Expected: complete standalone document rendered in the viewer; editorial styling consistent with the document-craft charter (no emoji, no gradients); the impression/sandbox stamp visible.
3. Isolation (devtools, on the preview iframe): `sandbox` attribute is exactly `sandbox=""`; the document head contains the CSP meta (`default-src 'none'` family); the Network tab shows zero external requests while the preview is open; Elements shows no `script`, `form`, `iframe`, or `on*` attributes inside the preview document.
4. Compare `content` and `preview_content` via `GET /api/v1/artifacts/{id}`: the preview is the sanitized derivation; the original remains available in Source view.
Evidence: devtools screenshots for sandbox attribute, CSP meta, and empty network waterfall.

### MT-13 — Provider switching
1. Open the colophon. Note the current selection and the dot states.
2. Switch local → a configured cloud provider. Expected: explicit user action only; chip text updates (`Set in {model} · {provider}`); the next turn's entry stamp names the new model; no silent fallback occurs in either direction.
3. With no key configured for a provider, select it and submit. Expected: a typed, actionable error (configure the key or choose another provider) — not a hang, not a substitute provider.
Evidence: two entry stamps showing different models; the missing-key error toast.

### MT-14 — Strike and cancellation
1. Start a research turn; while composing, press Escape (or click "strike this run").
2. Expected: the strike choreography plays; a "Run struck — nothing was persisted" notice with a recompose action arrives; the composer is prefilled with the original query.
3. Reload the session. Expected: no ghost entry — the struck run left no completed assistant content in history.
Evidence: notice screenshot; post-reload session screenshot.

### MT-15 — Reload persistence and citation stability
1. In a session with at least two grounded answers, note a bead number and its note.
2. Hard-reload the page.
Expected: history renders chronologically (oldest first, newest at the bottom); every bead number matches its pre-reload value; quotes still resolve (they are read from stored chunks); entry stamps and provenance persist.
Evidence: before/after screenshots of the same entry.

### MT-16 — Idempotent replay (API level)
```bash
SID=$(curl -s -X POST localhost:8000/api/v1/sessions -H 'content-type: application/json' -d '{}' | jq -r .id)
KEY="demo-$(date +%s)"
for i in 1 2; do
  curl -s -X POST "localhost:8000/api/v1/sessions/$SID/messages" \
    -H 'content-type: application/json' -H "Idempotency-Key: $KEY" \
    -d '{"content":"What is activation energy in growth?","mode":"research","provider":"local","stream":false}' | jq -r '.message.id'
done
```
Expected: both calls return the **same** message id; `GET …/messages` shows exactly one user/assistant pair for the key.
Evidence: the two identical ids; the message list count.

### MT-17 — Resilience
1. **Ollama down:** quit Ollama; submit a local turn. Expected: fast typed failure (`AGENT_UNAVAILABLE` or provider-specific), truthful retryable flag, UI dot reflects the state; no hang. Restart Ollama; the next turn succeeds.
2. **Gateway down:** `docker compose stop agent-gateway`; submit. Expected: `AGENT_UNAVAILABLE` with the verify-the-container guidance. Restart.
3. **API killed mid-run:** start a cloud turn; `docker compose kill api` while drafting; `docker compose start api`. Expected: after boot, the stranded pending row is swept — reload the session and the turn shows as failed with `SERVER_RESTARTED`, not eternally composing.
4. **Context probe (finding R4):** with `APP_LOG_LEVEL=DEBUG`, run a session of 6+ long turns on the local provider; confirm via gateway logs that requests complete without truncation errors and that history trimming engages (message count in context stays within budget).
Evidence: the three typed errors; the swept entry after restart.

### MT-18 — Responsive
Visit at 1440, 1250, 1120, 899, and 360 px widths.
Expected per breakpoint (design.md §7): leaders disappear at ≤1120 and notes join the flow; the rail becomes a drawer at ≤899 with a working menu button; the Fold goes full-height; the composer remains reachable and the keyboard path intact at every width; no horizontal scrolling at any width.
Evidence: five screenshots of the same session.

### MT-19 — Accessibility pass
1. Keyboard-only: complete MT-03 through MT-09 without a mouse.
2. Screen reader: verify stage announcements during a run, toast announcements, `aria-expanded` on citation chips, modal focus trapping (Tab cannot escape the Fold or the Plate Viewer), and focus restoration on close.
3. Reduced motion: enable `prefers-reduced-motion` at the OS level; reload. Expected: no entrance animations, no leader draws, no fold choreography; every state change still communicated by text, color, and class; toasts fade within ~150ms.
4. Zoom to 200%: no clipped controls, no lost content, focus order intact.
Evidence: screen-reader announcement log (or recording); reduced-motion screenshots.

### MT-20 — Scale sanity
1. Generate or seed a session with 40+ messages (a loop of short queries suffices).
2. Reload the session; scroll to the bottom.
Expected: the newest messages render (pagination is newest-first under the hood); scroll remains smooth; leader redraws do not spike the main thread (performance panel: no sustained >50ms tasks while scrolling).
Evidence: performance trace screenshot; the newest entry visible after reload.

### MT-21 — Security spot checks
1. Attempt a `javascript:` link through a plate: ask for an HTML plate containing a link with `href="javascript:alert(1)"`. Expected in the stored `preview_content`: the scheme is removed or the anchor neutralized; nothing executes in the preview.
2. Ask for a plate containing `<script>alert(1)</script>` and an `<img onerror=...>`. Expected: both absent from `preview_content` (stripped by the sanitizer); the Source view shows the original — inert text.
3. Confirm no request leaves the origin during any plate preview (Network tab, MT-12).
Evidence: `preview_content` excerpts; network waterfall.

### MT-22 — Observability
1. Run one turn of each mode; collect the `x-request-id` response header from the submission.
2. `docker compose logs api | grep <request-id>` and `docker compose logs agent-gateway | grep <request-id>`.
Expected: the same id appears in both services' JSON logs; log lines contain counts, ids, provider/model, durations, statuses — and never a prompt body, transcript passage, artifact content, or key material. Spot-check by grepping the logs for a distinctive phrase from your query: zero matches.
Evidence: the two log excerpts; the empty grep result.

## 3. Regression boundaries (already automated — do not re-verify by hand)

Validation gates and repair reasons; citation reconciliation and hallucination pruning; JSON extractor adversarial cases; retrieval fusion, dedupe, and weak-evidence flags; ingestion idempotency, savepoints, and the wipeout guard; SSE heartbeat timing; idempotency replay and `REQUEST_IN_PROGRESS`; optimistic-locking 409s; startup sweep; sanitizer payload suite; citation numbering and segmentation; motion interruption and reduced-motion short-circuits; mermaid directive stripping; focus-trap behavior; Markdown parser output.

## 4. Sign-off

| Scenario | Result | Tester | Date | Notes |
|---|---|---|---|---|
| MT-01 Startup | ☐ pass ☐ fail | | | |
| MT-02 First impression | ☐ pass ☐ fail | | | |
| MT-03 Research turn | ☐ pass ☐ fail | | | |
| MT-04 Citation grammar | ☐ pass ☐ fail | | | |
| MT-05 Follow-up | ☐ pass ☐ fail | | | |
| MT-06 Insufficient evidence | ☐ pass ☐ fail | | | |
| MT-07 Out of scope | ☐ pass ☐ fail | | | |
| MT-08 Conversational | ☐ pass ☐ fail | | | |
| MT-09 Brief lifecycle | ☐ pass ☐ fail | | | |
| MT-10 Essay contract | ☐ pass ☐ fail | | | |
| MT-11 Markdown + mermaid | ☐ pass ☐ fail | | | |
| MT-12 HTML sandbox | ☐ pass ☐ fail | | | |
| MT-13 Provider switching | ☐ pass ☐ fail | | | |
| MT-14 Strike | ☐ pass ☐ fail | | | |
| MT-15 Reload stability | ☐ pass ☐ fail | | | |
| MT-16 Idempotency | ☐ pass ☐ fail | | | |
| MT-17 Resilience | ☐ pass ☐ fail | | | |
| MT-18 Responsive | ☐ pass ☐ fail | | | |
| MT-19 Accessibility | ☐ pass ☐ fail | | | |
| MT-20 Scale sanity | ☐ pass ☐ fail | | | |
| MT-21 Security spots | ☐ pass ☐ fail | | | |
| MT-22 Observability | ☐ pass ☐ fail | | | |

A scenario marked fail requires either a fix plus a re-run, or a recorded, dated exception with its rationale — the same evidence discipline the automated suites follow.
