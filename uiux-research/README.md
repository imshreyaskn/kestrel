# UI/UX Research & Design Studio — The Lenny Growth Assistant (Kestrel)

**Status:** Canonical Ground Truth for all UI/UX Design  
**Authority Directive:** While `IMPLEMENTATION_SPEC.md` governs backend architecture, schemas, and runtime contracts, all interface design, visual hierarchy, layout geometry, interaction models, and user journeys are canonically defined within `uiux-research/`.

---

## 1. Overview & Artifacts

This directory contains the complete design research, design tokens, interaction blueprints, and working interactive prototypes for Kestrel.

| Document / Asset | Description |
| :--- | :--- |
| **[`DESIGN_SPEC.md`](./DESIGN_SPEC.md)** | **The Design System Specification:** Color tokens, typography pairings (`Fraunces`, `Newsreader`, `Space Grotesk`, `Spline Sans Mono`), sheet geometry, margin apparatus, dynamic SVG leader lines, component contracts, and the 15-state UI matrix. |
| **[`USER_JOURNEYS.md`](./USER_JOURNEYS.md)** | **Interaction Blueprints:** Flowcharts and UX step-by-step walkthroughs for the 4 primary journeys: *Research a Problem*, *Compose a Growth Brief*, *Create Ship 30 Content*, and *Cast a Sandboxed Plate*. |
| **[`kestrel-dossier-prototype.html`](./kestrel-dossier-prototype.html)** | **Interactive Design Prototype:** High-fidelity, self-contained single-page application demonstrating the live Editorial Research Studio experience with margin sidenotes, dynamic leader lines, editable Growth Brief, and isolated iframe Plate viewer. |
| **[`index.html`](./index.html)** | Local browser shortcut that automatically launches the prototype. |

---

## 2. Core Visual Metaphor: "The Dossier"

Instead of conventional AI chat bubbles, Kestrel uses an **Editorial Research Studio** visual language:
1. **The Continuous Folio:** A research session is a bound manuscript. Answers and inquiries are numbered paragraphs (`¶ 1`, `¶ 2`).
2. **The Margin Apparatus:** Verbatim podcast evidence and speaker provenance live in the wide right margin, directly alongside the text claims they substantiate.
3. **Dynamic Leader Lines:** Cubic bezier SVG leader lines physically connect superscript citation tokens in the text to the exact quote card in the margin on desktop viewports.
4. **The Fold:** A dedicated, full-screen strategic document editor for the 5-part Growth Brief (Problem, Evidence, Recommendation, Experiment, Next Steps).
5. **Sandboxed Plates:** HTML/CSS and Markdown deliverables inspected inside a zero-trust, isolated iframe sandbox with strict Content Security Policy (`default-src 'none'`).

---

## 3. How to Launch & Explore the Prototype

The interactive prototype is completely self-contained (zero external build tools required).

### Option A: Direct Browser File
Open `uiux-research/kestrel-dossier-prototype.html` directly in any modern browser (Chrome, Edge, Safari, Firefox).

### Option B: Local HTTP Server (Python)
From the repository root:
```bash
python -m http.server 8080 --directory uiux-research
```
Then navigate to: `http://localhost:8080/`

---

## 4. Key Interactive Flows Demonstrated in the Prototype

1. **New Folio Landing:** Asymmetrical hero headline with variable-font hover effect, writing line with `¶` glyph, and multi-modal selector (`Query`, `Brief`, `Essay`, `Plate`).
2. **Research Query:** Try clicking *"How can an early-stage SaaS improve activation without hurting retention?"* to observe:
   - The 4-stage composing step list (`consulting archive` → `drafting` → `verifying` → `binding`).
   - The strike action to cancel a run mid-flight without persisting partial drafts.
   - Folio rendering with drop-caps, 4 margin notes (Rahul Vohra, Casey Winters, Jorge Mazal, Elena Verna), and glowing leader lines.
3. **Margin Note Hover:** Hover any superscript number in the text (`[1]`, `[2]`) to watch both the citation token, text paragraph, and margin card illuminate in warm terracotta wash.
4. **The Growth Brief ("The Fold"):** Click *"Bind to a growth brief →"* to open the full-screen 5-section brief with live in-place editable text (`contenteditable="true"`).
5. **The Sandboxed Plate Viewer:** Click *"Cast a plate →"* to inspect a rendered HTML experiment brief in an isolated frame, toggle to source code, copy, or download.
6. **Colophon & Provider Policy:** Click the running head badge (`Set in qwen2.5:3b · local`) to inspect active provider status and experience the strict "Zero Silent Fallback" rule.
7. **The "Outrunning Evidence" Case:** Ask a benchmark question (or click the benchmark demo button) to see how Kestrel handles insufficient evidence with dignity and transparency rather than fabricating numbers.
