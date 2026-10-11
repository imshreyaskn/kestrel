# Decision & Audit Log 011: Frontend Live Backend Binding & Verification

**Date:** 11 October 2026  
**Auditor / Engineer:** Antigravity Pairing Agent  
**Status:** ✅ COMPLETED & EMPIRICALLY VERIFIED

---

## 1. Context and Objective

The editorial prototype for the Lenny Growth Assistant (Editorial Research Studio / Dossier visual design system) was implemented in `frontend/src/` as a visual prototype. While visually faithful to `uiux-research/kestrel-dossier-prototype.html`, it contained multiple prototype stubs, disconnected forms, and mock fallbacks:
- `deliverResult` in `App.tsx` generated synthetic Vohra / Winters citations upon error or submit.
- `INITIAL_SESSIONS` pre-seeded canned sessions (`'act'`, `'pricing'`, `'empty1'`) instead of querying PostgreSQL.
- `GrowthBriefModal.tsx` had inert `contentEditable="true"` blocks with zero two-way binding.
- `IndexRail.tsx` lacked real session deletion.
- Markdown and model text relied on raw HTML injection or non-inline citation markers.
- Backend SSE disconnects during gateway generation were not propagating, leaving assistant rows dangling in `pending` state.
- The frontend repository lacked an automated test runner (`vitest`).

The objective was to bind the frontend cleanly to FastAPI, PostgreSQL, and the live SSE engine, eliminate all mock fallbacks, support optimistic concurrency and session deletion, and enforce all security and quality invariants from `AGENTS.md` and `IMPLEMENTATION_SPEC.md`.

---

## 2. Inventory of Changes and Stubs Eliminated

| Area / File | Prototype Stub / Violation | Production Implementation & Fix |
|---|---|---|
| `frontend/src/App.tsx` | `deliverResult` mock fallback generated fake citations on error | Deleted completely. All submissions invoke live SSE pipeline (`api.streamMessage`). Errors render honest failure notices with backend error envelopes. |
| `frontend/src/App.tsx` | `INITIAL_SESSIONS` loaded on boot | Replaced with `api.getSessions()` from `GET /api/v1/sessions`. Empty archive displays pristine Frontmatter landing view. Real sessions lazily load messages via `GET /api/v1/sessions/{id}/messages`. |
| `frontend/src/App.tsx` & `IndexRail.tsx` | Deleting sessions only altered local React state or failed silently | Added `handleDeleteSession` calling `DELETE /api/v1/sessions/{id}` with optimistic UI removal and revert on error. Added desktop/mobile `.rl-del` styles in `dossier.css`. |
| `frontend/src/components/Manuscript.tsx` | `dangerouslySetInnerHTML` used for paragraphs; citations appended at end | Removed `dangerouslySetInnerHTML`. Created `RichText` component with in-text citation marker replacement (`[1]`, `[2]`, `[E1]`) into `<button className="sn-ref">` with safe bold/italic emphasis. |
| `frontend/src/components/GrowthBriefModal.tsx` | Unbound `contentEditable` divs; ignored version concurrency | Full two-way binding via `EdBlock` across all 7 sections (`problem`, `researchSummary`, `recommendation`, `assumptions`, `experiment`, `risks`, `nextDeliverable`). "Bind impression" sends `expected_version` to `PATCH /api/v1/growth-briefs/{id}` with 409 conflict detection. |
| `frontend/src/components/PlateViewerModal.tsx` | Potential HTML injection vulnerability | Sandboxed preview iframe (`sandbox=""` with strict CSP `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ... script-src 'none';">`). Never mounts model HTML in parent DOM. |
| `frontend/src/components/RunningHead.tsx` | Fabricated git commit stamps (`commit 8f3c21c`) | Replaced with honest static provenance claim: `transcript archive · every citation maps to a stored chunk`. |
| `backend/app/services/conversation_service.py` | Disconnect during gateway generation left rows pending | Added `_run_cancellable` polling `is_disconnected()` every 300ms. Disconnect cancels task and marks message `status='cancelled'`, `error_code='CANCELLED'`. |
| `frontend/package.json` | Missing test framework (Spec §12.4) | Installed `vitest`. Created 19 comprehensive unit tests covering SSE parser, mode mappers, brief record transformation, UUID validation, and citation segmentation. |

---

## 3. Empirical Verification Results

### A. Frontend Unit Tests (Vitest)
```bash
$ npm test --prefix frontend
> kestrel-frontend@1.0.0 test
> vitest run

 RUN  v4.1.11 E:/Drizzle/Oogway/frontend

 ✓ src/test/citeInline.test.ts (7 tests) 70ms
 ✓ src/test/api.test.ts (12 tests) 22ms

 Test Files  2 passed (2)
      Tests  19 passed (19)
   Duration  904ms
Exit code: 0
```

### B. Frontend TypeScript Typecheck & Production Build
```bash
$ npx tsc --noEmit && npm run build
> kestrel-frontend@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 47 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.94 kB │ gzip:  0.51 kB
dist/assets/index-CFpTDJv5.css   30.08 kB │ gzip:  7.11 kB
dist/assets/index-BQTsivJi.js   222.77 kB │ gzip: 69.90 kB
✓ built in 2.46s
Exit code: 0
```

### C. Backend Unit Tests (Pytest)
```bash
$ python -m pytest tests/unit -q
115 passed, 10 warnings in 4.90s
Exit code: 0
```

### D. Backend Linter and Typechecker
```bash
$ python -m ruff check backend tests
All checks passed!
Exit code: 0

$ python -m mypy backend tests
Success: no issues found in 70 source files
Exit code: 0
```

### E. Live Stack Readiness Probe
```bash
$ curl.exe -s http://localhost:8000/api/v1/health/ready
{"status":"ready","components":{"database":{"status":"up","type":"postgresql"},"ollama":{"status":"up","version":"0.40.2"},"agent_gateway":{"status":"up"}},"timestamp":1791708508.7976537}

$ curl.exe -s http://localhost:5173/api/v1/health/ready
{"status":"ready","components":{"database":{"status":"up","type":"postgresql"},"ollama":{"status":"up","version":"0.40.2"},"agent_gateway":{"status":"up"}},"timestamp":1791708242.0670702}
```

---

## 4. Residual Risks & Next Steps

1. **Production Frontend Container:** `kestrel-frontend` container in Docker can be built and run on `:5173` via `docker compose up -d --build frontend`, or the host Vite dev server can continue serving.
2. **Duplicate `/api/v1/providers` Route:** As noted in the handoff, both `providers.py` and `config.py` declare this route. The `config.py` dictionary wins at runtime, and `api.ts` parses both shapes defensively. A deduplicating ADR can be scheduled in the next maintenance cycle.
