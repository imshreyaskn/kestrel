# Design System & UI Specification: The Editorial Research Studio (Dossier)

**Codename:** Kestrel  
**Status:** Living Design Specification  
**Authority:** Derived from `uiux-research/kestrel-dossier-prototype.html`  

---

## 1. Design Thesis & Philosophy

Kestrel rejects the generic "grey chat bubble" paradigm common to standard LLM wrappers. Product managers, founders, and growth leaders do not read research in chat bubbles; they read memos, dossiers, and manuscripts.

### The Dossier Metaphor
1. **The Manuscript (`.manuscript`):** A continuous, elegant reading experience where conversational entries flow as editorial prose with Roman numeral divisions.
2. **The Margin (`.snote`):** Evidence is never hidden behind generic dropdowns. Sidenotes live directly in the right margin, visually connected to in-text citations via interactive leader lines.
3. **The Index Rail (`.rail`):** A quiet library shelf on the left, organizing active dossiers by chronological sequence and status.
4. **The Fold (`.fold`):** An executive modal deliverable (The Growth Brief) formatted as a print impression with editable sections and binding actions.
5. **The Plate Viewer (`.pv`):** A sandboxed examination table for rendered HTML/CSS and Markdown deliverables.

---

## 2. Design Tokens & Visual Hierarchy

### Color Palette (The Bone & Aubergine System)
| Token | Value | Semantic Purpose |
| :--- | :--- | :--- |
| `--canvas` | `#F2F0E9` | Primary bone paper sheet canvas (light paper baseline). |
| `--surface` | `#FAF8F2` | Elevated parchment cards, modals, and rail background. |
| `--surface-raised` | `#FFFFFF` | High-emphasis reading sheet surface. |
| `--ink` | `#161614` | Carbon black editorial ink for body copy and headlines. |
| `--muted-ink` | `#4A4844` | Mid-tone graphite ink for marginalia, timestamps, and metadata. |
| `--faint` | `#7D7971` | Faint folios, roman numerals, and placeholder text. |
| `--accent` | `#4A1F3D` | Royal aubergine primary accent for interactive states and underlines. |
| `--accent-ink` | `#33142A` | Deep aubergine ink for high-contrast active links and titles. |
| `--accent-line` | `#C8A8BE` | Soft plum hairline rule for hover states. |
| `--accent-soft` | `rgba(74, 31, 61, 0.08)` | Translucent aubergine tint for text selections and active states. |
| `--gold` | `#8C6A2D` | Antique brass / gold for spine folios and registration blooms. |
| `--border` | `#DDD8CD` | Refined paper hairline boundary tone. |
| `--danger` | `#8C2828` | Deep crimson for warnings and character-limit ceiling. |
| `--success` | `#2D5A3D` | Forest green for verified evidence and successful status badges. |

### Typography Stack
* **Display (`--f-disp`):** `Fraunces`, Georgia, serif — Optical sizes 9–144, variable softness (SOFT) and wonkiness (WONK) for headlines and editorial titles.
* **Reading Body (`--f-text`):** `Newsreader`, Georgia, serif — Optimized for long-form reading comfort, generous line height (1.62).
* **Interface UI (`--f-ui`):** `Space Grotesk`, system-ui, sans-serif — Clean geometric sans for buttons, labels, and toggles.
* **Monospace (`--f-mono`):** `Spline Sans Mono`, ui-monospace, monospace — Provenance stamps, citation numbers, and character counter badges.

---

## 3. Information Architecture & Core Components

```
+---------------------------------------------------------------------------------------+
|  RUNNING HEAD: [Dossier Title]   [Manuscript / Frontmatter]   [The Fold]  [Plate]  [Ollama]   |
+-------------+-----------------------------------------------------+-------------------+
|  INDEX RAIL |  MANUSCRIPT READING MEASURE (616px)                 |  MARGIN APPARATUS |
|             |                                                     |  (312px)          |
|  01 Pricing |  User Query Block                                   |                   |
|  02 Activat |                                                     |                   |
|  03 Retent  |  I. Find the moment worth speeding toward [1] ----+ |  [1] Rahul Vohra  |
|             |     Superhuman PMF survey roadmap...              | |      "Delight"  |
|  + New      |                                                   | |      Chunk 142  |
|    Dossier  |  II. Read the retention curve before [2] ---------+ |                   |
|             |      Casey Winters leaking bucket...                |  [2] Casey Winters|
|             |                                                     |      "Curve"      |
+-------------+-----------------------------------------------------+-------------------+
|  COMPOSER DESK: [Mode: Query|Brief|Essay|Plate] [Enter your question...] [Strike] [Send]     |
+---------------------------------------------------------------------------------------+
```

### Component Details
1. **Frontmatter (`Frontmatter.tsx`):**
   - The opening landing page before entering a specific dossier.
   - Folio masthead: *"Kestrel — a growth research dossier, drawn from Lenny’s Podcast archive"*.
   - Hero prompt: *"What are you working through?"* with interactive demo margin note.
   - Mode toggles (`Query`, `Brief`, `Essay`, `Plate`) and optional expandable Product Context tray.
2. **Manuscript (`Manuscript.tsx`):**
   - Central 616px column ensuring optimal reading measure (65–75 characters per line).
   - In-text citation superscripts (`[1]`, `[2]`, ...) rendered in accent ink.
   - Insufficient Evidence cards with editorial kick: *"Not in the archive"*, clear explanation of the corpus boundary, and refined query suggestions.
3. **Margin Apparatus & Leader Lines (`SideNote.tsx`, `LeaderLines.tsx`):**
   - Fixed 312px right column aligned horizontally with corresponding manuscript paragraphs.
   - Real-time SVG cubic bezier leader lines connecting in-text superscript to margin card on hover or focus.
   - Verbatim transcript chunk quotes stored in PostgreSQL (`transcript_chunks.content`).
4. **Composer Bar (`ComposerBar.tsx`):**
   - Fixed floating writing desk at the bottom of the viewport.
   - Auto-expanding textarea with `Ctrl+Enter` / `Enter` submission.
   - Stage progression indicator displaying live server SSE events (`loading_context` → `retrieving` → `drafting` → `validating` → `saving`).
   - "Strike the run" escape button allowing readers to cleanly abort in-flight generations.
5. **The Fold — Growth Brief Modal (`GrowthBriefModal.tsx`):**
   - Fullscreen editorial impression modal.
   - 7 sections: Problem Framing, Research Evidence, Strategic Recommendation, Assumptions, Controlled Growth Experiment, Risks, and Next Deliverable.
   - `contentEditable` blocks with "Bind impression" action persisting back to FastAPI.
6. **Plate Viewer — Sandboxed Deliverable Modal (`PlateViewerModal.tsx`):**
   - Dual-mode inspector: Sandboxed Preview vs. Raw Source Code.
   - Isolated `<iframe sandbox="">` with strict CSP (`default-src 'none'`).
   - Copy to Clipboard and Download with proper MIME types.
7. **Running Head & Dossier Lifecycle (`RunningHead.tsx`):**
   - Fixed header bar anchored with brand metadata on the left and provider colophon button on the right.
   - Mathematically centered title at 50% viewport width (`position: absolute; left: 50%; transform: translate(-50%, -50%)`), dynamically expanding with title length.
   - Seamless double-click inline retitling via `contentEditable` with Aubergine underline, without input box popup or layout displacement.
   - Enforced 60-character ceiling with non-displacing absolute counter badge (`{charCount} / 60`).
   - Deferred PostgreSQL persistence: new dossiers and renamed drafts exist purely in local UI state until the user sends their first query.

---

## 4. Accessibility & Inclusive Design

1. **Keyboard Operability:**
   - Global `/` key focuses the active composer textarea from anywhere.
   - `Escape` key dismisses any open modal (The Fold, Plate Viewer) or mobile drawer.
   - Focus traps in modals restrict `Tab` / `Shift+Tab` cycling to modal elements.
2. **Screen Reader Landmarks:**
   - Semantic HTML5 landmarks: `<nav aria-label="Dossier index">`, `<main id="main">`, `<aside aria-label="Margin note">`, `<dialog aria-modal="true">`.
   - `aria-live="polite"` region (`#a11yAnnounce`) providing verbal stage announcements during generation.
3. **Visible Focus & Contrast:**
   - High-contrast `:focus-visible` styling (`outline: 2px solid var(--accent); outline-offset: 2px`).
   - Strict adherence to WCAG 2.1 AA contrast requirements across canvas and ink tokens.
4. **Reduced Motion:**
   - Full `@media (prefers-reduced-motion: reduce)` support instantly zeroing CSS transition durations and animation curves.

---

## 5. Responsive Design & Breakpoints

* **Desktop ($\ge 1180\text{px}$):** Full 3-column layout (Index Rail + Manuscript + Margin Apparatus).
* **Tablet ($768\text{px} - 1179\text{px}$):** Index Rail collapses into an off-canvas drawer; Manuscript and Margin Apparatus remain side-by-side.
* **Mobile ($< 768\text{px}$):** Single column. Index Rail accessible via hamburger menu; margin notes stack directly beneath corresponding answer sections; Composer Bar floats above mobile software keyboards.
