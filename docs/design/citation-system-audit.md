# Citation System Audit — End-to-End + "God-Tier" Redesign

**Scope:** every layer a citation touches — retrieval labeling → model output → validation → persistence → SSE/history APIs → `buildCitations`/`segmentTextWithCitations` → beads/sidenotes/leader-lines → interactions.
**Symptoms reported by owner:** (1) citations eat enormous vertical space, want toggleable; (2) "citation numbering and the line connecting them doesn't match when there are more than 2 citations"; (3) general rough edges.
**Result:** both symptoms are fully explained by code-level defects below (CIT1-CIT10, all confirmed C1). The redesign in §4 fixes them structurally — most fixes *delete* complexity rather than add it.

---

## 1. System map — where numbers are born, mutated, and displayed

| # | Stage | Code | Numbering produced |
|---|-------|------|--------------------|
| 1 | Retrieval | `hybrid_search.py` `compute_rrf_fusion` | `E1..En` assigned in **RRF rank order** (E1 = best evidence) |
| 2 | Prompt | `prompts.py` `format_evidence_block` | `[E1] "excerpt" Source: …` — model told to cite these |
| 3 | Model output | — | inline `[E#]` markers in text (reading order) + `citations[]` array in **arbitrary model-chosen order** |
| 4 | Validation | `validator.py` `filter_valid_citations` | prunes invalid IDs, dedupes, **keeps model's array order** |
| 5 | Persistence | `conversation_service.py` | `message_sources.retrieval_rank = len(citation_payloads)+1` → **stores citation-array position, NOT retrieval rank** (the code comment claims otherwise) |
| 6 | Live API | SSE `completed.citations` | payload array in model order |
| 7 | Reload API | `session_service.get_session_messages` | `selectinload(Message.sources)` — **no ORDER BY** → arbitrary Postgres row order |
| 8 | Display numbering | `citeInline.ts` `buildCitations` | `refIndex = idx + 1` → **position in whichever array arrived** |
| 9 | Text segmentation | `segmentTextWithCitations` | `[E3]` resolves by evidence_id (via provenanceStamp prefix match); bare `[1]` resolves by refIndex |
| 10 | Beads + cards | `Manuscript.tsx` `RichText`, `SideNote.tsx` | both display `refIndex`; card stamp shows `[E3] …`; margin cards render in `entry.citations` array order |
| 11 | Leader lines | `LeaderLines.tsx` | connect by unique note id `sn-{session}-{message}-{evidenceId}` — **always target the correct card** |

**The core structural flaw:** the system runs **three numbering systems simultaneously** — E-numbers (text + stamps + retrieval truth), refIndex (beads + card headers + aria-labels), retrieval_rank (DB, mislabeled, unused for ordering). Nothing guarantees they agree, and stages 6/7 don't even guarantee refIndex is stable *between renders of the same message*.

---

## 2. Confirmed defects

### CIT1 · S2 — Bead numbers contradict the text they sit inside
Text reads `…retention curves flatten [E3]` → bead displays **1** (because E3 happened to be first in the model's citations array). With one citation nobody notices; with 2+ the text-vs-bead disagreement is blatant. This is the primary "numbering doesn't match" complaint.
**Evidence:** `citeInline.ts` `refIndex: idx + 1`; `Manuscript.tsx:46-49` renders `{cit.refIndex}` inside the bead while the surrounding prose keeps `[E3]` semantics; `SideNote.tsx` header also `refIndex`.

### CIT2 · S2 — Leader lines cross whenever model array order ≠ text order
Margin cards render in `entry.citations` array order (`Manuscript.tsx:241` `entry.citations?.map`), beads appear in reading order. Models routinely list citations in any order (or grouped by section). With 3+ citations, lines from bead "1" (low in text) to card "1" (top of margin) cross lines from bead "2"/"3" — visually attributing the wrong line to the wrong card. The lines are *technically* correct (ID-targeted) but *perceptually* wrong — exactly what the owner reports.
**Aggravator:** all lines render at rest, opacity 0.85, dashed — full spaghetti always on. The `.hot` highlight (which is excellent) only disambiguates one line at a time on hover.

### CIT3 · S2 — Citation numbers can change on page reload
`get_session_messages` loads `Message.sources` via `selectinload` with **no ordering**; Postgres gives no order guarantee without ORDER BY. `buildCitations` then re-derives `refIndex` from whatever order arrived → the same message can show bead "1" on the answer that showed "3" before refresh (and leader/cards reshuffle). `retrieval_rank` — the column that exists to prevent exactly this — is never used in any query.
**Evidence:** `session_service.py` `.options(selectinload(Message.sources)...)` (no `order_by`); grep `retrieval_rank` → written once, read never.

### CIT4 · S2 — `retrieval_rank` stores the wrong thing (provenance corruption)
```python
# conversation_service.py — comment vs code
# "retrieval_rank is the ordinal position in the final fused evidence ranking for this run."
retrieval_rank=len(citation_payloads) + 1,   # ← position in the MODEL'S citation array
```
If the model cites `[E3, E1]`, E3 gets rank 1 and E1 gets rank 2 — the stored provenance contradicts the retrieval truth (E3 = rank 3). Spec §5.6 semantics violated; any future analytics/eval built on this column inherits the lie. Fix is one line: `retrieval_rank=int(cit.evidence_id[1:])` (E-labels are assigned in fused-rank order at stage 1, so the number *is* the rank).

### CIT5 · S2 — Dangling `[E#]` markers: text references notes that don't exist
Two independent sources: (a) model cites `[E9]` inline but E9 isn't in the run's evidence → validator prunes nothing from *text* (harness E1 — only the array is filtered); (b) model uses `[E2]` in text but forgets the array entry — E2 is valid, the evidence exists server-side, yet no note is persisted because persistence iterates the *array*. Result: literal "[E2]" text next to clickable beads; user counts 4 markers, sees 3 notes → "numbers don't match."
**The fix is better than stripping:** for case (b) the backend *has* everything needed — auto-add a citation row for any valid E-label found in the text (union text-labels ∩ evidence_map with the array). Strip only genuinely invalid labels (case a). Then: **every marker in stored text is clickable, and every note corresponds to a marker** — a WYSIWYG invariant the UI can rely on forever.

### CIT6 · S3 — Bare `[n]` matching converts ordinary prose into citation beads
`MARKER_RE = /\[(E\d+|\d+)\]/g` — any `[1]`, `[2]`… in model output (quoted transcript text, list references, bracketed asides) becomes a bead wired to whatever citation has that refIndex. False-positive beads + false leader lines. The output contract only ever promises `[E#]`; the bare variant exists for demo fixtures (which already use `[E2]` style — `demoData.ts:264`). **Delete the bare-number branch** after a fixture grep.

### CIT7 · S3 — Vertical space: every note renders as a full card, always
Card anatomy (`SideNote` + `.snote-in` CSS): speaker row + 2-4-line blockquote + episode link + provenance stamp ≈ **150-180px each** including margins. An 8-citation answer stacks ≈1,300-1,440px of margin column; because `.snote` floats with `clear: right` inside the entry, **the float stack extends the entry's height** — entries tower over their own prose. Below 1121px it's worse: `float: none; margin: 20px 0` → full-width cards *inline in the reading flow*, one per citation. No collapse, no accordion, no toggle exists anywhere. Owner complaint confirmed at the pixel level.

### CIT8 · S3 — Keyboard users get no leader/note linkage
`LeaderLines.tsx` binds `mouseover/mouseout` only. CSS gives `:focus-visible` beads an outline, but focusing a bead never sets `.hot` on the line or the card — the signature three-way grammar (bead↔line↔note↔paragraph-wash) is mouse-only. Fix: `focusin/focusout` listeners (3 lines) mirroring the mouse handlers.

### CIT9 · S4 — Rich provenance collected but thrown away
`EvidenceItem` carries `rrf_score`, `dense_rank`, `sparse_rank`; the assistant message even stores `metadata_.evidence_rrf_scores`. None of it reaches the UI (message_sources' `semantic_score`/`keyword_score` are honestly NULL per §5.6, and the RRF metadata is never exposed by the history API). The trust story stops at "excerpt + episode" when "rank #2 of 24 candidates, fused score 0.017, dense #1 / keyword #4" is sitting in memory. Evaluators of a *grounding* product live for this.

### CIT10 · S4 — Stamp count can disagree with visible notes
`entriesFromHistory` stamps `"N citations verified"` from `citations.length`; with CIT5 dangling markers the prose shows more references than N. Auto-heals once CIT5 lands.

### Cross-references (fixed elsewhere, restated because they bite citations specifically)
- **BA1** (backend audit): re-ingesting a changed episode CASCADE-deletes chunks → `message_sources` rows vanish → **old answers silently lose their notes** (numbers stay, cards disappear). The soft-delete fix is a citation-durability fix.
- **Harness E1/B2**: inline-label validation + stripping stale `[E#]` from replayed history — both land in the same validator function as CIT5.

---

## 3. What already works (protect these in the redesign)

ID-based line targeting (lines never attach to the *wrong* card — only cross) · bidirectional click navigation (bead→note scroll+flash, note→bead) · the four-way hot grammar (bead/line/note/paragraph wash) · per-message note-id namespacing (no cross-message collisions) · excerpts read from stored chunks, never model text (spec §5.6, the correct trust architecture) · hallucinated-ID pruning · flash attention-curve · bead hit-slop (`::after inset:-6px`) · honest voice ("4 citations verified") · hand-drawn bezier leaders with terminal dots (the product's signature — keep the aesthetic, change the policy).

---

## 4. The god-tier redesign — "one number, one truth, disclosure by default, lines on demand"

Four structural moves. Each kills a defect class rather than patching instances.

### Move 1 — Unify all numbering on the E-number (kills CIT1, CIT3, CIT6, CIT10)
The E-number is already the retrieval rank, already in the text, already unique per run, and already stable forever (it's persisted per message). Make it **the only displayed number**:

```ts
// citeInline.ts — buildCitations
export function buildCitations(sessionId, messageId, records: CitationRecord[]): Citation[] {
  return (records || [])
    .map((c) => ({
      ...c,
      num: Number(c.evidence_id.replace(/\D/g, '')) || 0,     // E3 -> 3  (the ONE number)
    }))
    .sort((a, b) => a.num - b.num)                             // margin order = rank order
    .map((c, idx) => ({
      id: `sn-${sessionId}-${messageId}-${c.evidence_id}`,
      refIndex: c.num,            // beads + cards now display the E-number
      speaker: c.guest || 'Lenny\u2019s Podcast guest',
      ...
    }));
}
```
```ts
// segmentTextWithCitations — resolve E tokens by number directly; DELETE the bare-[n] branch
const cit = citations.find((c) => c.num === Number(token.slice(1)));
```
```python
# backend — retrieval_rank becomes true rank; history reads it back ordered
retrieval_rank=int(cit.evidence_id[1:])                                   # conversation_service.py
# session_service.get_session_messages:
.options(selectinload(Message.sources, lambda q: q.order_by(MessageSource.retrieval_rank))
         .selectinload(MessageSource.chunk).selectinload(TranscriptChunk.source))
```
Effects: text `[E3]` → bead `3` → card `3` → DB rank `3` → same after every reload. Margin cards sorted by rank also *reduce* line crossings for free (rank order correlates with prominence, and cards read like footnotes 1,2,3… down the margin).

### Move 2 — The WYSIWYG citation invariant (kills CIT5, heals CIT10)
One validator function, run before persistence:

```python
# validator.py — applied to answer_markdown / essay_markdown / brief text fields
_INLINE_LABEL_RE = re.compile(r"\[(E\d+)\]")

def reconcile_inline_labels(text: str, citations: list[CitationItem],
                           valid_ids: set[str]) -> tuple[str, list[CitationItem], list[str]]:
    """Returns (cleaned_text, completed_citations, dropped_labels).
    Invariant after this call: every [E#] in text has a citation entry,
    and every citation entry's label appears or was intentionally array-only."""
    labels = set(_INLINE_LABEL_RE.findall(text))
    dropped = sorted(l for l in labels if l not in valid_ids)
    for bad in dropped:                       # strip invalid markers from text (harness E1)
        text = text.replace(f"[{bad}]", "")
    have = {c.evidence_id for c in citations}
    completed = citations + [
        CitationItem(evidence_id=l, supports="")          # auto-add text labels the array missed
        for l in sorted(labels & valid_ids - have, key=lambda x: int(x[1:]))
    ]
    return text, completed, dropped
```
Persistence already iterates the citations list → auto-added labels get `message_sources` rows and SSE payloads with zero further changes. `dropped` count goes into message metadata for observability (and optionally triggers the typed repair from harness D2 on the first pass only).

### Move 3 — Progressive disclosure: chips by default, cards on demand (kills CIT7)
The margin shows **one-line chips** at rest; the full card exists only when the user asks for it.

```
At rest (per citation, ~28px):
┌──────────────────────────────┐
│ ❸  Casey Winters — Retention │   ← number bead + speaker + episode (truncated)
└──────────────────────────────┘
Expanded (click/hover-peek, ~160px):
│ ❸  Casey Winters             │
│ "Retention is the core of…"  │
│ The Growth System ↗ · [E3]   │
│ ▸ provenance: rank 3 · RRF 0.017 · dense #1 · kw #4
```

- **8 citations: ~1,400px → ~240px (−83%).** Entries stop towering over their prose.
- Bead **hover = peek tooltip** anchored near the bead (quote + speaker, ~220px, 120ms delay, follows focus for keyboard) — 90% of "let me check the source" moments never touch the margin at all. This is the single biggest seamlessness win: evidence appears where the eye already is.
- Chip **click = expand** (accordion within the entry; `aria-expanded`; grid-rows `0fr→1fr` transition so no layout property animates).
- Entry footer (`a-foot` already exists): `Evidence · 4 notes` button toggles **all chips hidden/visible** per entry; preference persisted in `localStorage`; auto-collapsed when >3 notes, auto-expanded for 1.
- **Narrow viewports:** chips leave the flow entirely — an `<details class="ev-fold"><summary>Evidence (4)</summary>…chips…</details>` at the end of the answer. Inline cards between paragraphs (current behavior) are deleted.

```tsx
// CitationChip.tsx (sketch)
export const CitationChip: React.FC<{ cit: Citation; expanded: boolean; onToggle: () => void }> = …
<button className={`cchip${expanded ? ' open' : ''}`} aria-expanded={expanded} onClick={onToggle}
        id={cit.id} data-note-anchor>
  <span className="cchip-n">{cit.refIndex}</span>
  <span className="cchip-who">{cit.speaker}</span>
  <span className="cchip-ep">{cit.episodeTitle}</span>
</button>
{expanded && <div className="cchip-card"><blockquote>{cit.quote}</blockquote>…provenance…</div>}
```
```css
.cchip { display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: baseline;
  width: var(--note-w); padding: 5px 10px; border: 1px solid var(--border);
  border-left: 2.5px solid var(--accent-line); background: var(--surface);
  font: 500 12px var(--f-ui); color: var(--muted-ink); text-align: left;
  transition: border-color var(--dur-fast), color var(--dur-fast); }
.cchip:hover, .cchip.hot { border-left-color: var(--accent); color: var(--ink); }
.cchip-n { font: 600 11px var(--f-mono); color: var(--accent); }
.cchip-card { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-normal) var(--ease-out-expo); }
.cchip.open + .cchip-card, .cchip-card.open { grid-template-rows: 1fr; }
```

### Move 4 — Leader lines on demand (kills CIT2, CIT8; honors the motion doctrine)
- **At rest: zero lines.** The page is clean; "motion/ink appears because of a cause" is the repo's own law (design §15.6). Spaghetti becomes impossible because there is no spaghetti until one bead is hot.
- **Bead hover/focus → one line ink-draws** to its chip (640ms, the `stroke-dashoffset` machinery already exists in `LeaderLines.tsx` — currently dead code waiting for exactly this; wire `animateIds` to hot events instead of first-appearance).
- **Bead click → scroll + flash + line persists** until focus leaves.
- Chip hover → reverse: its line draws back to every bead referencing it (multi-anchor highlight; with unified numbering + rank-sorted margin, these are short, mostly-parallel runs).
- Entry footer gets a tiny `⟋ leaders` toggle for evaluators/screenshots who want the full web (opt-in, off by default).
- `focusin/focusout` listeners join the existing mouse handlers (CIT8 fix, 3 lines).
- Perf: rAF dirty-set coalescing on the MutationObserver + measure only entries intersecting the viewport ±1 screen (IntersectionObserver on `.entry`), redraw hot lines on scroll-idle (150ms debounce) — lines only exist for hot items now, so scroll cost is near zero.

### The trust layer (CIT9 — cheap, evaluator-facing)
Persist what's already computed: `message_sources` gains nothing schema-wise if you reuse the existing NULL score columns honestly — store `semantic_score = dense_rank`-derived? No: cleanest is one JSONB `meta` column (or reuse `supports`-adjacent metadata on the message): `{rrf, dense_rank, sparse_rank}` per citation, exposed in both SSE payloads and history. Chip expanded view shows `rank 3 · fused 0.017 · dense #1 · keyword #4`. Combined with the existing excerpt-from-stored-chunk rule, the provenance chain becomes: **bead → quote → chunk → episode → retrieval statistics** — end-to-end inspectable, which is precisely what a grounding product should let a skeptical evaluator do.

---

## 5. Resulting experience (the "seamless" checklist)

1. Reader sees `[3]` in text, bead `3`, chip `3`, card `3`, DB rank `3` — one number, everywhere, forever (stable across reloads, re-indexes*, providers). (*with BA1 soft-delete)
2. Resting page: prose + slim margin chips, no lines, no cards — 83% less citation chrome.
3. Hover a bead: quote peeks *at the cursor*, one ink line draws to the margin. Zero scrolling for the common check.
4. Click: scroll + flash + persistent line; keyboard gets the identical grammar via focus.
5. Every marker in text is clickable; every note has a marker (WYSIWYG invariant, backend-enforced).
6. Evaluator opens provenance: rank, fused score, per-system ranks, stored-chunk excerpt, episode link.
7. Narrow screens: one `<details>` fold per answer instead of N inline cards.
8. All motion causal, interruptible, reduced-motion-gated; leaders redraw only when hot.

---

## 6. Prioritized fix list

| ID | Sev | Fix | Layer | Effort |
|----|-----|-----|-------|--------|
| CIT1/3/6 | S2 | Unify on E-number: `buildCitations` num+sort, delete bare-`[n]` branch, `ORDER BY retrieval_rank` (Move 1) | FE+BE | ~2h |
| CIT4 | S2 | `retrieval_rank = int(eid[1:])` | BE | 5 min |
| CIT5 | S2 | `reconcile_inline_labels` (auto-add + strip) in validator; persistence unchanged | BE | ~1h |
| CIT7 | S2 | Chips + accordion + entry toggle + `<details>` on narrow (Move 3) | FE | ~4h |
| CIT2/8 | S2/S3 | Lines-on-demand + focusin/focusout + wire dead ink-draw (Move 4) | FE | ~3h |
| CIT9 | S4 | Persist/expose rrf+dense_rank+sparse_rank; provenance row in expanded chip | BE+FE | ~2h |
| CIT10 | S4 | Auto-healed by CIT5 | — | 0 |
| BA1 dep | S2 | Chunk soft-delete (backend audit) — citation durability across re-ingestion | BE | in migration 0005 |

Sequencing: CIT4+CIT5+CIT1 backend half first (they make the frontend honest), then Move 1 FE, then Move 3, then Move 4. Total ≈ 1.5-2 days. Every step is independently shippable; none conflicts with the harness/backend/design wave plans (CIT5 merges into harness E1's validator work; the perf items merge into BA leader-redraw).

## 7. Not verifiable statically
- Actual reload-order drift frequency (CIT3) — Postgres *often* returns insertion order for untouched tables, so the bug may appear intermittent; it's a guarantee violation regardless. One integration test (insert sources, `VACUUM`, re-select) demonstrates it.
- Perceptual crossing severity at 5-8 citations — screenshot pass after Move 4 should show zero resting lines, making the question moot.
- Peek-tooltip viewport-edge behavior — needs the browser pass (same session as design-audit §6 probes).
