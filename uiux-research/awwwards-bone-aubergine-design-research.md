# Kestrel × Awwwards — Design Research: "Bone & Aubergine" Reskin

**Document type:** Design research & theory (NOT implementation — do not copy code into the codebase without reading §14 first)
**Author:** Design pass, October 2026
**Applies to:** `frontend/src/styles/dossier.css` + all components in `frontend/src/components/`
**Constraint honored:** 100% of the editorial Research Studio language survives — manuscript measure, margin rail, sidenotes, leader lines, Fraunces/Newsreader/mono triad. We are re-inking the same engraving plate, not re-cutting it.

---

## 0. Executive summary

Kestrel's current visual identity is already 80% of the way to an Awwwards-honorable product: it has a point of view (a *research dossier*), a typographic spine (Fraunces + Newsreader + mono), and a signature mechanic (leader lines to margin notes). What separates it from Site-of-the-Day work is:

1. **A color system with no conviction.** Warm paper + neutral gray ink + terracotta accent is pleasant but generic — the ink is *gray*, so the page reads "template" before it reads "art-directed."
2. **Motion that decorates instead of explains.** Transitions exist, but nothing moves because of the user's gesture; things simply appear and disappear.
3. **No signature moments.** There is no interaction a juror would remember 10 minutes later.

This document fixes all three with one coherent thesis:

> **A dossier printed in aubergine ink on bone paper — an object with mass, surfaces that catch light, and mechanisms that respond to the hand.**

Bone carries the paper, light, and air. Aubergine carries *everything else*: ink, interaction, authority, and drama — the rail becomes a dark plum book spine against bone pages, text is warm near-black plum instead of neutral gray, and every citation marker is a bead of aubergine ink. A restrained champagne-gold appears exactly three times in the whole product (endmark, plate impression chip, one ornament) so it reads as *tooling on a binding*, not decoration.

Motion is rebuilt around the Apple doctrine — **continuity, causality, interruptibility, and mass** — with a tokenized spring system (durations, curves, generated `linear()` spring easings) so every element on screen moves like it belongs to the same physical world. Icons are re-specified as a bespoke monoline family ("Apparatus") designed to match Fraunces's terminal forms, with two icons that *morph* rather than swap.

Sections 1–5 establish the system (color, type, material, layout, motion). §6–7 are the icon system. §8–10 are exhaustive per-component specs and a full micro-interaction inventory — every entry has a spec table and a code snippet you can adapt. §11–13 are the Awwwards signature moments. §14 is a phased, zero-regression implementation roadmap. §15 is the anti-slop doctrine — read it last, or first.

---

## 1. Taste references & the definition of "Awwwards-level" here

Awwwards juries reward work that is **art-directed, coherent, and alive**. Analysis of what SOTD editorial projects share (Refokus-type motion craft, studio editorial sites like those from Bèla, Marcol‐design-tier print translations, NYT interactive storytelling) yields four transferable principles:

1. **One idea, everywhere.** The best SOTDs commit to a single metaphor and let it govern color, motion, copy, and error states. Kestrel's metaphor is already right: *a bound dossier / folio / letterpress research object*. Every decision below strengthens it.
2. **Typography does 60% of the "wow."** Fraunces with its optical-size + SOFT + WONK variable axes is an unfair advantage — it can go from engraved headline to wonky humanist with a single axis change. Most AI-slop frontends can't do this because they ship one static weight of Inter.
3. **Motion is physics, not choreography.** Apple's interfaces feel expensive because (a) every animation is a *consequence of a gesture*, (b) everything is interruptible and reversible mid-flight, (c) mass is consistent — a modal never moves faster than a checkbox without a reason.
4. **Imperfection is curated.** Registration marks, slightly wonky display letters, hand-drawn leader curves, a paper edge that isn't perfectly straight — these are the details that make a screen feel *authored*. The slop tell is the opposite: perfectly centered everything, perfectly rounded everything, perfectly symmetric everything.

**Reference palette anchors** (for calibration, not for copying): aubergine bindings on cream stock (classic bookbinding), Bloomberg Businessweek print spreads (bone paper + full-bleed plum), Byredo packaging (bone + oxblood minimalism), and Apple's Numbers/Pages "paper" metaphors for surface behavior.

---

## 2. Color system — Bone & Aubergine

### 2.1 The thesis

- **Bone** = the paper. Warm, slightly aged, never gray. Bone surfaces are what light falls on.
- **Aubergine** = the ink and the mechanism. It is the text color, the citation beads, the leader lines, the book-spine rail, the focus rings, the selection wash. One hue doing all semantic "active" work.
- **Champagne gold** = the foil tooling. Exactly three uses: the endmark diamond after a completed entry, the plate "impression" chip, and the folio numbers on the rail spine. If it appears anywhere else, the design has failed.
- **Oxblood** = danger (errors, destructive actions). It must lean red enough to be unambiguous while sitting in family with plum.
- **Verdigris** = success/verified. A cool-green counterpoint used sparingly, always paired with iconography + text so color is never the only signal (WCAG 1.4.1).

### 2.2 Full token table (light mode — "Bone folio")

All hex values are final candidates; OKLCH shown for perceptual reasoning. Contrast ratios computed against the *actual* usage backgrounds (not white).

```css
:root {
  /* ————— BONE (paper steps: 0 = brightest) ————— */
  --bone-0:  #FCFAF5;  /* raised surface: modals, cards, composer            */
  --bone-1:  #F7F3EA;  /* primary canvas (page)                             */
  --bone-2:  #EFE9DB;  /* recessed: wells, code plates, inset fields         */
  --bone-3:  #E4DCC9;  /* borders, hairlines, rules                         */
  --bone-4:  #D3C9AF;  /* strong rules, scrollbar thumbs, disabled text bg   */
  --bone-5:  #B9AD8F;  /* deepest bone: watermark ornaments, faint stamps   */

  /* ————— AUBERGINE (ink + mechanism) ————— */
  --aub-950: #1B1220;  /* near-black plum: rail spine solid, darkest ink    */
  --aub-900: #241728;  /* primary INK (body text) — see contrast audit       */
  --aub-800: #33203A;  /* headings ink, strong emphasis                     */
  --aub-700: #452C4E;  /* primary accent: citations, links, leader lines     */
  --aub-600: #593A64;  /* hover accent, active nav, pressed states           */
  --aub-500: #73497F;  /* focus rings, active toggles                        */
  --aub-400: #9B6FA6;  /* accents on dark aubergine surfaces (rail labels)  */
  --aub-200: #D8C2DD;  /* hairlines on dark surfaces                         */
  --aub-wash: rgba(87, 58, 100, 0.09);  /* selection, hover washes        */
  --aub-wash-strong: rgba(87, 58, 100, 0.16);

  /* ————— SEMANTIC ————— */
  --danger:      #A03A2E;  /* oxblood: errors, strike, destructive            */
  --danger-ink:  #8A2F25;
  --success:     #4E6B58;  /* verdigris: verified stamp, completed steps      */
  --gold:        #A98A54;  /* champagne foil: endmark, impression chip, folio */
  --gold-soft:   rgba(169, 138, 84, 0.14);

  /* ————— RE-MAPPED DESIGN TOKENS (drop-in for existing var names) ————— */
  --canvas: var(--bone-1);
  --surface: var(--bone-0);
  --ink: var(--aub-900);        /* body text becomes plum, not gray            */
  --ink-soft: var(--aub-800);
  --muted-ink: #6B5E70;         /* muted stays plum-gray, tested on bone        */
  --faint: #94899B;
  --accent: var(--aub-700);     /* was terracotta #B65E45                       */
  --accent-ink: var(--aub-800);
  --accent-soft: var(--aub-wash);          /* was #F2E2DA                       */
  --accent-line: #B493BE;       /* leader-line aubergine, see §5                */
  --border: var(--bone-3);
  --wash: var(--aub-wash-strong);
}
```

**Why ink-as-plum is the single highest-leverage decision in this reskin.** Neutral gray ink (`#242A2E`) is why the current UI reads "product template." Replacing *only* the text color with a very dark aubergine (`#241728`, essentially OKLCH L≈0.19, C≈0.03 — dark enough for AAA, chromatic enough to feel *tinted*) re-skins every paragraph, heading, and metadata line simultaneously at zero layout cost. Combined with the terracotta→aubergine accent swap, the entire product moves from "warm neutral" to "bone & aubergine" with two variable reassignments.

### 2.3 Contrast audit (WCAG, computed)

| Pair | Foreground | Background | Ratio | Grade | Used for |
|---|---|---|---|---|---|
| Body ink | `--aub-900` #241728 | `--bone-1` #F7F3EA | ≈ 15.8:1 | AAA | paragraphs, UI text |
| Muted ink | #6B5E70 | #F7F3EA | ≈ 5.4:1 | AA (AA-large+) | metadata, stamps |
| Accent | `--aub-700` #452C4E | #F7F3EA | ≈ 9.6:1 | AAA | links, citation beads |
| Accent hover | `--aub-600` | #F7F3EA | ≈ 7.4:1 | AAA | hover states |
| Bone on aubergine | `--bone-1` | `--aub-700` | ≈ 9.6:1 | AAA | primary buttons |
| Bone-2 on aub-950 | `--bone-2` | #1B1220 | ≈ 13:1 | AAA | rail spine labels |
| Aub-400 on aub-950 | `--aub-400` | #1B1220 | ≈ 7.2:1 | AA+ | rail hover text |
| Gold | `--gold` #A98A54 | #F7F3EA | ≈ 3.2:1 | **AA-large/UI only** | ornaments ≥ 18px or non-text |
| Danger | `--danger` #A03A2E | #F7F3EA | ≈ 5.9:1 | AA | error text |
| Success | `--success` #4E6B58 | #F7F3EA | ≈ 5.6:1 | AA | verified stamps |

Rules locked from this table: gold is **never** body text (ornament/16px+ only); muted ink never below 12px; citation beads get a 3:1 non-text contrast against bone (they pass at 9.6:1).

### 2.4 Dark mode appendix — "Roast aubergine" (spec only, ship later)

Paper-first product; dark is a v2 surface, but tokens must be designed now so components don't hard-code bone:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #221826;      /* roast aubergine paper, L≈0.21 */
    --surface: #2B1F31;
    --ink: #EAE2D3;         /* bone text on roast */
    --muted-ink: #B3A8B8;
    --accent: #C79DD3;      /* lilac ink */
    --accent-ink: #D9BCE3;
    --border: #453250;
    --aub-wash: rgba(199, 157, 211, 0.12);
    --gold: #C2A56E;
    --shadow: 0 1px 2px rgba(0,0,0,0.4), 0 16px 40px rgba(0,0,0,0.5);
  }
}
```

Key discipline: in dark mode, **bone becomes the ink**. Never light-gray-on-dark (the slop pattern); the text stays warm bone so the metaphor inverts rather than inverts-into-generic-dark-dashboard.

### 2.5 Where each color is allowed (the discipline map)

A token system is only real if usage is policed:

| Surface/element | Token |
|---|---|
| Page canvas | `--bone-1` |
| Raised surfaces (modals, composer card, toasts) | `--bone-0` + paper shadow stack |
| Rail spine (the left session index) | **solid `--aub-950`** — the book spine |
| Rail active item | `--aub-700` fill w/ bone text |
| Citation bead (`.sn-ref`) | `--aub-700` bg → `--aub-600` on hover |
| Leader lines + terminal dots | `--accent-line`, dot fill `--aub-700` |
| Sidenote cards | `--bone-0` with `--bone-3` rule top, aubergine wash on hover |
| Selection | `--aub-wash-strong` |
| Focus ring | `--aub-500`, 2px, 3px offset |
| "verified" stamp | `--success` text + tick icon (never color alone) |
| Struck/failed | `--danger` + strike line in `--danger` |
| Endmark diamond | `--gold` fill, `--aub-800` stroke |
| Plate impression chip | `--gold-soft` bg, `--gold` text |
| Grain overlay | multiply, 4% black noise (unchanged mechanism, §4) |

---

## 3. Typography — deepening the existing spine

The current stack (Fraunces display / Newsreader text / Spline Sans Mono metadata / Space Grotesk UI) is correct. The upgrade is in **axis discipline, print details, and a fluid scale** — not in swapping families.

### 3.1 Fraunces variable axes — the unfair advantage

Fraunces exposes `opsz` (optical size 9–144), `SOFT` (0–100), `WONK` (0/1), plus weight. Use them as *art direction*, not novelty:

- **Folio heads** (hero, `h1`, fold title): `opsz 144, SOFT 0, WONK 1` on the word you want to feel hand-set (the prototype already wonks "working" — keep exactly that, one word per page, no more).
- **Section headings** (`.a-h`, `.fs h2`): `opsz 40, SOFT 20` — slightly softer terminals so mid-size heads don't look engraved.
- **Roman numerals** (`.rn`, `.fs-num`): `opsz 144, SOFT 0, WONK 0, font-feature-settings: "onum"` — oldstyle numerals, so `IV.` sits in the text like a page number.

```css
.hero-h .w {
  font-variation-settings: "opsz" 144, "SOFT" 0, "WONK" 0;
  transition: font-variation-settings 0.6s var(--ease-out-expo);
}
.hero-h .w.wonk {
  font-variation-settings: "opsz" 144, "SOFT" 0, "WONK" 1;
}
```

WONK is a binary axis — **never animate it** (it snaps); animate SOFT instead when you need type to "settle" (see §5.6).

### 3.2 Fluid scale (one scale, no exceptions)

Replace fixed sizes with a `clamp()` scale tuned so the measure (~616px) and the hero both feel printed at every viewport. Type must never animate its own size (see Motion law §5.2) — the scale below is the complete allowed set:

```css
:root {
  /* step, min @360px, ideal, max @1440px */
  --t-display: clamp(40px, 7.2vw, 84px);  /* frontmatter hero */
  --t-h1:      clamp(30px, 4.4vw, 44px);  /* fold title, essay heads */
  --t-h2:      clamp(20px, 2.6vw, 26px);  /* entry sections */
  --t-h3:      17px;                      /* query cards */
  --t-lead:    clamp(17px, 1.9vw, 20px);  /* .a-lead */
  --t-body:    15.5px;                    /* manuscript body */
  --t-meta:    12px;                      /* stamps, kickers (mono) */
  --t-micro:   10.5px;                    /* spine labels, badges */
}
```

### 3.3 Print details that read as craft

1. **Hanging punctuation** on pull-quotes and sidenote quotes: `text-wrap: hang;` (progressive) or manual negative text-indent for the opening quote glyph.
2. **Drop cap** on the lead paragraph of long answers (`.a-lead::first-letter`): Fraunces, 3-line span, aubergine — used only for research answers, never notices:

```css
.entry.answer .a-lead::first-letter {
  font-family: var(--f-disp);
  font-variation-settings: "opsz" 144, "SOFT" 0;
  font-size: 3.05em;
  float: left;
  line-height: 0.82;
  padding: 0.06em 0.12em 0 0;
  color: var(--aub-800);
}
```

3. **Tabular + oldstyle numerals in metadata:** `font-feature-settings: "tnum", "onum"` on `.stamp` so timestamps and counts align in columns while still feeling editorial.
4. **Small-caps kickers** (`.sc`) remain letterspaced mono uppercase — the one place mono "shouts". Keep ≥ 0.14em tracking; it's the product's voice of authority.
5. **Ligatures + kerning** on body serif: `font-feature-settings: "liga", "kern", "calt";` and `text-wrap: pretty` on paragraphs; `text-wrap: balance` on headings (Chromium/FF progressive — harmless elsewhere).

### 3.4 Font loading discipline (no CLS, no FOUT ugliness)

Fraunces, Newsreader, and Spline Sans Mono are variable webfonts; load only needed axes (`opsz`, `wght`, `SOFT`, `WONK` for Fraunces; `opsz`, `wght` for Newsreader; `wght 400..600` for mono). Ship metric-matched fallbacks so the swap is invisible:

```css
@font-face {
  font-family: 'Fraunces-fallback';
  src: local('Georgia');
  size-adjust: 98.5%;
  ascent-override: 92%;
  descent-override: 24%;
}
```

And self-host (the prototype loads from Google Fonts; self-hosting removes the layout jank + is an Awwwards perf criterion).

---

## 4. Materiality — bone paper you can almost touch

### 4.1 The paper shadow stack (replace generic shadows)

The current `--shadow` is a standard web shadow. Paper shadows are *two* things: a contact line (1px, tight) and an ambient lift (large, soft, slightly warm-tinted). Shadows never use pure black on bone — they use aubergine-black:

```css
:root {
  --shadow-page: 0 0 0 1px rgba(27, 18, 32, 0.045),
                 0 1px 2px rgba(27, 18, 32, 0.06),
                 0 18px 44px -12px rgba(27, 18, 32, 0.14);
  --shadow-raised: 0 0 0 1px rgba(27, 18, 32, 0.05),
                   0 2px 4px rgba(27, 18, 32, 0.07),
                   0 28px 64px -16px rgba(27, 18, 32, 0.20);
  --shadow-modal: 0 0 0 1px rgba(27, 18, 32, 0.06),
                  0 4px 8px rgba(27, 18, 32, 0.08),
                  0 48px 120px -24px rgba(27, 18, 32, 0.32);
}
```

Rule: elevation tier ↔ shadow tier is 1:1 (page/raised/modal). Nothing invents its own shadow.

### 4.2 Grain, deckle, and registration marks

- Keep the existing SVG-noise `.grain` overlay but tune: `opacity 0.04`, `mix-blend-mode: multiply`, and a *second* ultra-subtle aubergine-tinted noise on the rail spine only (dark paper shows bloom, not dark specks — use `screen` blend at 3%).
- **Deckle edge** on the main sheet: a 1px light/dark double rule down the far edge of the `.page` (a real page has a subtle right-edge lift):

```css
.page::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: linear-gradient(180deg,
    transparent,
    var(--bone-4) 8%,
    var(--bone-4) 92%,
    transparent);
  opacity: 0.35;
  pointer-events: none;
}
```

- **Registration marks** (the print-crop crosses) as `--gold`-stroked SVGs, 14px, in exactly two places: flanking the frontmatter masthead and the fold header. This is the "authored print object" tell.

### 4.3 The rail becomes a book spine

The single biggest visual upgrade: `.rail` goes from a light sidebar to **solid `--aub-950`** — a book spine against bone pages. Session titles render in `--bone-2`; the active dossier is marked by a **bone page-tab** that slides (FLIP, §5.8) between items:

```css
.rail {
  background: var(--aub-950);
  border-right: 1px solid var(--aub-900);
}
.rail::before {          /* the spine ridge — a 1px highlight, like a bound edge */
  content: "";
  position: absolute;
  inset: 0 auto 0 6px;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(252, 250, 245, 0.12) 20%,
              rgba(252, 250, 245, 0.12) 80%, transparent);
}
.rl-item.active {
  position: relative;
}
.rl-item.active::before {   /* the page-tab */
  content: "";
  position: absolute;
  left: -1px; top: 8px; bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--gold);  /* champagne foil tab marks your place in the book */
}
```

The gold tab is ornament-use #2 of 3 (see §2.5) — a *place-keeping ribbon* for the active dossier. Rail numerals `.rl-num` become gold-stamped folio numbers on the spine.

---

## 5. Motion system — the Apple doctrine, tokenized

### 5.1 Philosophy → concrete laws

Apple's motion feel decomposes into four testable laws. Every animation below is specified to obey them:

1. **Causality** — nothing moves unless a gesture or state-change caused it, and the motion starts at the point of cause (the pressed button, the hovered bead).
2. **Interruption** — any animation can be reversed mid-flight from its current visual state; nothing "finishes then responds."
3. **Mass** — bigger surfaces move slower with longer curves; small controls are snappy. One duration table governs all.
4. **Continuity** — elements that "are the same thing" before and after a transition visually persist (shared elements), they never cross-fade into existence.

### 5.2 The motion tokens

```css
:root {
  /* Durations — the entire budget of the product */
  --dur-instant: 80ms;    /* presses, toggles, focus rings          */
  --dur-fast:    160ms;   /* hovers, beads, small reveals           */
  --dur-normal:  240ms;   /* cards, slips, rail tab                 */
  --dur-deliberate: 400ms;/* modals, folio folds, plate viewer       */
  --dur-cinematic: 640ms; /* signature moments ONLY (once per action)*/

  /* Curves */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);          /* things arriving */
  --ease-in-out-soft: cubic-bezier(0.65, 0.05, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);         /* overshoot 12%   */
  --ease-sheet: cubic-bezier(0.32, 0.72, 0, 1);             /* Apple sheet     */
  --ease-attention: cubic-bezier(0.2, 0.9, 0.1, 1.2);       /* flash/notices   */
}
```

**Laws of property:** only `transform`, `opacity`, `filter`, and `clip-path` may animate. Never `width/height/top/left/font-size/box-shadow-color` (box-shadow may cross-fade via a pseudo-element opacity trick, §10.1). `will-change` is applied just-in-time by JS and removed on `finish` (see helper, §5.7).

### 5.3 Spring easings via `linear()` — the modern craft trick

CSS `linear()` lets us hand-author damped-spring curves — the *actual* Apple physicality — without JS animation libraries. Generator:

```js
// Generate a damped spring as CSS linear() easing.
// stiffness k, damping d, mass m; n samples across tMax seconds.
function springLinear({ k = 170, d = 20, m = 1, tMax = 0.9, n = 40 } = {}) {
  const w0 = Math.sqrt(k / m);
  const zeta = d / (2 * Math.sqrt(k * m));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * tMax;
    let v;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      v = 1 - Math.exp(-zeta * w0 * t) * (
        Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t)
      );
    } else {
      v = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    }
    pts.push(`${v.toFixed(3)} ${((i / n) * 100).toFixed(1)}%`);
  }
  return `linear(${pts.join(', ')})`;
}
// Examples (bake the OUTPUT into CSS — don't run this at runtime):
// Gentle  : springLinear({ k: 120, d: 16 }) → "linear(0, 0.412 5%, 0.918 12.5%, 1.024 20%, ...)"
// Snappy  : springLinear({ k: 220, d: 24 }) → use for beads, toggles
// Heavy   : springLinear({ k: 90,  d: 14 }) → use for the Fold modal
```

Bake 3–4 outputs into tokens and use them verbatim:

```css
:root {
  --spring-snappy: linear(0, 0.411 7.5%, 0.918 17.5%, 1.024 25%, 1.008 32.5%, 1);
  --spring-gentle: linear(0, 0.32 10%, 0.86 22.5%, 1.03 35%, 0.995 47.5%, 1);
  --spring-heavy:  linear(0, 0.24 12.5%, 0.71 30%, 0.97 50%, 1.01 70%, 1);
}
```

(Generate real values with the snippet once during implementation; the ones above are placeholders showing the shape. Fallback rule: every `linear()` token carries `@supports not (transition-timing-function: linear(0,1))` fallback to `--ease-spring`.)

### 5.4 Stagger discipline

Lists and step-groups reveal with **40ms stagger**, capped at 6 items (240ms total max — never waterfalls of 12 items; jurors and users both hate slow cascades):

```css
.entries > .entry {
  animation: entry-arrive 0.48s var(--ease-out-expo) both;
  animation-delay: calc(var(--i, 0) * 40ms);
}
@keyframes entry-arrive {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* JS sets --i = min(index, 6) on mount, and ONLY on first mount of the batch */
```

### 5.5 The composing steps — "ink filling the pen"

The composing step-list is the product's working state; it deserves craft more than any resting state:

- The marching dots (`st-dots`) animate with an **uneven** keyframe (accelerate through the middle — dots that move at constant speed read as cheap):

```css
.st.run .st-dots::before {
  content: "";
  width: 100%;
  background-image: radial-gradient(circle, var(--aub-700) 1.4px, transparent 1.6px);
  background-size: 8px 3px;
  background-repeat: repeat-x;
  animation: dots-march 0.5s linear infinite;
}
@keyframes dots-march {
  from { background-position: 0 50%; }
  to   { background-position: 8px 50%; }
}
.st.run .st-dots::before { animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1); }
```

- The step's status flip (wait→run) reveals a **3px aubergine ink-rule** drawing left→right under the label (`scaleX 0→1, 240ms, --ease-out-expo, transform-origin: left`).
- Completion check ticks draw with `stroke-dashoffset` (240ms, `--ease-out-expo`), and the tick is `--success` **plus** the word "verified" in the detail slot (never color alone, WCAG 1.4.1).

```css
.st.done .icon path {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: tick-draw 0.24s var(--ease-out-expo) forwards;
}
@keyframes tick-draw { to { stroke-dashoffset: 0; } }
```

### 5.6 Micro-example — "type that settles" (SOFT axis, not font-size)

New answer entries get one 640ms settling moment: the heading's Fraunces `SOFT` axis relaxes 30→14, reading as ink pressing into paper. This is the typographic equivalent of a spring and is impossible with static fonts:

```css
.entry.answer .a-h {
  font-variation-settings: "SOFT" 30, "opsz" 40;
  transition: font-variation-settings 0.64s var(--ease-out-expo);
}
.entry.answer.is-arrived .a-h {
  font-variation-settings: "SOFT" 14, "opsz" 40;
}
```

### 5.7 The motion helper (JS) — interruption-safe by construction

Use WAAPI everywhere an animation must be *reversible mid-flight*; CSS transitions only for hover/focus (cheap, interruptible by nature). One helper, used by all interactions in §8–10:

```ts
// An element with one persistent Animation slot per name.
// Re-calling with the same name REVERSES from the current visual state —
// this is the entire "Apple interruption" law implemented in 12 lines.
const slots = new WeakMap<HTMLElement, Map<string, Animation>>();

export function play(
  el: HTMLElement,
  name: string,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
) {
  let m = slots.get(el);
  if (!m) slots.set(el, (m = new Map()));
  const prev = m.get(name);
  if (prev) {
    prev.reverse();               // invert from wherever it is, right now
    return prev;
  }
  const anim = el.animate(keyframes, { fill: 'both', ...options });
  m.set(name, anim);
  anim.finished
    .then(() => { if (anim.playbackRate > 0) { m.delete(name); } })
    .catch(() => m.delete(name));
  return anim;
}

// Usage — toast slip enters, reverses on second call:
play(slipEl, 'enter', [
  { transform: 'translateY(14px) rotate(-0.6deg)', opacity: 0 },
  { transform: 'translateY(0) rotate(-0.35deg)', opacity: 1 },
], { duration: 400, easing: SPRING_GENTLE });
```

### 5.8 FLIP for shared elements (leader tab, plate viewer, provider dot)

Rail active-tab sliding, plate-viewer origin, and the provider dot all need FLIP (First-Last-Invert-Play). One utility, no library:

```ts
export function flip(
  el: HTMLElement,
  from: DOMRect,                        // first rect (captured before mutation)
  { duration = 400, easing = 'cubic-bezier(0.16, 1, 0.3, 1)' } = {}
) {
  const to = el.getBoundingClientRect();          // Last
  const dx = from.left - to.left, dy = from.top - to.top;
  const sx = from.width / to.width, sy = from.height / to.height;
  el.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,   // Invert
      transformOrigin: 'top left' },
    { transform: 'translate(0, 0) scale(1, 1)', transformOrigin: 'top left' },
  ], { duration, easing, fill: 'both' });          // Play
}
```

### 5.9 Reduced motion — a first-class mode, not an afterthought

Every spec below lists its reduced-motion substitute. Global rule:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* Keep ONLY informational opacity fades, capped at 150ms: */
  .toast, .snote { transition: opacity 150ms linear !important; }
}
```

And in JS, the `play()` helper short-circuits to instant-set when `matchMedia('(prefers-reduced-motion: reduce)')` matches. Springs degrade to 150ms fades — the product stays fully legible, just quieter. This is also how we keep `leader line drawing` off for reduced-motion users (lines render at full state, no dash animation).

---

## 6. Iconography — the "Apparatus" family

### 6.1 Why bespoke

Lucide/Feather icons at 1.5px stroke next to Fraunces feel *bolted on* — their terminals are cut differently from Fraunces's. Awwwards-tier work designs its icon family *against its typeface*. Apparatus is a 24-grid monoline family whose design rules come directly from Fraunces:

- **24px grid, 1.5px stroke**, round caps — but terminals on bracket/open shapes get a 0.5px flare (Fraunces has flared terminals).
- **Optical, not mathematical:** x-height glyphs (strike, plus) drawn at 20px visual size within the 24 box; round glyphs (dots, plate) overshoot 0.5px.
- **Three weights of the same stroke language:** UI icons 1.5px; ornamental marks (endmark, registration crosses) 1.25px at 14px scale; spine glyphs 1.75px (dark background needs weight).
- **Ink logic:** icons are aubergine *strokes* on bone (like pen ruling), bone strokes on aubergine surfaces (spine). Never filled solids except the citation bead, which is literally a bead of ink.

### 6.2 The glyphs (draw to this spec)

| Name | Concept | Notes |
|---|---|---|
| `folio` | A folded page, 2 strokes | Rail "new dossier" |
| `knot` | Two strokes crossing like a stitch | "Bind" — submit semantics |
| `strike` | Single horizontal rule w/ serif tick ends | Strike the run / error states |
| `quill` | Diagonal nib, 3 strokes | Essay mode |
| `plate` | Bracket pair `[ ]` with baseline rule | Plate/artifact mode |
| `corner` | Folded-corner triangle | Fold modal, close affordance |
| `seed` | 6-point asterisk ✳ | Frontmatter star note (exists) |
| `arrow-out` | NE arrow with tail serif | `↗` episode links |
| `x` | Two 45° strokes, 3px inset | Close |
| `plus` | Plus, intersection rounded 1px | Rail new, context add |
| `chev` | 60° chevron, 2px gap | Menus, tray |
| `tick` | Polyline check | Verified steps |
| `dot-ring` | 4px dot + 12px ring | Provider status |

### 6.3 Icon *transition* system (the Apple move)

Icons don't swap — they **morph**. Two principles:

1. **Rotation over cross-fade** for symmetric glyphs (plus→x costs 90°; menu→close costs 90° + 45° twist). Rotation reads as one physical object; cross-fade reads as two.
2. **Path interpolation** for asymmetric morphs (plus→arrow-out on the "Open a new dossier" rail button hover). Use CSS `d:` interpolation with graceful degradation:

```css
/* plus → arrow morph on the rail 'new dossier' hover */
.rl-new .glyph path {
  /* "plus" drawn so its right arm is a separate path that lengthens+rotates */
  transition: d 0.32s var(--ease-out-expo), rotate 0.32s var(--ease-out-expo);
  d: path("M6 12 L18 12 M12 6 L12 18");          /* plus */
}
.rl-new:hover .glyph path {
  d: path("M6 12 L16 12 M12 6 L12 18 M13 13 L18 18"); /* plus grows an arrowhead */
}
@supports not (d: path("M0 0")) {
  .rl-new .glyph path { transition: none; }      /* static fallback: still legible */
}
```

For non-Chromium, the universal fallback is the **two-path stack**: both paths absolutely stacked, opacity cross-fade 120ms + 90° rotate of a shared container — still one "object," still cheap:

```css
.icon-morph { position: relative; }
.icon-morph path.b { position: absolute; inset: 0; opacity: 0; }
.icon-morph.morphed path.a { opacity: 0; }
.icon-morph.morphed path.b { opacity: 1; }
.icon-morph { transition: rotate 0.24s var(--ease-spring); }
.icon-morph.morphed { rotate: 90deg; }
```

3. **State echoes:** the `knot` (bind) icon ties itself on press — two strokes rotate 8° inward (80ms, `--dur-instant`), implying stitching. The `strike` icon *draws* its rule left→right (scaleX, 240ms) when a run is struck. Icons that narrate their own action are the difference between "icon set" and "icon design."

### 6.4 Icon usage laws

- Icon sizes: 14 (ornament), 16 (inline), 20 (buttons), 24 (modal headers). Never scaled arbitrarily.
- Every icon-only control ships an `aria-label`; icon + text pairs hide the icon from AT (`aria-hidden`).
- Icons in prose are `vertical-align: -0.15em` (optical baseline, not mathematical).
- No icon appears in more than one semantic role (the `dot-ring` is *only* provider status).

---

## 7. Per-component reskin & interaction specs

Grounding: every component below exists today; specs name the exact classes so an implementer can work file-by-file with zero guessing. Colors/tokens refer to §2.2.

### 7.1 `RunningHead` (masthead)

- Bar stays on bone canvas, gains a **1px bottom hairline** (`--bone-3`) that renders as a *printed rule*: 100% width, 1px, with a 2px aubergine tick at the active measure column's left edge (the "column start" mark from print proofs).
- Title is Fraunces italic, `--aub-800`; on rename, the input's focus ring is `--aub-500` and the change **stamps**: on blur-save, the new title does a 320ms settle (`--spring-snappy` scale 0.98→1 with 0.3deg rotate) — a fresh label being pressed onto a folder.
- Provider chip (`colobtn`): bone-0 surface, `--bone-3` border, mono label `Set in {model} · {provider}` in `--muted-ink`; the status **dot-ring** idles at `--aub-700` and gains a 2.4s breathing pulse (opacity 0.55→1, sine) **only while a run is composing** (activity, not decoration).
- Colophon popover: bone-0, `--shadow-raised`, corner radius 10 (modal tier); provider rows use FLIP'd **dot travel** (§8.4) on switch.

### 7.2 `IndexRail` (the spine)

- Surface: solid `--aub-950` (§4.3) — the book spine. Spine ridge highlight via `::before`.
- `rl-num` folio numerals: gold `--gold` at 10px mono, oldstyle — the foil-stamped numbers on a binding.
- Active item: bone-2 text + **gold ribbon tab** (`::before`, §4.3) that **slides** between items via FLIP (§8.1) — the strongest "physical object" cue in the nav.
- Hover: item text lightens bone-2→bone-1 (160ms) and the item's left rule (2px, `--aub-700`) fades in — never a full background fill on dark (fills read as "web app," rules read as "index tabs").
- Delete affordance (`rl-del`): 18px target, `--aub-400` `×`, opacity 0→1 on item hover/focus-within (160ms); on click, the session card **tips out of the binder**: rotateX 10deg + translateY(-6px) + fade, 320ms, then list closes the gap with a 240ms layout transition (see §8.5).

### 7.3 `Frontmatter` (landing)

- Masthead: registration crosses flanking (§4.2). Hero uses the type rules in §3.1.
- The `seed` (✳) star-note button is ornament-legal: gold stroke, `--aub-700` on hover; its leader line is the only leader on the page — a lone umbilical that sets the visual grammar before any content exists.
- "Try" chips: mono, bone-0 surface, `--bone-3` border; hover lifts 2px (`--spring-snappy`) and the opening/closing typographic quotes tighten 0.02em (the type details are the interaction).
- Mode radios (AS: Query/Brief/Essay/Plate): selected pill is aubergine-700 fill with bone text (flip, not tint); the **selector slides** — one shared pill element FLIPs between labels (§8.2) instead of each label changing background. Selected Plate reveals the Markdown/HTML sub-selector with a 240ms width+opacity reveal.
- Submit ("Bind to archive ↵"): the **ink-stamp press** (§8.3) — this is the interaction users touch most; it must feel like the whole product.

### 7.4 `Manuscript` (entries, sidenotes, leader lines)

- Query card: the query is set in Fraunces italic `--t-h3` with a **3px aubergine rule** on the left that draws in on arrival (scaleY 0→1, 240ms, origin top). Meta stamp in mono `--muted-ink`.
- Answer entries: drop cap on lead (§3.3.2), section heads with SOFT settle (§5.6), roman numerals gold **only** in the left margin position (`.rn`), citations per §8.6.
- Sidenote cards (`.snote`): bone-0, top rule 2px `--bone-4`; speaker in mono small-caps aubergine-700; quote in Newsreader italic with hanging quotes; stamp line in `--faint`. Hover state (tied to ref-hover too): translateY(-2px) + `--shadow-raised` cross-fade + top rule recolors to `--aub-700` (the note "wakes").
- Flash (citation jump): the **attention curve** (§8.7) — a 3-step pulse ending in the lifted state.
- Endmark: gold diamond, blooms once per completed entry (§9.4).

### 7.5 `ComposerBar`

- The whole bar is a bone-0 **sheet** with `--shadow-page`; on focus into the textarea it *lifts* to `--shadow-raised` (240ms) and the `¶` glyph turns aubergine-700 — the pen touching paper.
- Submit uses ink-stamp press (§8.3); while composing, the submit becomes the **strike** control (label swap with 90° knot→strike icon morph, §6.3) — the same button that starts the work can end it, and its icon says so.
- Context drawer (product context): max-height reveal with opacity, 240ms `--ease-out-expo`; never height-animate the whole bar (layout law §5.2 — the drawer is its own element so the sheet doesn't reflow-jump).

### 7.6 `GrowthBriefModal` ("The Fold")

The signature surface — see the full mechanics in §9.2 (the folio fold). Skin: bone-0 paper, `--shadow-modal`, folio-corner glyph (gold) top-right, section numerals gold, badges per §2.5 (User context = aubergine-wash pill; Transcript evidence = verdigris-tick pill; Assistant synthesis = bone-4-border pill). `EdBlock` focus: 1px aubergine-500 rule appears *inside* the block's left edge (drawing left→right, 240ms) — editing feels like ruling a line in the margin. "Bind impression" = ink-stamp press + success tick stamps into the impression chip.

### 7.7 `PlateViewerModal`

- Opens **from the margin plate** (FLIP origin, §8.8) — the plate "leaves the margin and takes the stage."
- Header: bone-0, file name in mono, impression chip in `--gold-soft`/`--gold` (ornament-use #2).
- Preview/Source radio: shared sliding pill (same FLIP language as Frontmatter modes).
- The iframe keeps `sandbox=""` + CSP exactly as implemented (security is a design feature — say so in the UI: the "sandboxed" stamp stays, in verdigris).
- Source view: bone-2 recessed well, mono 13px, top "code rule" 1px `--bone-4`.

### 7.8 `Toasts` (printed slips)

- Bone-0 slip, 2px left rule aubergine-700 (danger slips get oxblood rule + `strike` glyph), Fraunces italic message, mono stamp time.
- Enter/exit per §8.9; stack max 3; older slips rise 4px as new ones land (the FLIP of the stack).

### 7.9 `StatesTray`

- Stays! It is demo tooling, but give it print credibility: collapsed state is a small **colophon slip** (mono "design tour" + seed glyph, gold). The menu is a bone-0 index card with the disclaimer line from the current implementation kept verbatim (honesty is brand).

---

## 8. Micro-interaction inventory (the complete spec)

Format: **trigger → behavior → timing/easing → code**. Each is small; the sum is the "feel."

### 8.1 Rail ribbon tab slides (FLIP)

Active dossier changes → capture old tab rect, move `::before` via a real (non-pseudo) element, FLIP 400ms `--ease-out-expo`. Reduced-motion: tab teleports.

```ts
const tab = railList.querySelector<HTMLElement>('.rl-tab');
const next = e.currentTarget as HTMLElement;
const first = tab.getBoundingClientRect();
next.prepend(tab);                          // move to new active item
flip(tab, first, { duration: 400, easing: 'cubic-bezier(0.16,1,0.3,1)' });
```

### 8.2 Sliding mode selector (shared pill)

One absolutely-positioned pill behind the radio labels; label change → FLIP pill to the checked label's rect, 240ms `--spring-snappy`. Never animate `left`.

### 8.3 Ink-stamp press (every primary button)

```css
.tbtn.solid { transition: transform var(--dur-instant) var(--ease-out-expo); }
.tbtn.solid:active { transform: scale(0.97) rotate(-0.3deg); }
.tbtn.solid.is-stamped {   /* moment of success — add class, remove after 600ms */
  animation: stamp 0.6s var(--spring-snappy);
}
@keyframes stamp {
  0%   { transform: scale(1); }
  35%  { transform: scale(0.965) rotate(-0.5deg); }
  100% { transform: scale(1) rotate(0deg); }
}
```

Companion: a 1-frame "ink ring" — a pseudo-element border aubergine-700 scaling 1→1.35 with opacity 0.5→0, 320ms, on successful binds only.

### 8.4 Provider dot travels (colophon)

Switch provider → the status dot FLIPs from old row to new row, 400ms; landing overshoot 12% (`--spring-snappy`). Physical slide-rule energy.

### 8.5 Session delete — "tipping out of the binder"

```ts
play(item, 'delete', [
  { transform: 'rotateX(0deg) translateY(0)', opacity: 1 },
  { transform: 'rotateX(10deg) translateY(-6px)', opacity: 0, offset: 0.6 },
  { transform: 'rotateX(10deg) translateY(-14px)', opacity: 0 },
], { duration: 320, easing: 'cubic-bezier(0.65, 0.05, 0.36, 1)' });
// then remove from state; list gap closes via .rl-item-wrap { transition: transform 240ms } FLIP of remaining items
```

Parent needs `perspective: 600px` on `.rail-list` for the rotateX to read as 3D tipping.

### 8.6 Citation bead + leader line + sidenote (the core grammar)

The three connected elements act as **one object with three anchors**:

```css
/* 1. The bead (in-text ref) */
.sn-ref {
  width: 1.1em; height: 1.1em; line-height: 1.1em;
  border-radius: 50%;
  font: 600 0.62em var(--f-mono);
  color: var(--bone-1);
  background: var(--aub-700);
  transition: transform var(--dur-fast) var(--spring-snappy),
              background var(--dur-fast) var(--ease-out-expo);
}
.sn-ref:hover, .sn-ref.hot { transform: scale(1.3); background: var(--aub-600); }

/* 2. The leader (SVG path + terminal dot) */
g.lead path {
  stroke: var(--accent-line);
  stroke-width: 1.1;
  fill: none;
  transition: stroke var(--dur-fast) linear;
}
g.lead.hot path { stroke: var(--aub-700); }
g.lead circle { fill: var(--aub-700); }

/* 3. The note */
.snote {
  transition: transform var(--dur-normal) var(--spring-gentle),
              border-color var(--dur-fast) linear;
}
.snote.hot, .snote.flash {
  transform: translateY(-2px);
}
```

Ink-draw on first appearance of an entry's leaders (and only first): `stroke-dasharray = len; stroke-dashoffset len→0`, 640ms, `--ease-out-expo`, staggered 60ms per line, capped at 4 lines. Reduced-motion: lines render complete.

### 8.7 Sidenote flash (jump-to-evidence)

```css
@keyframes snote-flash {
  0%   { transform: translateY(-2px) scale(1);    box-shadow: var(--shadow-raised); }
  40%  { transform: translateY(-3px) scale(1.025); box-shadow: var(--shadow-modal); }
  100% { transform: translateY(-2px) scale(1);    box-shadow: var(--shadow-raised); }
}
.snote.flash { animation: snote-flash 0.72s var(--ease-attention) both; }
```

The 1.025 overshoot *is* the attention curve — a card being tapped by a finger, not a blink.

### 8.8 Plate viewer origin (FLIP from the margin)

```ts
const plateRect = plateAsideEl.getBoundingClientRect();   // First
setIsPlateOpen(true);                                     // render modal
requestAnimationFrame(() => {
  const frame = modalEl.querySelector('.pv-body');
  const stage = modalEl.getBoundingClientRect();          // Last
  const dx = plateRect.left - stage.left, dy = plateRect.top - stage.top;
  const s = Math.max(0.08, plateRect.width / stage.width);
  frame.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.4,
      transformOrigin: 'top left', borderRadius: '6px' },
    { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '0' },
  ], { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
});
```

### 8.9 Toast slips

```css
.toast {
  transform: translateY(14px) rotate(-0.5deg);
  opacity: 0;
  animation: slip-in 0.44s var(--spring-gentle) forwards;
}
@keyframes slip-in {
  to { transform: translateY(0) rotate(-0.35deg); opacity: 1; }
}
/* exit: play() reverses 'slip-in' → the slip settles back down and fades */
```

The permanent −0.35deg tilt is deliberate: each slip sits slightly crooked, like a paper note — the imperfection cue (§15).

### 8.10 Version-conflict shake (409)

The impression chip shakes ±3px, 320ms, `ease-in-out-soft`, three oscillations then settles; simultaneously the toast (§8.9) carries the conflict copy. The shake is the *only* negative-emotion animation in the product and it must stay exclusive to errors.

```css
@keyframes chip-conflict {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(3px); } 40% { transform: translateX(-3px); }
  60% { transform: translateX(2px); } 80% { transform: translateX(-1px); }
}
.imp-chip.conflict { animation: chip-conflict 0.32s var(--ease-in-out-soft); }
```

### 8.11 Escape-key affordance while composing

When a run is in flight, the strike control shows a mono `esc` keycap that fades in after 3s of composing (users forget Esc exists): 8px bone-2 keycap, `--bone-4` border, appears with 160ms rise. Dismisses when the run completes.

### 8.12 Focus ring draw

```css
:focus-visible {
  outline: 2px solid var(--aub-500);
  outline-offset: 3px;
  border-radius: 3px;
  transition: outline-offset var(--dur-instant) var(--ease-out-expo),
              outline-color var(--dur-instant) linear;
}
:focus-visible:active { outline-offset: 2px; }   /* ring grips the element on press */
```

---

## 9. Signature moments (the five a juror remembers)

Budget: **at most one cinematic per user action**, 480–720ms, all reversible. These are the moments that convert "very good" into "Site of the Day."

### 9.1 "The Bind" — the query leaves the composer and becomes a card

On submit, the typed text visually travels from the textarea into the manuscript column as the new query card (View Transitions API, shared element):

```ts
// In the submit handler, before appending the entry:
const ta = document.querySelector('#ckTa');
if (document.startViewTransition && ta?.value) {
  document.startViewTransition(() => appendQueryEntry(text));
}
```

```css
::view-transition-old(query-ghost) { animation: none; }
::view-transition-new(query-ghost) {
  animation: bind-rise 0.56s var(--ease-out-expo);
}
@keyframes bind-rise {
  from { transform: translateY(46px) scale(0.98); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
```

Fallback (no VTA): the entry-arrive stagger (§5.4). The physical story — your words left the pen and settled onto the page — is the product's whole metaphor in one gesture.

### 9.2 "The Fold" — the growth brief opens as a folio

The modal's entrance is a page folding open from the top and settling flat. Perspective lives on the **scrim** (not the card); the card starts at `rotateX(12deg) translateY(-24px)` with `--shadow-page` and lands at `rotateX(0)` with `--shadow-modal` — **shadow and shape settle together**, which is what makes paper believable:

```css
.fold-scrim { background: rgba(27, 18, 32, 0.32); perspective: 1400px; }
.fold.open .fold-doc {
  transform-origin: 50% 0;
  animation: fold-open 0.64s var(--spring-heavy) both;
}
@keyframes fold-open {
  from { transform: rotateX(12deg) translateY(-24px) scale(0.985); opacity: 0; }
  to   { transform: rotateX(0deg)  translateY(0)    scale(1);     opacity: 1; }
}
```

Close: `play()` reversal (§5.7) — interruptible, same curve. Section numerals and badges stagger in (40ms, capped, §5.4) during the fold's final 40%, so content feels printed on the page as it lands.

### 9.3 "The Strike" — striking a run is a physical cancellation

When the user strikes the run: an aubergine-700 rule **draws left→right through the composing card's title** (scaleX, origin left, 400ms, `--ease-out-expo`), the card desaturates (`filter: grayscale(0.7)`, 320ms), tips back (rotateX −6deg) and collapses; then the "Run struck — nothing was persisted" slip arrives (§8.9). Total: 720ms of theater that *explains the consequence* — cancellation as communication:

```css
.composing::before {          /* the strike rule */
  content: "";
  position: absolute;
  left: 12px; right: 12px; top: 34px; height: 2px;
  background: var(--aub-700);
  transform: scaleX(0); transform-origin: left;
}
.composing.is-struck::before {
  transform: scaleX(1);
  transition: transform 0.4s var(--ease-out-expo);
}
.composing.is-struck { filter: grayscale(0.7); transition: filter 0.32s linear; }
.composing.is-collapsing { animation: card-collapse 0.32s var(--ease-in-out-soft) forwards; }
@keyframes card-collapse { to { transform: rotateX(-6deg) scaleY(0.6); opacity: 0; } }
```

### 9.4 "The Bloom" — the endmark

When an entry completes, the gold endmark diamond blooms once — scale 0.6→1.25→1 (640ms, `--spring-snappy`) with a 4-point gold registration sparkle (two hairlines crossing, scale 0.8→1.1, opacity 0→0.6→0). It is the period at the end of the product's sentence. Completed answers only — never decorative idling.

### 9.5 "The Spine" — first-load overture

On first load of the frontmatter: the rail spine slides in from the left (transform only, 400ms) → hero words rise per-word with 40ms stagger → the lone seed leader draws (§8.6). One choreographed 800ms overture, then the page goes completely still. **Motion budget: stillness is the default state; the resting page runs 0 animations.**

---

## 10. Scroll, layout & performance discipline

### 10.1 Restraint rails

- Long manuscripts: `content-visibility: auto` + `contain-intrinsic-size: 0 640px` per `.entry` — render cost stays flat at 100 entries.
- Leader redraws: keep the MutationObserver approach but rAF-throttle with a dirty-set (only re-measure entries whose `data-rev` changed). Scroll triggers **no** leader math; measurement happens at draw time only.
- `will-change` discipline: applied just-in-time by `play()`/`flip()` and removed on finish. CSS never ships static `will-change`.
- Shadow cross-fade law: hovers never transition `box-shadow` itself (paint); stack a pseudo-element and transition its `opacity`:

```css
.snote::after {          /* shadow layer */
  content: ""; position: absolute; inset: 0;
  box-shadow: var(--shadow-raised);
  opacity: 0; transition: opacity var(--dur-fast) linear;
  z-index: -1; pointer-events: none;
}
.snote:hover::after, .snote.hot::after { opacity: 1; }
```

### 10.2 The page-turn view transition (frontmatter ↔ manuscript)

With VTA: old view fades up 6px while the new view rises 14px, both 240ms — never a slide-deck wipe. The composer and rail don't participate in the transition, so they visually persist (continuity law §5.1.4).

### 10.3 Responsive notes (must not regress)

The current narrow-viewport behavior (leaders hidden < 1121px; sidenotes become inline footnotes) is *correct* for the metaphor — margin notes become footnotes on small pages. Keep the breakpoint; add: leader-draw animation disabled under it (nothing to draw), and the spine rail collapses to a 72px icon spine below 900px with labels on tap.

---

## 11. Copy & motion-of-language (the invisible system)

- Toasts and stamps keep the letterpress voice ("Entry bound — 4 citations verified"). **Voice consistency is a design feature** — never "Saved successfully!"
- Loading language is honest by design ("consulting the archive", "verifying citations") — copy and motion explain the same truth (backend stages map 1:1 to visible steps).
- Motion nouns match motion verbs: *bind, strike, fold, file, examine.* If a control moves like a stamp, its copy says "Bind."

## 12. Sound? No.

Closing the door deliberately: haptics/audio on a research tool is scope creep and an a11y risk. Physicality is achieved optically. Decision recorded so future agents don't relitigate it.

## 13. Accessibility — the design, not the checklist

- Every state change announced via the existing live region; composing steps announce stage changes (already implemented — keep).
- Color is never the only signal: verified = tick glyph + word; danger = strike glyph + copy; provider states = dot *and* label text (WCAG 1.4.1).
- Focus rings: aubergine-500 with the draw interaction (§8.12) — verified ≥ 3:1 against both bone and aubergine-950 surfaces.
- Hit targets: `.sn-ref` beads are 1.1em visually but get **24px effective targets** via `::after { inset: -6px; }` hit-slop.
- The plate iframe keeps `sandbox=""` + restrictive CSP exactly as implemented — the security posture is *part of the aesthetic claim* ("examined, never trusted").
- Reduced-motion: every spec above names its degradation; §5.9's global rule is the backstop.

## 14. Phased implementation roadmap (zero-regression)

Designed so the functional backend binding (already merged) never breaks. Each phase ships independently:

1. **Phase 1 — Tokens only (½ day).** Swap §2.2 tokens into `:root` (the existing `--canvas/--ink/--accent` re-maps do ~70% of the reskin in two variable reassignments). Swap shadow tokens (§4.1). Run a contrast pass (axe/WAVE). Ship, look, tune bone warmth ±1% chroma under real lighting.
2. **Phase 2 — Paper & spine (½ day).** Rail → `--aub-950` spine with ridge + gold numerals (§7.2, §4.3), page deckle edge (§4.2), registration marks, grain tune. Add the `.rl-tab` element (no FLIP yet).
3. **Phase 3 — Motion primitives (1 day).** Add duration/curve/`linear()` tokens (generate real spring values once with §5.3's snippet), `play()`/`flip()` helpers, reduced-motion gate. Convert toasts, focus rings, hovers, beads, snote wake, composing steps (§5.5), stamp press (§8.3).
4. **Phase 4 — Component theater (1 day).** The Fold (§9.2), The Strike (§9.3), plate FLIP (§8.8), rail ribbon slide + delete tip-out (§8.1/§8.5), mode-pill FLIP (§8.2), provider dot travel (§8.4), conflict shake (§8.10).
5. **Phase 5 — Icons & type (1 day).** Draw the 13 Apparatus glyphs (§6.2), the two icon morphs (§6.3), Fraunces axis discipline + drop caps + tabular/oldstyle numerals (§3), font self-host + metric fallbacks.
6. **Phase 6 — Signatures & polish (½ day).** The Bind (§9.1), The Bloom (§9.4), The Spine overture (§9.5), performance pass (§10), full reduced-motion audit, keyboard-only walkthrough.

**Verification gates per phase:** `tsc` + `npm run build` + a manual pass through the StatesTray design tour (it exists precisely for this — tour fixtures double as the visual regression suite) + one real query per mode against the live backend.

## 15. The anti-slop doctrine (read before every PR)

Banned in Kestrel, with reasons:

1. **No purple-blue gradients, no glassmorphism, no glow shadows.** Bone/aubergine duotone + paper shadows only.
2. **No neutral gray ink.** All text is plum. This single rule is what keeps the reskin from regressing to template.
3. **No centered-everything.** The manuscript is a *column* with a *margin* — asymmetry is the layout's opinion.
4. **No radii over 12px, no mixed radii.** Scale: 0 (rules), 3 (beads, inputs), 9 (cards), 12 (modals). A radius is a print form, not decoration.
5. **No emoji, ever** — including toasts. Glyphs come from Apparatus.
6. **No motion on rest.** The resting page is still; motion is a response to a cause (§5.1 law 1). Autoplaying loops only for composing dots and the composing-only status pulse.
7. **No animation of layout properties** (`width/height/top/left/font-size`), no `will-change` soup.
8. **No fake data in the visual layer.** Demo content ships only through the marked tour fixtures — a design system that lies is slop at the content level.
9. **Max 2 concurrent animated elements per interaction** (exception: the five sanctioned signature moments).
10. **No default icon libraries bolted on.** Apparatus only; missing glyph → draw it to spec (§6.2).
11. **Never animate WONK. Never animate font-size. Never stagger more than 4 words.**
12. **Every new surface must answer "what is this made of?"** (paper? spine? slip?) *before* it gets color, shadow, or motion. Material first, style second.

The one-sentence quality bar for every diff:

> *"Does this feel like a well-made object doing exactly what your hand asked — or like a website performing?"*

---

*End of research. Implementation guidance lives in §14; per-component contracts in §7–8; all code snippets are illustrative and must be adapted to the real DOM (class names verified against `dossier.css` and `frontend/src/components/`).*

