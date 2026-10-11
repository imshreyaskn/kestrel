# Decision & Audit Log 013: Editorial Studio UX Refinement & Dossier Persistence Invariants

**Date:** 11 October 2026  
**Auditor / Engineer:** Antigravity Pairing Agent  
**Status:** ✅ IMPLEMENTED & EMPIRICALLY VERIFIED

---

## 1. Context and Objective

Following the baseline Bone & Aubergine design system implementation (Transcript 012), interactive usability testing and review revealed several visual and architectural refinements needed for the Editorial Research Studio frontend:
1. **Paper Materiality & Theme Inversion:** An imported dark-mode media query from the research document inverted the canvas on dark-mode host OSs into dark purple. The Anti-Slop Doctrine mandates light paper as the base (`--canvas: #F2F0E9`), with Aubergine strictly as an ink and accent token.
2. **Hero Typography & Line Wrapping:** The frontmatter hero headline (`What are you working through?`) suffered from unpredictable viewport wrap on `through?`. The Fraunces variable font hover on `.w.wonk` snapped abruptly between weights/axes.
3. **Running Head Centering:** Using `flex: 1` between asymmetric brand and colophon elements pushed the dossier title off-center.
4. **Seamless Inline Retitling:** Instead of replacing the title text with an input box or modal, double-clicking should activate native inline editing with a text cursor and subtle Aubergine underline.
5. **Title Character Limit & Dynamic Centering:** The running head title needed a 60-character ceiling, a non-displacing counter badge, and responsive mathematical centering that expands symmetrically outward without colliding with the brand or colophon.
6. **Dossier Persistence Invariant:** Unpersisted draft sessions must never be recorded in PostgreSQL. Clicking "New Dossier" or renaming an untitled dossier must remain purely local UI state until the user actually sends their first query.

---

## 2. Summary of Changes

| Area / File | Previous Behavior | Shipped Implementation |
|---|---|---|
| `frontend/src/styles/dossier.css` | `@media (prefers-color-scheme: dark)` inverted UI to dark plum | Removed dark media query. Canvas locked to warm bone paper (`#F2F0E9`) with light paper rail and aubergine ink tokens. |
| `frontend/src/components/Frontmatter.tsx` | Hero text rendered as flat string | Split headline into semantic `.hero-row` blocks with Fraunces SOFT variable font animation (0 -> 80) and fixed WONK axis to eliminate style snapping. |
| `frontend/src/components/RunningHead.tsx` | Brand subtitle contained redundant slogan tags | Subtitle cleaned to `Kestrel <small>growth research dossier, drawn from Lenny’s Podcast archive</small>`. |
| `frontend/src/styles/dossier.css` | `.rhead-title` relied on `flex: 1` | Replaced with mathematical centering (`position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: max-content; max-width: min(580px, calc(100vw - 440px));`). Brand max-width bounded defensively to `calc(50vw - 260px)`. |
| `frontend/src/components/RunningHead.tsx` | Swapped in an `<input>` element on edit | Replaced with in-place `contentEditable` span (`.rhead-title-text.is-editing`), activating an Aubergine underline (`border-bottom: 1.5px solid var(--accent)`), selecting text on double-click, committing on Enter/blur, and reverting on Escape. |
| `frontend/src/components/RunningHead.tsx` & `dossier.css` | Unbounded title length; no counter | Enforced 60-character limit (`MAX_TITLE_LENGTH = 60`) on keypress and paste. Added an absolute editorial counter badge (`{charCount} / 60`) anchored at `top: calc(100% + 4px); left: 50%; transform: translateX(-50%);` with zero horizontal displacement. |
| `frontend/src/App.tsx` | Retitling untitled session created empty DB row | Introduced `draftTitle` state. Renaming or clicking "New Dossier" updates local state only. PostgreSQL session creation is strictly deferred to `handleSubmitQuery` when the user sends a message. |

---

## 3. Empirical Verification Results

### A. TypeScript Typecheck
```bash
$ npx tsc --noEmit (in frontend/)
Exit code: 0 (Zero errors)
```

### B. Frontend Vitest Test Suite
```bash
$ npm test -- --run (in frontend/)
Test Files  3 passed (3)
Tests       32 passed (32)
Duration    373ms
```

### C. Backend Pytest Unit Test Suite
```bash
$ pytest tests/unit
115 passed, 10 warnings in 2.23s
Exit code: 0
```

### D. Hot Module Replacement (Vite)
- Verified active Vite dev server (`http://localhost:5173`) cleanly compiles and pushes HMR updates for `RunningHead.tsx`, `App.tsx`, and `dossier.css`.
