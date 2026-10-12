# Design Implementation Audit — `awwwards-bone-aubergine-design-research.md` vs `frontend/`

**Target:** github.com/imshreyaskn/kestrel @ `0881858` ("bone & aubergine reskin, sharp floating islands, Fraunces typography")
**Method:** clause-by-clause comparison of the 1,019-line design research doc against `dossier.css` (1,485 lines), all 13 components, `lib/motion.ts`, `App.tsx`, `index.html`, and reskin transcripts 012/013. Static analysis; browser-runtime items flagged at the end.

**Owner-declared intentional deviations (excluded from findings):**
1. Typography changes (families kept per doc; scale values differ slightly — excluded)
2. Floating-island layout changes (rail spine → two sharp bone islands; radius-0 island language)
3. Color palette (bone/aubergine hexes differ from doc §2.2; ink is warm near-black `#161614`, not plum `#241728`; doc §15.2's "no neutral gray ink" rule is owner-overridden)
4. No dark mode (doc §2.4 appendix intentionally not shipped; `color-scheme: light` is consistent)

Legend: ✅ implemented · ⚠️ partial · ❌ missing · ☠️ built-but-dead (code exists, never runs) · 🎭 intentional deviation (excluded)

---

## 1. Verdict

**The reskin landed. The motion story did not.**

- **Skin, voice, and accessibility scaffolding: ~80% of the doc.** The editorial identity is coherent (bone canvas, aubergine mechanism, Fraunces axis play on the hero, drop caps, oldstyle numerals, the bead→leader→sidenote grammar, the fold modal, tilted toast slips). Copy voice (§11) is 100% — genuinely the strongest layer ("Run struck — nothing was persisted", "the archive kept it", tour fixtures labeled "never persisted"). A11y fundamentals exceed most SOTD entries: focus trap + restore in the Fold, `aria-live` stage announcements mapped 1:1 to backend stages, hit-slop on citation beads, reduced-motion CSS+JS gates, honest tour labeling (anti-slop #8 ✅).
- **Motion narrative: ~30-35%.** Of 12 micro-interactions (§8), 4 are implemented. Of 5 signature moments (§9), **1.75 exist** (Fold-open ✅, Fold-close ❌, Bloom ⚠️ simplified; Bind ❌, Strike ❌, Spine overture ❌). Four motion mechanisms are **dead code**: `play()` and `flip()` (built + unit-tested, zero call sites), `settleEntry()` (wired to real events but the `.is-arrived` CSS rule doesn't exist), leader ink-draw (`animateIds` path never receives IDs), `applyStagger()` (never called; no `entry-arrive` keyframes exist).
- **Six confirmed functional bugs** (§3 below), including an undefined CSS variable that silently kills a limit-state warning, and error toasts that arrive with a success tick.
- **Process finding:** transcript 012 ("✅ IMPLEMENTED & EMPIRICALLY VERIFIED") claims registration marks, deckle edge, a working SOFT-settle, and stagger — none exist at HEAD. The unit tests pass because they test the helpers in isolation; nothing verifies the helpers are *wired*. This is precisely the failure mode the repo's own `.agents/rules/diff-review.md` warns about ("tests that merely mirror the implementation", "do not approve because tests are green").

**Awwwards distance:** what stands between this and a SOTD nomination is not visual taste (that's largely there) — it's (a) the missing motion narrative (gestures currently have no consequences), (b) dead wiring that makes some interactions silently no-op, (c) small-size contrast failures, (d) the six bugs. All are fixable in the existing architecture; §5 sequences them.

---

## 2. Conformance matrix (doc section → status)

### §2 Color system
| Item | Status | Notes |
|---|---|---|
| Token architecture (`--canvas/--surface/--ink/--accent…` drop-in set) | ✅ | Clean single-source `:root` |
| Exact palette (bone/aub steps, ink-as-plum) | 🎭 | Owner-excluded |
| Gold discipline: exactly 3 uses (endmark, impression chip, folio numerals) | ❌ | **0 uses** — `--gold`/`--gold-soft` defined, never referenced. Endmark diamond is `var(--accent)`; impression chip is accent-soft; folio numerals are muted-ink. Dead tokens |
| Semantic colors (danger/success) | ✅ | Present and used |
| `--crimson` | ☠️🐛 | Referenced at dossier.css:358-359, **never defined** — see bugs §3.1 |
| Contrast discipline ("muted never below 12px", gold never body text) | ❌ | `--faint #9C9690` on `--canvas #F2F0E9` = **2.57:1**, used at 8.5-9.5px in ≥7 places (`.st-d`, `.ctx-opt`, `.fm-mast .right`, `.fm-foot`, `.colo-state`, `.try .sc`, `.write-line placeholder`). `.stamp` base size is 9px. See §3.5 |
| Dark mode appendix | 🎭 | Owner-excluded; light-only is internally consistent |

### §3 Typography
| Item | Status | Notes |
|---|---|---|
| Fluid `clamp()` scale tokens | ✅ | Values differ slightly — 🎭 excluded |
| Fraunces axes: hero `opsz 144`, WONK on exactly one word | ✅ | `.hero-h .wonk` — correct single-wonk discipline; WONK held constant, never animated (§15.11 ✅) |
| SOFT hover settle on hero words | ✅ | Even extended beyond doc (SOFT 0→80 on hover) — tasteful |
| SOFT settle on new answers (§5.6, `.is-arrived`) | ☠️ | `settleEntry()` called from Manuscript.tsx:93; **no `.is-arrived` CSS rule exists** — bug §3.3 |
| Oldstyle/tabular numerals (`.rl-num` onum, `.stamp` tnum+onum) | ✅ | |
| Drop cap on answer lead | ✅ | `.a-lead::first-letter`, Fraunces, accent color |
| `text-wrap: pretty/balance`, hanging punctuation, explicit liga/kern/calt | ❌ | Zero occurrences |
| Self-hosted fonts + metric-matched fallbacks (§3.4) | ❌ | Google Fonts CDN (`index.html`); no `size-adjust` fallbacks. Doc calls self-hosting "an Awwwards perf criterion" |

### §4 Materiality
| Item | Status | Notes |
|---|---|---|
| Paper shadow stack (page/raised/modal tiers, 1:1 elevation mapping) | ✅ | 2-layer instead of doc's 3 (missing the 1px contact ring); tint is warm-neutral not aubergine-black (🎭 palette-adjacent) |
| Grain overlay (multiply, tuned opacity) | ✅ | 0.025 vs doc 0.04 — within tuning latitude |
| Deckle edge (`.page::after` double rule) | ❌ | Absent — yet transcript 012 claims it shipped |
| Registration marks flanking masthead + fold header | ❌ | Absent — yet transcript 012 claims them |
| Rail as book spine (aub-950, ridge, gold folios, ribbon tab) | 🎭 | Replaced by floating islands (owner-excluded). Island translation keeps the *grammar*: active item = 2.5px accent left rule (the doc's own "rules read as index tabs" hover language) + accent-soft fill |
| Spine ridge / gold ribbon tab / FLIP tab slide (§8.1) | ❌/🎭 | Mooted by islands, except: active-state change has **no motion** (instant fill swap) |

### §5 Motion system
| Item | Status | Notes |
|---|---|---|
| Duration tokens (80/160/240/400/640ms) | ✅ | Exact doc values |
| Curve tokens (out-expo, in-out-soft, spring, sheet, attention) | ✅ | Exact doc values |
| `linear()` spring tokens | ⚠️ | Present — but they are the doc's **placeholder values verbatim** (doc: "generate real values with the snippet once during implementation"), and the required `@supports not (transition-timing-function: linear(0,1))` fallback is **absent** (older Safari/Firefox silently drop to default ease) |
| Stagger discipline (§5.4, 40ms capped) | ☠️ | `applyStagger()` exists + tested; **never called**; no `entry-arrive` keyframes in CSS |
| Composing steps: marching dots, 3px ink-rule, tick stroke-draw (§5.5) | ⚠️ | Run-state pulse on `.st-m` ✅; static tick SVG ✅ (colored `--success`, no dash-draw); marching dots ❌; ink-rule ❌; `.st-dots` is a static dotted border |
| `play()` interruption-safe WAAPI helper (§5.7) | ☠️ | Built, 13 unit tests, **zero app call sites** |
| `flip()` shared-element helper (§5.8) | ☠️ | Built, tested, **zero app call sites** |
| Reduced motion: global CSS kill-switch + JS gates | ✅ | CSS block matches doc §5.9; `play`/`flip`/`settleEntry` gate correctly |
| …except `scrollIntoView({behavior:'smooth'})` (LeaderLines click-jump) | ⚠️ | Not gated on reduced-motion |

### §6 Iconography ("Apparatus")
| Item | Status | Notes |
|---|---|---|
| No icon libraries (anti-slop #10) | ✅ | Only react/react-dom in package.json; all glyphs inline SVG |
| Bespoke monoline glyphs | ⚠️ | Hand-drawn inline paths ✅, but stroke 1.9-2.2 vs spec 1.5; sizes ad-hoc (12/13/15px inline styles) vs the 14/16/20/24 law |
| Icon morphs (plus→arrow-out, knot→strike) (§6.3) | ❌ | No `d:` interpolation, no two-path stack, no rotation morphs |
| State echoes (knot ties on press, strike draws its rule) | ❌ | |
| `aria-label` on icon-only controls | ✅ | rail delete, colophon close, plate close, tray button |

### §7 Per-component
| Component | Skin | Interaction | Notable gaps |
|---|---|---|---|
| RunningHead | ✅ | ⚠️ | hairline ✅; column-start tick ❌; rename settle-stamp ❌ (retitle = toast only); dot breathes **only while composing** ✅ (exact doc behavior); colophon popover ✅ (shadow-raised, r12); provider dot-travel FLIP ❌ |
| IndexRail | ✅🎭 | ⚠️ | islands + hover-expand + label reveal ✅; left-rule hover language ✅; delete = instant removal, no tip-out (§8.5) ❌; no gap-close motion ❌; **width is transitioned** (50→280px) = layout-property animation, anti-slop #7 ❌ (§3.6) |
| Frontmatter | ✅ | ⚠️ | hero + wonk + star ✳ ✅; try-chips hover lift 1px (doc: 2px spring) + no quote-tightening ⚠️; mode selector = underline swap, doc's shared sliding pill (§8.2) ❌; registration crosses ❌; Spine overture (§9.5) ❌; submit stampPress ✅ wired |
| Manuscript | ✅ | ⚠️ | ¶ counter ✅; drop cap ✅; bead hover scale + hit-slop ✅; leader hot-state grammar ✅ (bead↔note↔leader↔paragraph wash — exceeds doc); flash attention-curve ✅; query-card 3px rule draw-in ❌; leader ink-draw ☠️ (dead path); endmark bloom ✅ wired (diamond, accent fill 🎭; 4-point sparkle ❌) |
| ComposerBar | ✅ | ⚠️ | sheet lift on focus ✅ (via box-shadow transition — paint-law §3.7); ¶ glyph recolors ✅; stampPress ✅; context drawer **pops** (no 240ms reveal) and lives inside the sheet → the reflow-jump the doc explicitly warned about ❌; submit→strike icon morph ❌ (strike is a separate text button in Manuscript — acceptable restructure, but undocumented); esc keycap (§8.11) ❌ |
| GrowthBriefModal | ✅ | ⚠️ | fold-open ✅ well-executed (perspective on scrim, rotateX+translateY, spring-heavy, shadow-modal landing); badge trio ✅ semantically exact (User context / Transcript evidence / Assistant synthesis); focus trap + Escape + restore + aria-modal ✅; EdBlock focus = dashed outline (doc: left-edge rule draw) ⚠️; **close = hard unmount** (`className="fold open"` hardcoded; no reversal) ❌ §3.2; content stagger during fold ❌; conflict shake (§8.10) ❌ — 409 produces toast only |
| PlateViewerModal | ✅ | ⚠️ | fade-open ✅; FLIP-from-margin origin (§8.8) ❌; preview/source = underline (consistent with msel, but doc wanted shared pill) ⚠️; `sandbox=""` iframe ✅; impression stamp ✅ ("design tour plate · not persisted" — honest); Escape + initial focus ✅; **no focus trap** (Fold has one; Tab escapes to background) ❌ |
| Toasts | ✅ | ⚠️ | slip-in with −0.35° tilt + spring-gentle ✅; **no exit animation** (instant unmount at 2800ms) ❌; **no max-3 cap** ❌; no stack-rise; **always a success tick, even for errors** ❌ §3.4; letterpress copy ✅ |
| StatesTray | ✅ | ✅ | colophon-slip styling; disclaimer kept verbatim ("fixtures are never persisted · live states run real queries") — anti-slop #8 model citizen |

### §8 Micro-interactions: 4 of 12
✅ 8.3 ink-stamp press (wired in 3 components; ink-ring companion ❌) · ✅ 8.6 bead/leader/sidenote grammar (draw-in dead) · ✅ 8.7 sidenote flash · ⚠️ 8.9 toast enter (exit/cap/variants missing)
❌ 8.1 rail ribbon FLIP · ❌ 8.2 sliding mode pill · ❌ 8.4 provider dot travel · ❌ 8.5 delete tip-out · ❌ 8.8 plate FLIP origin · ❌ 8.10 conflict shake · ❌ 8.11 esc keycap · ⚠️ 8.12 focus ring (draw ✅, press-grip ❌)

### §9 Signature moments: 1.75 of 5
| Moment | Status |
|---|---|
| The Bind (§9.1) — query travels composer→card | ❌ No `startViewTransition` anywhere; the doc's own fallback (entry-arrive stagger) is also absent — entries simply pop into existence |
| The Fold (§9.2) | ⚠️ Open ✅ (one of the best-implemented specs in the codebase); close ❌ (hard cut) |
| The Strike (§9.3) | ❌ Functionally correct + great copy (notice entry, Recompose prefill, "nothing persisted") but **zero choreography**: composing card vanishes on state flip — no strike-rule, no grayscale, no tip-back |
| The Bloom (§9.4) | ⚠️ Diamond blooms once per completed entry, correctly wired; accent-filled not gold (🎭), no registration sparkle |
| The Spine (§9.5) | ❌ No first-load overture; page is static on arrival |

### §10 Scroll/layout/performance
| Item | Status |
|---|---|
| `content-visibility: auto` + `contain-intrinsic-size` on entries | ❌ (zero occurrences) |
| Leader redraws: MutationObserver ✅, resize debounce ✅, fonts.ready ✅ — but **no rAF dirty-set**: every subtree mutation triggers a full synchronous re-measure of all beads+notes | ⚠️ |
| `will-change` discipline | ✅ trivially (none shipped statically; helpers don't apply it either — doc wanted just-in-time application) |
| Shadow cross-fade law (never transition `box-shadow`) | ❌ — `.snote-in`, `.rail-new`, `.rail-list`, `.compose-in`, `.fm-dock-in` all transition `box-shadow` directly |
| Page-turn view transition (§10.2) | ❌ |
| Responsive contract (leaders <1121px, sidenotes→inline, rail behavior <900px) | ✅ — JS breakpoint `1121` matches CSS `1120`; sidenotes become inline blocks; rail becomes off-canvas drawer with menu button |

### §11-13 Voice, sound, accessibility
| Item | Status |
|---|---|
| §11 Letterpress voice, honest loading language, stage↔step 1:1 | ✅ **100%** — best-in-repo |
| §12 No sound/haptics | ✅ |
| Live region + stage announcements | ✅ `#live` role=status; `announce()` on every stage/provider/conflict event |
| Color never sole signal | ⚠️ — composing steps ✅ (tick + label text); provider ✅ (dot + label); **toasts ❌** (same tick for success and failure); title-counter reached-state ❌ (bug §3.1) |
| Focus rings ≥3:1, 2px/3px offset | ✅ accent ring; press-grip refinement ❌ |
| Hit targets | ✅ beads get `::after inset:-6px` slop (doc §13 exactly); `.rl-del` 18px (doc-sanctioned, below WCAG 2.5.8's 24px — noted, not scored) |
| Focus management | ⚠️ Fold ✅ trap+restore; Plate ❌ no trap |
| Reduced motion | ✅ with the smooth-scroll exception (§5 table) |
| **Text contrast** | ❌ §3.5 — the single biggest a11y gap |

### §15 Anti-slop doctrine: 9 of 12
✅ #1 no gradients/glass/glow · 🎭 #2 ink rule owner-overridden · ✅ #3 asymmetric column+margin kept · ❌ **#4 radii**: 999px pills ×6, 16px fold corners, plus 10/9/8/7/6/5px mixed — no scale discipline · ✅ #5 no emoji (✳ ¶ ↵ · are type glyphs) · ✅ #6 still at rest (pulse/breathe gated to run states) · ❌ **#7 layout animation**: rail `width` transition · ✅ #8 tour fixtures labeled · ✅ #9 ≤2 concurrent animations · ✅ #10 no icon libs · ✅ #11 WONK/font-size never animated · ✅ #12 islands answer "what is this made of" (sharp floating bone cards) — coherent material

---

## 3. Confirmed bugs (fix regardless of design taste)

### 3.1 `--crimson` is undefined — the title limit "reached" state is invisible · S3
`dossier.css:358-359` styles `.rhead-title-counter[data-limit="reached"]` with `color: var(--crimson); border-color: var(--crimson);` — no such token exists anywhere. Invalid-at-computed-value → both declarations fall back (color inherits ink, border keeps `--border`). The user hits the 255-char session-title ceiling and gets **only** a `font-weight: 600` nudge. Also violates doc §13 (color/state never the only signal — here the signal itself is broken).

```css
/* fix — dossier.css :root */
--crimson: var(--danger);   /* or replace both usages with var(--danger) directly */
```

### 3.2 Fold close is a hard cut; the class is hardcoded `"fold open"` · S4
`GrowthBriefModal.tsx:124` — `className="fold open"`. The component mounts already-open, so the fold-open animation plays (good) but **no close choreography can ever run**: `onClose` unmounts instantly; the scrim's 240ms fade and any card reversal are unreachable. Doc §9.2 requires "close: `play()` reversal — interruptible, same curve."

```tsx
// GrowthBriefModal.tsx — exit state before unmount
const [closing, setClosing] = useState(false);
const requestClose = useCallback(() => {
  if (prefersReducedMotion()) { onClose(); return; }
  setClosing(true);
  window.setTimeout(onClose, 340);           // >= longest exit animation
}, [onClose]);
// className={`fold open${closing ? ' closing' : ''}`}
// route Escape, backdrop click, Back/Bind buttons through requestClose
```

```css
.fold.closing { opacity: 0; transition: opacity 0.32s var(--ease-in-out-soft); }
.fold.closing .fold-doc-wrap {
  animation: fold-close 0.32s var(--ease-in-out-soft) forwards;
}
@keyframes fold-close {
  from { transform: rotateX(0) translateY(0); opacity: 1; }
  to   { transform: rotateX(8deg) translateY(-14px); opacity: 0; }
}
```

### 3.3 `settleEntry()` is a no-op — the `.is-arrived` CSS never existed (or was lost in 013) · S4
`Manuscript.tsx:93` adds `.is-arrived` to each new entry; no rule targets it. The doc's §5.6 "type that settles" (Fraunces SOFT relaxing as ink presses into paper) silently does nothing — and transcript 012 lists it as implemented & verified.

```css
/* fix — restores §5.6 exactly */
.entry .a-h {
  font-variation-settings: "SOFT" 30, "opsz" 40;
  transition: font-variation-settings 0.64s var(--ease-out-expo);
}
.entry.is-arrived .a-h {
  font-variation-settings: "SOFT" 14, "opsz" 40;
}
```

### 3.4 Every toast wears a success tick — including failures · S3
`Toasts.tsx` renders one hardcoded aubergine check for all messages: "Dossier deleted" ✅ …and "Could not delete dossier — the archive kept it" ✅. Violates doc §7.8 (danger slips: oxblood rule + strike glyph) and §13 (icon+color must match meaning). Also: no exit animation (instant unmount at 2800ms) and no max-3 cap (doc §7.8) — a burst of errors stacks unbounded.

```tsx
// types.ts
export interface ToastMessage { id: string; message: string; tone?: 'ink' | 'danger'; out?: boolean }

// Toasts.tsx — Slip
<div ref={ref} className={`toast${toast.tone === 'danger' ? ' danger' : ''}${toast.out ? ' out' : ''}`} role="status">
  {toast.tone === 'danger'
    ? <svg className="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h16M4 12l2-2M4 12l2 2M20 12l-2-2M20 12l-2 2"/></svg> /* strike glyph, §6.2 */
    : <svg className="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>}
  <span>{toast.message}</span>
</div>
// remove role="status" from Slip OR aria-live from the container — nested live regions double-announce

// App.tsx — showToast gains tone; exit + cap
const showToast = useCallback((message: string, tone: 'ink' | 'danger' = 'ink') => {
  const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
  setToasts((prev) => [...prev, { id, message, tone }].slice(-3));          // cap 3 (§7.8)
  setTimeout(() => setToasts((p) => p.map((t) => (t.id === id ? { ...t, out: true } : t))), 2800);
  setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3150);   // after exit transition
}, []);
// call sites: showToast('Could not delete dossier — the archive kept it', 'danger') etc.
```

```css
.toast.out { opacity: 0; transform: translateY(10px) rotate(-0.2deg); }   /* slip back down, §8.9 */
.toast.danger { border-left-color: var(--danger); }
.toast.danger .icon { color: var(--danger); }
```

### 3.5 Small-text contrast fails WCAG AA · S3
`--faint #9C9690` on `--canvas #F2F0E9` = **2.57:1** (AA needs 4.5:1 for text at any size). Used at 8.5-9.5px for *functional* text: composing-step details (`.st-d` — the live "consulting the archive" feedback), `.ctx-opt`, `.fm-mast .right`, `.fm-foot`, `.colo-state`, `.try .sc`, textarea placeholder. The doc's own §2.3 rule ("muted ink never below 12px") is exceeded in the wrong direction: even `--muted-ink` (4.7:1 ✅) ships at 9px in `.stamp`.

```css
/* fix — one token change brings every usage to AA */
--faint: #716A64;   /* 4.6:1 on #F2F0E9 — keeps the warm-gray family, passes AA */
```
Recommended companion (typography is owner-domain, so flagged not forced): lift 8.5px stamps/labels to ≥10px — 8.5px uppercase mono is at the edge of legibility regardless of contrast, and the doc's own scale bottoms out at 10.5px (`--t-micro`).

### 3.6 Rail hover animates `width` — layout property, anti-slop #7 · S4
`.rail { transition: width var(--dur-deliberate) }` (50px→280px). Animating width re-lays-out both islands and every label each frame. Contained (position: fixed), so it won't reflow the manuscript — but it's the one place the codebase violates its own motion law, and it's trivially replaceable with compositor-friendly `clip-path`:

```css
.rail {
  width: 280px;                                     /* constant — no layout animation */
  clip-path: inset(0 calc(100% - 50px) 0 0 round 0);
  transition: clip-path var(--dur-deliberate) var(--ease-out-expo);
}
.rail:hover, .rail:focus-within, .rail.open { clip-path: inset(0 0 0 0); }
/* islands keep their 48px icon column; labels already fade via opacity */
```

---

## 4. Claims vs. reality — transcript 012 (process finding, S3)

`agent-transcripts/012-bone-aubergine-design-reskin.md` is stamped "✅ IMPLEMENTED & EMPIRICALLY VERIFIED" and claims, against current HEAD:

| Claim (012) | Reality at HEAD | Explained by owner-declared intent? |
|---|---|---|
| "registration marks flanking the masthead" | absent | ❌ not in exclusion list |
| "deckle edge shadow rule" | absent | ❌ |
| "settleEntry() Fraunces SOFT axis relaxation … on arrival" | wired but no CSS → no-op (§3.3) | ❌ |
| "applyStagger() … capped at 5 items" (+13 unit tests "verifying … staggers") | never called; no arrival keyframes exist | ❌ — tests pass because they exercise the helper, not the feature |
| "flip() FLIP helper for smooth geometry transitions" | built, tested, zero call sites | ❌ |
| bone/aub token scales, dark spine, gold folios, dark-mode appendix | replaced/removed | ✅ 013 islands + owner exclusions |
| "theme-color updated to #F7F3EA" | now `#F2F0E9` | ✅ palette intentional (and current value *is* consistent with canvas) |

The 013 transcript documents the islands reskin but doesn't record dropping registration marks/deckle/settle-CSS. Per the repo's own AGENTS.md ("Never claim completion before command execution", "documentation must not describe planned behavior as completed") this needs a correction entry — cheap: one `agent-transcripts/014-design-conformance-correction.md` recording what 013 intentionally superseded and what was lost silently (then fix §3.3 or delete the call).

---

## 5. Remediation plan (prioritized, with the code that matters)

### P1 — Bugs & dead wiring (½ day, do first)
§3.1 `--crimson`, §3.2 fold close, §3.3 settle CSS, §3.4 toast tones/exit/cap, §3.5 `--faint`, §3.6 rail clip-path — all snippet-ready above. Plus **resolve every dead mechanism one way or the other** (wire or delete — dead code is banned by AGENTS.md):
- `play()`/`flip()`: wired by P3 items below; if P3 is descoped, delete them and their tests.
- `applyStagger()`: wired by P2's entry-arrive (inline `--i` is simpler than the helper — see below; then delete the helper).
- Leader ink-draw: wire it properly — the clean fix is tracking first-appearance inside `drawLines` itself:

```tsx
// LeaderLines.tsx — animate only notes never seen before (doc: "and only first")
const knownNotes = useRef<Set<string>>(new Set());
// inside drawLines(), replace the `animateIds` parameter logic:
const firstAppearance = !knownNotes.current.has(noteId);
if (firstAppearance) knownNotes.current.add(noteId);
if (firstAppearance) { /* existing dasharray/dashoffset block */ }
```

### P2 — Arrival & departure motion: the cheapest big feel-win (½ day)
Entries currently pop in and toasts/modals hard-cut. One CSS block restores §5.4 (and is The Bind's doc-sanctioned fallback):

```css
@media (prefers-reduced-motion: no-preference) {
  .entries > .entry {
    animation: entry-arrive 0.48s var(--ease-out-expo) both;
    animation-delay: calc(var(--i, 0) * 40ms);
  }
  @keyframes entry-arrive { from { opacity: 0; transform: translateY(10px); } }
}
```
```tsx
// Manuscript.tsx — cap the stagger index at render (replaces applyStagger)
{entries.map((entry, i) => /* on the entry element: */ style={{ ['--i' as string]: Math.min(i, 5) }} … )}
```
React keeps DOM nodes across re-renders, so the animation fires on mount only — new answers arrive, existing ones don't re-dance. Session switches replay the batch: acceptable (it *is* an arrival), or gate with a `firstMount` ref.

### P3 — Signature moments (the actual Awwwards delta; ~1-2 days)
In ROI order:

1. **The Strike (§9.3)** — highest drama-per-line; the plumbing already exists (`handleStrikeRun`):
```tsx
// App.tsx handleStrikeRun — choreograph BEFORE clearing state
const compEl = document.querySelector<HTMLElement>('.composing');
if (compEl && !prefersReducedMotion()) {
  compEl.classList.add('is-struck');
  window.setTimeout(finishStrike, 480);      // existing state-clearing body
} else finishStrike();
```
```css
.composing { position: relative; }
.composing::after {
  content: ""; position: absolute; left: 0; right: 0; top: 20px; height: 2px;
  background: var(--accent); transform: scaleX(0); transform-origin: left;
}
.composing.is-struck::after { transform: scaleX(1); transition: transform 0.4s var(--ease-out-expo); }
.composing.is-struck { filter: grayscale(0.6); transition: filter 0.32s linear; }
```
2. **The Bind (§9.1)** — View Transitions where supported, stagger fallback everywhere else (P2 provides it):
```tsx
// App.tsx submit path
const ta = document.querySelector<HTMLTextAreaElement>('#ckTa') ?? document.querySelector<HTMLTextAreaElement>('#fmTa');
const cardHost = document.getElementById('entries');
if (ta?.value && cardHost && 'startViewTransition' in document && !prefersReducedMotion()) {
  (document as any).startViewTransition(() => { appendQueryEntry(); });
} else appendQueryEntry();
```
```css
::view-transition-old(root) { animation: none; }
::view-transition-new(root) { animation: vt-rise 0.24s var(--ease-out-expo); }
@keyframes vt-rise { from { transform: translateY(14px); opacity: 0.4; } }
```
(full shared-element `query-ghost` naming per doc §9.1 is the v2 of this; the simple new-view rise already sells "your words settled onto the page")
3. **Toast exit + danger slips** — already in §3.4.
4. **Rail delete tip-out (§8.5)** — finally uses `play()`:
```tsx
// IndexRail.tsx delete handler
const wrap = (e.currentTarget as HTMLElement).closest<HTMLElement>('.rl-item-wrap');
const anim = wrap ? play(wrap, 'delete', [
  { transform: 'rotateX(0deg) translateY(0)', opacity: 1 },
  { transform: 'rotateX(10deg) translateY(-6px)', opacity: 0, offset: 0.6 },
  { transform: 'rotateX(10deg) translateY(-14px)', opacity: 0 },
], { duration: 320, easing: 'cubic-bezier(0.65, 0.05, 0.36, 1)' }) : null;
const commit = () => onDeleteSession(s.id);
anim ? anim.finished.then(commit).catch(commit) : commit();
```
```css
.rail-list { perspective: 600px; }
```
5. **Conflict shake (§8.10)** — App already detects the 409 (`Version conflict` toast); add the chip shake per doc snippet (`#impChip` exists as an id already).
6. **Plate FLIP origin (§8.8)** — capture `.plate-in` rect on Examine, animate `.pv-frame` from it via `flip()`; ~15 lines, doc snippet adapts directly.
7. **Esc keycap (§8.11)**, **provider dot travel (§8.4)** via `flip()` — small, do if budget remains.
8. **Bloom completion (§9.4)** — if the palette allows one ornament moment: endmark diamond in `--gold` + the 4-point sparkle; otherwise delete `--gold`/`--gold-soft` tokens (dead code).

### P4 — Discipline & performance (1 day, protects the score)
- **Radius scale**: adopt tokens `--r-0/--r-bead:3px/--r-card:9px/--r-modal:12px`; decide once whether 999px pills are a sanctioned exception (they read fine on the islands — but then write the exception into the doc, don't leave it as drift). Fold corners 16→12.
- **Shadow cross-fade law** (§10.1): move the five `box-shadow` transitions to pseudo-element opacity (doc snippet adapts 1:1 to `.snote-in`, `.rail-new`, `.rail-list`, `.compose-in`, `.fm-dock-in`).
- **`content-visibility`** on `.entry` with `contain-intrinsic-size: auto 640px` — caveat: leader endpoints for off-screen notes then measure against placeholder boxes, so add a debounced scroll-end `drawLines()` (this is the one case where scroll *should* trigger redraw; the doc's "no leader math on scroll" assumed no c-v).
- **Leader dirty-set**: wrap the MutationObserver callback in rAF-coalescing (`if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; drawLines(); })`) — 3 lines, kills redundant full re-measures during streaming.
- **Self-host fonts**: `npm i @fontsource-variable/{fraunces,newsreader,space-grotesk,spline-sans-mono}`, import in `main.tsx`, delete the Google `<link>`, add the doc's `size-adjust` fallback faces. Removes a render-blocking third-party origin — a real Awwwards perf criterion.
- **`@supports` fallback for `linear()` springs** (doc §5.3 requires it):
```css
@supports not (transition-timing-function: linear(0, 1)) {
  :root { --spring-snappy: var(--ease-spring); --spring-gentle: var(--ease-spring); --spring-heavy: var(--ease-in-out-soft); }
}
```
- **Plate viewer focus trap**: extract the Fold's trap into `useFocusTrap(ref, isOpen, onClose)` and use it in both modals (also removes duplication).
- **Reduced-motion for smooth scroll**: `behavior: prefersReducedMotion() ? 'auto' : 'smooth'` in LeaderLines click-jump.
- **Scrollbars**: the global `html, body, * { scrollbar-width: none }` removes *all* scroll affordance (long manuscripts, fold-doc, rail-list). Either scope the hide to the containers where it's deliberate and add edge-fade affordances, or style thin thumbs (`--border` track / `--faint` thumb — the doc assigned bone-4 to thumbs, i.e. it *wanted* visible styled scrollbars). Owner decision; current state is the one place the UI actively hides state from the user.

### P5 — Optional craft (only if chasing nomination)
Spine overture on first load (rail islands slide-in + hero word-rise stagger, once per session via `sessionStorage` flag) · icon morphs (§6.3 two-path stack fallback works everywhere) · marching composing dots · query-card rule draw-in · column-start tick on the masthead hairline · registration marks (2 places, 14px, 1.25px stroke — cheap "authored print" tell, if the islands direction allows them) · text-wrap pretty/balance · hanging punctuation on `.snote-q`.

---

## 6. Cannot verify statically (needs a browser session)

1. **Real-motion quality**: whether baked `linear()` springs render correctly on target browsers (Safari <17.4 lacks `linear()` — the @supports fallback above is the fix, but the *current* behavior on Safari needs eyeballing).
2. **Fold-open at 60fps** on mid-tier hardware (perspective + rotateX + shadow-modal is the heaviest paint in the app).
3. **Leader redraw cost at scale** (100-entry session during streaming — the missing dirty-set may or may not be user-visible).
4. **Contrast in situ** — computed ratios are solid math, but run axe/WAVE once after the `--faint` change (doc §14 phase-1 gate asks for exactly this).
5. **VTA behavior** for The Bind on Chrome/Edge/Safari current.
6. **Keyboard-only walkthrough** (doc §14 phase-6 gate): traps exist, but full traversal order + focus visibility across islands/drawer hasn't been exercised.
What's needed: `docker compose up` (or `npm run dev` against a live backend), 15 minutes with devtools performance panel + axe, and the StatesTray tour as the visual regression checklist (it already contains the right fixtures — extend it with strike/conflict/toast-burst states).

---

## 7. Bottom line

Against the doc, with the four intentional deviations excluded: **visual identity ≈80% delivered, motion system ≈35%, signature moments 1.75/5, anti-slop 9/12, copy/voice 100%.** The gap is not taste — it's that Phase 3-6 of the doc's own roadmap (§14) was stopped after the tokens-and-helpers layer, leaving tested-but-unwired motion code and three silent bugs. P1+P2 (~1 day) removes every dead mechanism and fixes all six bugs; P3 (~1-2 days) delivers the four missing signature moments that separate "very good editorial UI" from "a juror remembers it." Nothing found here requires rework of the islands direction, the palette, or the typography — the fixes live entirely inside the existing architecture and, in three cases (strike, bloom, fold), inside components that are already 80% there.
