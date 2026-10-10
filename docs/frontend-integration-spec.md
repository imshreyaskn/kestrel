# Frontend Integration Specification & Handoff Guide (Codename: Kestrel)

**Target Repository:** `https://github.com/imshreyaskn/kestrel.git`  
**Working Directory:** `frontend/`  
**Backend:** FastAPI 0.115+ (Python 3.13) at `http://localhost:8000` (proxied via Nginx at `http://localhost:5173/api/`)  
**Design System Reference:** `uiux-research/kestrel-dossier-prototype.html` & `docs/design.md`  
**Governing Architecture:** `IMPLEMENTATION_SPEC.md` & `docs/architecture.md`  

---

## 1. Executive Directive

The current React frontend in `frontend/src/` looks visually identical to the Editorial Research Studio prototype (`uiux-research/kestrel-dossier-prototype.html`), but its internals rely heavily on **hardcoded mock stubs** (`frontend/src/lib/demoData.ts`), fake fallback generators (`deliverResult` in `App.tsx`), and disconnected form state (`GrowthBriefModal.tsx` lacks two-way state binding).

Your objective is to **bind the frontend completely to the real FastAPI backend, PostgreSQL database, and live SSE streaming engine**, replacing all mock pipelines with real API calls while **preserving 100% of the editorial visual aesthetics, typography, animations, and margin note layout**.

---

## 2. Inventory of Current Mock Disconnects

| Component / File | Current Prototype Mock Behavior | Required Real Production Behavior |
|---|---|---|
| `frontend/src/App.tsx` (`deliverResult`) | Hardcodes canned Superhuman/Rahul Vohra/Casey Winters citations on error or submit. | Eliminate `deliverResult` mock fallback completely; render real server error envelopes or real stream events. |
| `frontend/src/App.tsx` (`INITIAL_SESSIONS`) | Pre-seeds fake sessions (`'act'`, `'pricing'`, `'empty1'`) on boot. | Fetch real sessions from `GET /api/v1/sessions`; display empty pristine frontmatter if user has 0 sessions. |
| `frontend/src/App.tsx` (`answerEntry`) | Dumps raw model string into a single dummy section `"I: Synthesized Evidence"`. | Parse structured Roman numeral sections (`I.`, `II.`) or Markdown headers; inline `sn-ref` buttons where `[1]`, `[2]` appear in text. |
| `frontend/src/components/GrowthBriefModal.tsx` | Content is `contentEditable="true"` but has **zero** event handlers; saving sends unedited initial text. | Bind two-way state (`onInput` / `onBlur`) across all 7 brief sections; send updated JSON payload on save. |
| `frontend/src/components/GrowthBriefModal.tsx` (`foldSave`) | Ignores version concurrency or hardcodes `activeBrief.id !== 'brief-1'`. | Send `expected_version: brief.version` to `PATCH /api/v1/growth-briefs/{id}`; handle HTTP 409 Conflict gracefully. |
| `frontend/src/components/Manuscript.tsx` | Citation reference buttons `[1]` are simply appended to the end of paragraphs. | In-text replacement: replace occurrences of `[1]`, `[2]`, `[E1]` with interactive `<button className="sn-ref">` inline. |
| `frontend/src/components/LeaderLines.tsx` | Redraws only on static timeouts; misses dynamic markdown rendering reflows. | Use `ResizeObserver` / `MutationObserver` on `#entries` to keep SVG lines aligned during scroll and reflow. |
| `frontend/src/components/PlateViewerModal.tsx` | Uses static `INITIAL_ARTIFACTS`. | Hydrate from real `GET /api/v1/artifacts/{id}`; support live "Revise" prompt dispatch. |
| `frontend/src/components/IndexRail.tsx` | Deleting or renaming only alters local React state or fails silently. | Call `PATCH /api/v1/sessions/{id}` for rename, `DELETE /api/v1/sessions/{id}` for deletion. |

---

## 3. Authoritative Backend API Contracts

All endpoints are available at `/api/v1/*` (Nginx proxies `http://localhost:5173/api/` to FastAPI backend with `proxy_buffering off` for unbuffered SSE streaming).

### A. Health & Readiness Probe
* **Endpoint:** `GET /api/v1/health/ready`
* **Response (HTTP 200):**
```json
{
  "status": "ready",
  "components": {
    "database": { "status": "up", "type": "postgresql" },
    "ollama": { "status": "up", "version": "0.40.2" },
    "agent_gateway": { "status": "up" }
  },
  "timestamp": 1791616855.0
}
```

### B. Provider Configuration
* **Endpoint:** `GET /api/v1/providers`
* **Response (HTTP 200):**
```json
{
  "local": {
    "provider": "ollama",
    "model": "qwen2.5:1.5b",
    "status": "ready"
  },
  "cloud": {
    "provider": "gemini",
    "model": "gemini-3.8-flash",
    "status": "ready",
    "configured": true
  }
}
```

### C. Session Management
* **List Sessions:** `GET /api/v1/sessions` $\rightarrow$ Array of `SessionResponse`
* **Create Session:** `POST /api/v1/sessions`
  * Body: `{"title": "Pricing Migration Analysis", "provider_preference": "local"}`
  * Response (HTTP 201): `SessionResponse`
* **Rename Session:** `PATCH /api/v1/sessions/{session_id}`
  * Body: `{"title": "Updated Dossier Title"}`
  * Response (HTTP 200): `SessionResponse`
* **Delete Session:** `DELETE /api/v1/sessions/{session_id}`
  * Response (HTTP 200): `{"deleted": true, "session_id": "..."}`
* **Session Schema (`SessionResponse`):**
```typescript
interface SessionResponse {
  id: string; // UUID
  title: string;
  provider_preference: 'local' | 'cloud';
  created_at: string; // ISO
  updated_at: string; // ISO
  last_message_at: string | null;
}
```

### D. Session Messages (History Hydration)
* **Endpoint:** `GET /api/v1/sessions/{session_id}/messages`
* **Response (HTTP 200):**
```typescript
interface MessagesResponse {
  messages: Array<{
    id: string; // UUID
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    status: 'complete' | 'cancelled' | 'pending';
    provider: string;
    model_id: string;
    created_at: string;
    completed_at: string | null;
    citations?: Array<{
      evidence_id: string;
      source_id: string;
      chunk_id: string;
      guest: string | null;
      episode_title: string;
      episode_url: string | null;
      publish_date: string | null;
      excerpt: string; // Verbatim chunk quote from PostgreSQL
      supports?: string;
    }>;
  }>;
  limit: number;
  offset: number;
}
```

### E. Message Submission & SSE Streaming (Core Engine)
* **Endpoint:** `POST /api/v1/sessions/{session_id}/messages`
* **Request Headers:** `Content-Type: application/json`, `Accept: text/event-stream`
* **Request Body:**
```typescript
interface MessageRequest {
  content: string; // 1-10000 chars, no null bytes (\u0000)
  mode: 'research' | 'growth_brief' | 'essay' | 'artifact_markdown' | 'artifact_html';
  provider: 'local' | 'cloud';
  cloud_provider?: 'gemini' | 'anthropic' | 'openai' | null;
  model_id?: string | null;
  artifact_format?: 'markdown' | 'html' | null;
  product_context?: string | null; // max 4000 chars
  stream: true;
}
```
* **SSE Stream Lifecycle Events:**
  1. `event: stage` $\rightarrow$ `{"stage": "loading_context", "label": "Loading session context..."}`
  2. `event: run_started` $\rightarrow$ `{"run_id": "uuid", "message_id": "uuid", "session_id": "uuid"}`
  3. `event: stage` $\rightarrow$ `{"stage": "retrieving", "label": "Searching podcast archive..."}`
  4. `event: stage` $\rightarrow$ `{"stage": "drafting", "label": "Synthesizing answer..."}`
  5. `event: stage` $\rightarrow$ `{"stage": "validating", "label": "Validating citations & evidence..."}`
  6. `event: stage` $\rightarrow$ `{"stage": "saving", "label": "Persisting message..."}`
  7. `event: completed` $\rightarrow$
```json
{
  "message": {
    "id": "uuid",
    "session_id": "uuid",
    "role": "assistant",
    "status": "complete",
    "content": "Full markdown or structured text...",
    "mode": "research",
    "provider": "local",
    "model_id": "qwen2.5:1.5b",
    "created_at": "2026-10-10T12:00:00Z",
    "completed_at": "2026-10-10T12:00:05Z"
  },
  "citations": [
    {
      "evidence_id": "1",
      "source_id": "uuid",
      "chunk_id": "uuid",
      "guest": "Rahul Vohra",
      "episode_title": "How Superhuman Built An Engine For Finding Product-Market Fit",
      "episode_url": "https://www.lennyspodcast.com/how-superhuman-built-an-engine-for-finding-product-market-fit-rahul-vohra/",
      "excerpt": "Verbatim chunk text extracted from PostgreSQL...",
      "supports": "Survey segmentation methodology"
    }
  ],
  "insufficient_evidence": false,
  "growth_brief_id": "uuid-or-null",
  "artifact_id": "uuid-or-null"
}
```
  8. `event: error` (On failure):
```json
{
  "error": {
    "code": "GENERATION_TIMEOUT",
    "message": "The model took too long to respond. Retry, or switch provider.",
    "retryable": true
  }
}
```

### F. Growth Brief CRUD & Concurrency
* **Get Brief:** `GET /api/v1/growth-briefs/{brief_id}`
* **Update Brief (Optimistic Locking):** `PATCH /api/v1/growth-briefs/{brief_id}`
  * Request Body:
```json
{
  "title": "Activation Overhaul Brief",
  "data": {
    "problem": "New user activation has dropped 14%...",
    "recommendation": "Rebuild the first-run experience around the core aha moment...",
    "assumptions": ["Users understand the product thesis", "Email delivery is reliable"],
    "experiment": {
      "hypothesis": "Reducing onboarding steps from 5 to 2 increases day-1 aha",
      "change": "Remove optional team invite modal",
      "segment": "Self-serve signups",
      "success_metric": "Day 1 Core Action completion (+15%)",
      "guardrail_metric": "Week 4 retention",
      "decision_rule": "Roll out if metric +10% with zero negative impact on retention"
    },
    "risks": ["Slight dip in early team invites"],
    "next_deliverable": "Plate: Activation Experiment One-Pager"
  },
  "expected_version": 1,
  "status": "draft"
}
```
  * **Status Codes:**
    * `200 OK`: Returns updated `GrowthBriefResponse` with `version: 2`.
    * `409 Conflict`: Expected version does not match database version (`"Version conflict: current version is 2, expected 1"`).
    * `422 Unprocessable Entity`: `expected_version` omitted or invalid payload.

### G. Artifacts (Plate Viewer)
* **Get Artifact:** `GET /api/v1/artifacts/{artifact_id}`
* **Update Artifact:** `PATCH /api/v1/artifacts/{artifact_id}`
  * Body: `{"title": "...", "content": "...", "expected_version": 1}`
  * Status Codes: `200 OK`, `409 Conflict`, `422 Unprocessable Entity`.

---

## 4. Architectural Invariants to Uphold

1. **Zero Fake Demos in Production Flow:**
   - Do not display canned data (`INITIAL_SESSIONS`, `INITIAL_GROWTH_BRIEF`) when real database records exist.
   - If no sessions exist, show the clean Frontmatter view ("What are you working through?").
2. **Server-Side Evidence Provenance:**
   - Quotes in Sidenotes (`.snote`) MUST come directly from `citation.excerpt` received from the backend, never from model text.
   - Sidenotes MUST display the canonical episode URL link (`citation.episodeUrl`) with an external link indicator `↗`.
3. **In-Text Citation Inlining:**
   - Replace model-generated markers (`[1]`, `[2]`, `[E1]`, `[E2]`) in the body text with:
     ```html
     <button class="sn-ref" data-note="sn-{sessionId}-{evidenceId}" data-n="{refIndex}" aria-label="Read evidence note {refIndex}">
       {refIndex}
     </button>
     ```
   - Clicking or hovering `.sn-ref` highlights the corresponding `.snote` card and animates the SVG leader line.
4. **Sandboxed HTML Artifact Isolation:**
   - HTML plates MUST be previewed exclusively inside `<iframe sandbox="" srcDoc={safeHtml}>` with `script-src 'none'`.
   - Never inject user-generated HTML directly into the parent React DOM via `dangerouslySetInnerHTML`.
5. **In-Flight Cancellation ("Strike the run"):**
   - Clicking "Strike the run" or pressing `Esc` during composing must call `reader.cancel()` on the SSE stream.
   - Persist an aborted notice card in the local manuscript: *"Run struck — nothing was persisted"*.

---

## 5. Verification Quality Gates

Before declaring completion, verify each of the following:

1. **Clean TypeScript Build:** `npm run build --prefix frontend` exits with code 0 and 0 errors.
2. **Real Conversation Flow:** Submit `"How did Superhuman optimize onboarding activation?"` with `local` provider:
   - Live stage animations progress in `ComposerBar`.
   - Manuscript renders formatted response with superscript citation buttons `[1]`, `[2]`.
   - Margin rail displays corresponding `SideNote` cards with verbatim excerpts.
   - SVG leader lines connect superscripts to margin notes.
3. **Abstention Flow:** Submit an out-of-corpus query (`"What is the average PLG benchmark conversion rate across SaaS in 2026?"`):
   - Displays *"Not in the archive"* notice with query suggestions.
4. **Growth Brief Persistence:**
   - Switch mode to `Brief`, submit a problem statement.
   - Modal opens with 7 sections populated from real backend brief.
   - Edit the *Problem* section, click **Bind impression**.
   - Successfully increments version (Version 2) with toast confirmation.
5. **Session Management:**
   - Rename session via Index Rail $\rightarrow$ persists across browser refresh.
   - Delete session $\rightarrow$ successfully removed from PostgreSQL.
