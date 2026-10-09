# Kestrel UI/UX Design Specification — The Editorial Research Studio

**Status:** Canonical Ground Truth for UI/UX  
**Document Scope:** Design Tokens, Layout Geometry, Component Apparatus, Interaction Models, and State Matrix  
**Companion Documents:** `USER_JOURNEYS.md`, `kestrel-dossier-prototype.html`, `IMPLEMENTATION_SPEC.md` (Technical Contract)

---

## 1. Design Philosophy & Mental Model

### 1.1 The Dossier vs. The Generic Chat Box
Generic AI interfaces present information as transient speech bubbles inside an endless, unstructured vertical thread. For product managers, growth leads, and founders making high-stakes decisions, this fails in three key ways:
1. **Source Disconnection:** Citations appear as tiny footnote tags at the bottom of a block of text, disconnected from the claims they support.
2. **Ephemeral Context:** Useful frameworks disappear into scrollback history without structure.
3. **Developer Aesthetic:** Most tools default to dark terminal vibes or loud neon AI glows rather than focused reading environments.

### 1.2 The "Editorial Research Studio" Thesis
Kestrel is designed as an **Editorial Research Studio**. Its central metaphor is **The Dossier** (a curated folio or manuscript):
* **Single Continuous Folio:** A session is a bound folio. Queries and answers are numbered paragraphs (`¶ 1`, `¶ 2`, `¶ 3`).
* **The Margin Apparatus:** The center column is reserved for clear editorial reading (616px line measure). The wide right margin hosts the **Apparatus**: verbatim transcript evidence, episode provenance, and miniature plate previews.
* **Physical Leader Lines:** On desktop screens, delicate dynamic SVG leader lines connect inline claim tokens (`[1]`, `[2]`) directly to their verbatim evidence cards in the margin. Hovering either end highlights both and reveals the exact source passage.
* **Structured Deliverables:** Chat is only the entry door. Research effortlessly expands into **The Fold** (a structured, editable Growth Brief) and **Plates** (sandboxed visual HTML/CSS tools or Markdown memos).

---

## 2. Design Tokens & Visual Hierarchy

### 2.1 Color Palette
The palette evokes archival paper, book printing ink, and terracotta bookbinder cloth.

```css
:root {
  /* Canvas & Surfaces */
  --canvas:       #F7F4ED; /* Warm off-white / ivory canvas */
  --surface:      #FFFEFB; /* Pristine sheet white for cards & plates */
  --wash:         rgba(242, 226, 218, 0.55); /* Pale terracotta wash on active claim */

  /* Ink & Typography */
  --ink:          #242A2E; /* Deep printing ink (never pure black #000) */
  --ink-soft:     #4E565B; /* Secondary editorial text */
  --muted-ink:    #686D6B; /* Metadata, timestamps, captions */
  --faint:        #8F9391; /* Low-emphasis stamps, disabled markers */

  /* Accents & Highlights */
  --accent:       #B65E45; /* Terracotta / rust primary accent */
  --accent-ink:   #9A4B35; /* Darkened terracotta for high-contrast text & links */
  --accent-soft:  #F2E2DA; /* Warm highlight wash for active notes */
  --accent-line:  #DCA890; /* Delicate leader lines and borders */

  /* Structural Borders & Shadows */
  --border:       #E4DED4; /* Warm hairline border */
  --shadow:       0 1px 2px rgba(36, 42, 46, 0.05), 0 14px 34px rgba(36, 42, 46, 0.09);

  /* Semantic Feedback */
  --success:      #466A58; /* Muted spruce green for verified checks & status */
  --danger:       #A43F35; /* Brick red for errors, struck runs, and alerts */
}
```

### 2.2 Typography System

| Role | Font Family | Fallback Stack | Usage & Scale |
| :--- | :--- | :--- | :--- |
| **Display Headings** | `Fraunces` | Georgia, serif | Frontmatter hero (44–86px), folio headings (23–30px), section markers. Features variable font optical sizing (`opsz`), soft curves (`SOFT`), and subtle editorial wonk (`WONK`). |
| **Editorial Body** | `Newsreader` | Georgia, serif | Core reading body text (15–17.5px, line-height 1.62–1.66). Exceptional readability for long-form synthesis. |
| **UI & Navigation** | `Space Grotesk` | system-ui, sans-serif | Running head, index rail, buttons, small caps (`.sc`, 10.5px, 0.15em tracking), status labels. |
| **Data & Metadata** | `Spline Sans Mono` | SF Mono, Menlo, monospace | Source chunk stamps (`.stamp`, 9px), token markers, leader IDs, code views. |

### 2.3 Layout Geometry & Spacing
* **Reading Measure (`--col`):** `616px` (maximum line length for optimal readability at 65–75 characters per line).
* **Apparatus Gutter (`--col-pad`):** `44px` between the text column and the right margin hairline rule.
* **Margin Apparatus Width (`--note-w`):** `312px` (calibrated for skimmable evidence cards).
* **Margin Gap (`--note-gap`):** `16px`.
* **Total Sheet Width:** `1080px` centered on desktop viewports.

---

## 3. Component Architecture & Apparatus

### 3.1 Running Head (Persistent Masthead)
* **Height:** `54px`, pinned at top with double hairline rule (`border-bottom: 3px double var(--ink)`).
* **Brand Mark:** "Kestrel" with superscript subtitle "Growth dossier".
* **Editable Dossier Title:** Displays current folio title (e.g., *“Pricing page teardown — Flowstate”*). Clicking allows inline renaming.
* **Colophon Trigger:** Pill badge showing active model status (e.g., `Set in qwen2.5:3b · local` with spruce green dot).

### 3.2 The Colophon (Provider & Archive Inspector)
* **Popover Menu:** Triggered from running head.
* **Provider Switcher:** Allows toggling between **Local** (`Ollama · qwen2.5:3b`) and **Cloud** (`Gemini · gemini-2.0-flash` or `Claude`).
* **Non-Negotiable Rule:** *Zero silent fallback.* If the local model is unreachable, Kestrel never switches to cloud automatically. It displays an explicit advisory and waits for user confirmation.
* **Archive Provenance:** Displays timestamp of last episode index synchronization and commit hash.

### 3.3 The Index Rail (Book-Spine Navigation)
* **Collapsed Width:** `56px`. Shows vertical spine title (*"KESTREL — GROWTH DOSSIERS"*) and a circular `+` button.
* **Expanded Width:** `282px` on hover or focus.
* **Sections:**
  - `Open now`: Active folio and current working sessions.
  - `Earlier`: Historical sessions stored in local database.
* **Item Information:** Numeric index (`01`, `02`) wrapped in a circular indicator badge (`.rl-num`). When selected/active, a hollow orange/terracotta circle (`border: 1.5px solid var(--accent); background: transparent`) wraps cleanly around the number, with transparent canvas background (no white tab highlight). Includes truncated topic title and note count badge (`query · 4 notes`).

### 3.4 Frontmatter (New Dossier Hero & Workbench)
* **Hero Headline:** Asymmetrical display headline *"What are you working through?"* with interactive letterform wonk hover.
* **The Writing Line:** A ruled pen-line input with leading paragraph symbol (`¶`), expanding textarea, and mode selector.
* **Modes Selector:**
  - `Query`: Direct search and research synthesis.
  - `Brief`: Structured Growth Brief generation.
  - `Essay`: Ship 30 for 30 style essay (~1,250 words).
  - `Plate`: Structured visual artifact (HTML/CSS or Markdown).
* **Product Context Drawer:** Optional expandable field (`+ product context`) to specify product stage, audience, metrics, and constraints. **Crucial rule:** Product context is strictly labeled as user-supplied and never confused with podcast transcript facts.
* **Quick Starter Index:** Numbered cards (`I. Research a problem`, `II. Compose a growth brief`, `III. Typeset a deliverable`) with prefill triggers.

### 3.5 The Sheet & Manuscript
* **Numbered Entries:** Folio items receive paragraph marks (`¶ 1`, `¶ 2`, `¶ 3`).
* **Drop Caps:** Opening answers feature classic editorial drop caps (`.a-lead::first-letter`).
* **Inline Evidence Tokens:** Numbered superscripts (`[1]`, `[2]`, `[3]`) marking every factual claim.
* **Where the Archive is Thin:** Dedicated section styling (`.thin`) highlighting boundaries, conflicting advice, or gaps in podcast coverage.
* **Answer Footers:** Verification stamp (`Set in qwen2.5:3b · local — 4 citations verified`) with direct CTA buttons to advance the journey (`Bind to a growth brief →`, `Set as an essay →`).

### 3.6 Sidenote Margin Cards & Dynamic Leader Lines
* **Card Anatomy:**
  - Numbered accent badge (`1`, `2`, `3`).
  - Guest Name and Company affiliation (e.g., *Rahul Vohra · Superhuman*).
  - Verbatim excerpt in quotation marks from stored transcript chunk.
  - Canonical episode link with external arrow indicator (`↗`).
  - Retrieval score stamp (e.g., *Chunk 142 · rank №1 · semantic 0.61*).
* **Two-Way Hover Synchronization:** Hovering either the inline superscript token or the margin card highlights both with terracotta background wash.
* **Dynamic SVG Leader Lines:** An SVG overlay on the sheet calculates cubic bezier paths (`M x1 y1 C ...`) connecting the right edge of the citation token to the left edge of the margin note, rendering a delicate dotted connector that turns solid terracotta on hover.

### 3.7 The Fold (Growth Brief Studio)
* **Concept:** A full-screen editorial sheet that slides into view for strategic decision making.
* **5 Standard Brief Sections:**
  1. `I. Problem`: User-supplied context, current metrics, and goal.
  2. `II. Research & Evidence`: Bulleted transcript insights with interactive jumper tags back to margin notes.
  3. `III. Recommendation & Synthesis`: Core strategy with explicit *Assumptions & limitations*.
  4. `IV. Experiment Specification`: Key table with Hypothesis, Proposed Change, Target Audience, Primary Metric (with baseline), Guardrail Metrics, and Decision Rule.
  5. `V. Next Deliverable`: Action triggers to generate a Ship 30 essay or cast an HTML plate.
* **Direct Content-Editable:** Every paragraph in the brief is directly editable (`contenteditable="true"`).
* **Impression Tracking:** Brief saves are recorded as *Impressions* (*First impression*, *Second impression*), honoring the printmaking metaphor.

### 3.8 The Plate Viewer (Sandboxed Artifact Studio)
* **Isolated Sandbox:** Renders generated HTML deliverables inside an `<iframe sandbox="">` with strict CSP (`default-src 'none'`). Scripts, forms, top-level navigation, and external network requests are completely blocked.
* **View Modes:** Toggle between **Preview** (live rendered document) and **Source** (syntax-highlighted code).
* **Studio Actions:**
  - `Revise`: Pre-populates the prompt composer with refinement directives.
  - `Copy`: Copies raw HTML or Markdown to clipboard.
  - `Download`: Exports `.html` or `.md` file to user's disk.

---

## 4. Comprehensive UI States Matrix

| State Name | Trigger / Condition | Visual Presentation | User Action Available |
| :--- | :--- | :--- | :--- |
| **1. Initial Empty Workspace** | First load / no session active | Frontmatter hero, open writing line, 3-part starter index. | Type question, toggle context, select prefill. |
| **2. Empty Session** | User creates new dossier via `+` button | Centered blank page with ornamental paragraph glyph `¶` and explanation. | Write first query into fixed compose bar. |
| **3. Composing / Working** | Query submitted, agent processing | Dotted-leader step list with pulsing terracotta dot and elapsed duration stamps. | Click `strike this run` to cancel immediately. |
| **4. Run Struck (Cancelled)** | User strikes active run | Clean advisory card explaining partial draft was discarded; zero persistence. | Click `Recompose →` to retry. |
| **5. Completed Answer with Citations** | Successful synthesis & retrieval | Full manuscript layout, verified citation tags, margin notes, and leader lines. | Inspect sources, create brief, set essay. |
| **6. Insufficient Evidence** | Archive lacks reliable data for query | Advisory card explaining gap clearly; explicit suggestion chips for narrower queries. | Click suggestions or refine prompt. |
| **7. Local Model Offline** | Ollama unreachable or down | Warning in Colophon; prompt asks whether to restart local or switch to Cloud. | Switch provider or retry local. |
| **8. Cloud Key Missing** | User selects cloud provider without API key configured | Alert banner in colophon with `.env` setup instructions. | Return to local model or configure key. |
| **9. Model Error / Timeout** | Upstream model times out or errors | Brick red advisory card; explains timeout without jargon; provides retry action. | Retry query or switch model. |
| **10. Database Unavailable** | PostgreSQL connection fails | Prominent alert with diagnostic guidance. | Check Docker/database status. |
| **11. Archive Miss / Zero Retrieval** | No transcript chunks match threshold | "Not in the archive" card offering related topics. | Browse episode topics. |
| **12. No Artifact Yet** | User views artifact panel before generating | Clean empty plate illustration with instructions. | Cast a plate from active brief or query. |
| **13. Artifact Security Blocked** | Generated artifact attempts scripts/forms | Red security badge; explains sandbox prevented unauthorized behavior. | View sanitized source code. |
| **14. Saved State & Version Conflict** | Multiple edits to brief or artifact | Impression counter badge increments; warns if unsaved edits exist. | Save new impression or revert. |
| **15. Narrow Viewport / Mobile** | Screen width < 900px | Navigation folds into hamburger drawer; margin notes fold beneath text as footnotes; bottom composer floats above soft keyboard. | Full touch navigation. |

---

## 5. Responsive Behavior & Breakpoints

### 5.1 Desktop (>1120px)
* Full 3-column continuum:
  - Collapsed Index Rail (56px → 282px on hover)
  - Text Column (616px line measure)
  - Right Margin (312px) with floating sidenotes and active SVG leader lines.

### 5.2 Tablet / Medium Desktop (900px – 1120px)
* Dynamic SVG leader lines are hidden (`display: none`).
* Sidenotes fold gracefully directly underneath the respective paragraphs as indented evidence cards.
* Index rail remains collapsible.

### 5.3 Mobile (<900px)
* Index rail becomes an off-canvas slide-out drawer triggered by header hamburger button.
* Running head hides subtitle; title truncates gracefully.
* Growth Brief and Plate Viewer open as edge-to-edge full-screen sheets.
* Compose bar respects iOS `env(safe-area-inset-bottom)`.

---

## 6. Accessibility & Motion Guidelines

1. **WCAG 2.1 AA Compliance:** Minimum 4.5:1 contrast for all text (`#242A2E` and `#9A4B35` against `#F7F4ED`).
2. **Keyboard Traps & Modals:** The Fold and Plate Viewer contain complete focus traps with `Escape` key listeners to dismiss.
3. **Screen Readers:** Live status updates use `aria-live="polite"` polite regions; citations use explicit labels (`aria-label="Read evidence note 1"`).
4. **Reduced Motion:** Fully honors `@media (prefers-reduced-motion: reduce)` by disabling smooth scrolls, leader line animations, and transitions.
5. **Quick Keyboard Shortcuts:**
   - `/` : Focus prompt composer immediately.
   - `Esc` : Close open popover, brief, or plate.
   - `Enter` : Submit prompt.
   - `Shift + Enter` : Line break in composer.
