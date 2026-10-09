# Manual Verification & Evaluation Test Plan

**Codename:** Kestrel  
**Audience:** Evaluators, Reviewers, and Forward Deployed Engineers  
**Application URL:** `http://localhost:5173`  
**Backend API Docs:** `http://localhost:8000/docs`  

---

## 1. Environment Readiness Checklist

Before starting manual evaluation, ensure the local services are running:

| Service | Address | Status Check |
| :--- | :--- | :--- |
| **PostgreSQL 16 + pgvector** | `localhost:5433` | `docker ps` shows `kestrel-postgres` healthy |
| **Agent Gateway (Node 22)** | `localhost:8010` | `curl http://localhost:8010/health` returns `status: ok` |
| **FastAPI Backend** | `localhost:8000` | `curl http://localhost:8000/api/v1/health/ready` returns `status: ready` |
| **Workbench Frontend** | `localhost:5173` | Browser opens Editorial Dossier UI |
| **Host Ollama (Local LLM)** | `localhost:11434` | `ollama list` shows `qwen2.5:1.5b` and `embeddinggemma` |

---

## 2. Step-by-Step Test Scenarios

### Scenario 1: First Impression & Landing (Frontmatter)
1. Navigate to `http://localhost:5173`.
2. **Observe:** The warm neutral editorial paper canvas (`#F7F4ED`), high-contrast serif typography (*Fraunces* and *Newsreader*), and folio masthead.
3. **Verify:**
   - Left Index Rail displays existing dossiers and a "+ New Dossier" button.
   - The hero headline reads *"What are you working through?"* with an interactive demonstration note `✳`.
   - Hover or tap the `✳` note — observe the highlight and margin card.
   - Press `/` on the keyboard — the composer textarea automatically receives focus.

### Scenario 2: Grounded Research Query & Marginalia
1. In the composer textarea, enter:
   > *"How did Superhuman optimize onboarding activation?"*
2. Press `Enter` (or click `Send`).
3. **Observe:**
   - The view smoothly transitions to the **Manuscript**.
   - The Composer Bar displays live server-sent stage progression: `Retrieving corpus...` $\rightarrow$ `Drafting synthesis...` $\rightarrow$ `Validating citations...`.
4. **Verify Output:**
   - The response is formatted into structured Roman numeral sections (`I.`, `II.`).
   - The text contains in-text citation markers `[1]`, `[2]`.
   - In the right margin rail, corresponding **Sidenotes** appear.
   - Hover over `[1]` — an SVG leader line draws dynamically from the superscript to the Rahul Vohra margin note.
   - Click the episode title link — opens the canonical episode URL in a new tab.
   - Verify the quote text is verbatim from the podcast transcript.

### Scenario 3: Insufficient Evidence Handling (No Hallucination)
1. In the bottom composer, enter an out-of-corpus question:
   > *"What is the average PLG benchmark conversion rate across SaaS in 2026?"*
2. Submit the query.
3. **Observe:**
   - The system **does not invent numbers or fabricate statistics**.
   - A distinct editorial card appears: *"Not in the archive"*.
   - The card explains that the podcast corpus does not contain verified comparative benchmarks and offers concrete alternative questions to explore.

### Scenario 4: The Fold — Growth Brief Deliverable
1. Click **The Fold** trigger pill in the top Running Head (or compose with mode set to `Brief`).
2. **Observe:**
   - The fullscreen editorial impression modal opens with an entrance animation.
   - Displays all 7 sections: *Problem*, *Research & Evidence*, *Recommendation*, *Assumptions*, *Experiment* (Hypothesis, Change, Audience, Primary Metric, Guardrails, Decision Rule), and *Next Deliverable*.
3. **Interactive Editing:**
   - Click inside the *Problem* paragraph (`contentEditable`) and edit the text.
   - Click **Bind impression** in the top right.
   - **Observe:** Toast notification confirms *"Second impression bound — Version 2"*, persisting the change to PostgreSQL.
   - Press `Escape` — the modal smoothly dismisses and returns to the dossier.

### Scenario 5: Plate Viewer — Sandboxed HTML Preview & Security
1. In the Running Head, click the **Plate** pill (or compose with mode set to `Plate`).
2. **Observe:**
   - The Plate Viewer modal opens displaying the rendered deliverable (e.g., *Activation experiment one-pager*).
   - The document is rendered inside a **sandboxed iframe** (`sandbox=""`).
3. **Toggle View:**
   - Click **Source** in the top bar — displays the raw source code.
   - Click **Preview** — returns to the sandboxed render.
4. **Export Tools:**
   - Click **Copy** — copies the plate code to the system clipboard with toast confirmation.
   - Click **Download** — downloads the file directly with appropriate `.html` or `.md` extension.

### Scenario 6: Provider Switching & Canceling a Run
1. In the Running Head, locate the Provider selector (`Local` / `Cloud`).
2. Switch from `Local` to `Cloud` (or vice-versa).
3. Notice the toast: *"Provider set to cloud — gemini-2.0-flash"*.
4. Enter a prompt and submit.
5. Immediately click **Strike the run** (or press `Escape`).
6. **Verify:**
   - The in-flight generation is aborted.
   - A *"Run struck"* notice is bound to the manuscript: *"Nothing was bound to this session — the partial draft was discarded, and no citation was recorded."*
   - No partial hallucinations or broken fragments are persisted.

### Scenario 7: Mobile & Responsive Layout
1. Open Chrome DevTools (`F12`) and toggle device emulation (e.g. iPhone 14 or Pixel 7).
2. **Verify:**
   - Layout cleanly adapts to a single-column reading measure.
   - The Index Rail becomes a drawer opened via the top-left menu icon.
   - Margin notes stack neatly beneath their respective sections.
   - Composer Bar remains accessible and usable above the mobile keyboard.
