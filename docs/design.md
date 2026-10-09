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

### Color Palette
| Token | Value | Semantic Purpose |
| :--- | :--- | :--- |
| `--canvas` | `#F7F4ED` | Warm, non-glare paper background reminiscent of fine editorial stock. |
| `--surface` | `#FFFEFB` | Elevated card and container background. |
| `--ink` | `#242A2E` | Deep charcoal primary text color; softer than pure `#000000` to prevent eye strain. |
| `--muted-ink` | `#686D6B` | Secondary editorial prose, metadata, and body copy. |
| `--accent` | `#B65E45` | Subdued terra cotta / vermilion accent for interactive highlights and citations. |
| `--accent-ink` | `#9A4B35` | High-contrast accent for interactive text and links. |
| `--accent-soft` | `#F2E2DA` | Soft tint for text selection and active badge pills. |
| `--border` | `#E4DED4` | Hairline border tone for structural division without visual noise. |
| `--danger` | `#A43F35` | Insufficient evidence and error warning indicators. |
| `--success` | `#466A58` | Verified evidence indicators and successful state badges. |

### Typography Stack
* **Display (`--f-disp`):** `Fraunces`, Georgia, serif — Optical sizes 9–144, high character warmth for headlines and section headers.
* **Reading Body (`--f-text`):** `Newsreader`, Georgia, serif — Optimized for long-form reading comfort, generous line height (1.62).
* **Interface UI (`--f-ui`):** `Space Grotesk`, system-ui, sans-serif — Clean, modern geometric sans for buttons, labels, and toggles.
* **Monospace (`--f-mono`):** `Spline Sans Mono`, ui-monospace, monospace — Provenance stamps, citation numbers, and code blocks.

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
