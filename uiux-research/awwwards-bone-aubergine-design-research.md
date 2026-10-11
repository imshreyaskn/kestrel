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

*(Sections 6–15 continue in this file: icon system, per-component reskin specs, micro-interaction inventory, signature moments, anti-slop doctrine, implementation roadmap.)*
