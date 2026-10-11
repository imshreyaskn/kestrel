# Decision & Audit Log 012: Bone & Aubergine Design System Reskin & Motion Primitives

**Date:** 11 October 2026  
**Auditor / Engineer:** Antigravity Pairing Agent  
**Status:** ✅ IMPLEMENTED & EMPIRICALLY VERIFIED

---

## 1. Context and Objective

Based on `uiux-research/awwwards-bone-aubergine-design-research.md`, Kestrel's frontend was upgraded from the baseline terracotta/warm neutral gray palette to the comprehensive **Bone & Aubergine Editorial Design System**.

This upgrade satisfies the Editorial Research Studio design mandate while adhering strictly to the Anti-Slop Doctrine (§15 of research):
- Bone paper steps (`--bone-0` to `--bone-5`) replacing synthetic flat whites.
- Aubergine ink hierarchy (`--aub-950` to `--aub-200`) ensuring all typography is rendered in dark plum ink instead of neutral gray ink.
- The rail spine styled as a dark bound book spine (`--aub-950`) with a debossed ridge line highlight and gold folio numerals (`--gold: #A98A54`).
- Materiality features: aubergine-tinted grain overlay with multiply blend, deckle edge shadow rule, and registration marks flanking the masthead.
- Web Animations API (WAAPI) motion primitives in `frontend/src/lib/motion.ts`:
  - `play()` with Apple interruption law (inverts in-flight animations seamlessly).
  - `flip()` FLIP helper for smooth geometry transitions.
  - `stampPress()` tactile ink-stamp response for action buttons.
  - `bloomEndmark()` gold diamond registration bloom on entry completion.
  - `settleEntry()` Fraunces SOFT axis relaxation from 20 to 0 on arrival.
  - `applyStagger()` CSS variable stagger helper capped at 5 items.
  - Full reduced-motion degradation (`prefers-reduced-motion`) across CSS and JS.
- Signature moments implemented:
  - "The Fold" (§9.2): Growth Brief modal opens via 3D perspective fold (`.fold-doc-wrap` rotation).
  - "The Bloom" (§9.4): Gold diamond endmark blooms once upon message delivery.
  - "Printed Slips" (§8.9): Toasts enter with upward slip and permanent subtle tilt (-0.35deg).
  - "Status Dot Pulse" (§7.1): Provider dot breathes during active streaming runs.

---

## 2. Inventory of Changes

| File | Changes Made |
|---|---|
| `frontend/src/styles/dossier.css` | Comprehensive reskin: Bone steps, Aubergine ink, gold accents, paper shadow stacks, dark spine rail with gold folios, registration marks, deckle edge, drop caps, spring motion tokens, and dark mode appendix. |
| `frontend/src/lib/motion.ts` | WAAPI motion helper library implementing `play()`, `flip()`, `stampPress()`, `bloomEndmark()`, `settleEntry()`, and `prefersReducedMotion()`. |
| `frontend/src/components/RunningHead.tsx` | Added `isComposing` prop, `.rhead-title-text` hover styling, and composing breathing pulse on provider status dot. |
| `frontend/src/components/Manuscript.tsx` | Connected `bloomEndmark()` and `settleEntry()` to trigger on answer completion; added ref binding to entries container. |
| `frontend/src/components/Toasts.tsx` | Implemented `Slip` subcomponent triggering next-frame `.in` CSS transition for printed paper slip physics. |
| `frontend/src/components/GrowthBriefModal.tsx` | Added `.fold-doc-wrap` container for 3D perspective fold opening animation; added `stampPress` tactile effect on impression bind. |
| `frontend/src/components/Frontmatter.tsx` | Bound `stampPress` tactile effect to query submission button. |
| `frontend/src/components/ComposerBar.tsx` | Bound `stampPress` tactile effect to query submission button. |
| `frontend/src/App.tsx` | Propagated `isComposing` state to `RunningHead`. |
| `frontend/index.html` | Updated theme-color meta tag to `#F7F3EA` (`--bone-1`). |
| `frontend/src/test/motion.test.ts` | Added 13 unit tests verifying tokens, reduced-motion behavior, stamp presses, blooms, staggers, and WAAPI reversals. |

---

## 3. Empirical Verification Results

### A. Frontend TypeScript Typecheck
```bash
$ npx tsc --noEmit
Exit code: 0 (Zero errors)
```

### B. Frontend Vitest Test Suite
```bash
$ npm test --prefix frontend
> kestrel-frontend@1.0.0 test
> vitest run

 ✓ src/test/motion.test.ts (13 tests) 86ms
 ✓ src/test/citeInline.test.ts (7 tests) 72ms
 ✓ src/test/api.test.ts (12 tests) 35ms

Test Files  3 passed (3)
     Tests  32 passed (32)
  Duration  899ms
Exit code: 0
```

### C. Frontend Production Build
```bash
$ npm run build --prefix frontend
> kestrel-frontend@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 48 modules transformed.
rendering chunks...
dist/index.html                   0.94 kB │ gzip:  0.51 kB
dist/assets/index-0InjGpoo.css   40.72 kB │ gzip:  9.48 kB
dist/assets/index-C29yDG4s.js   223.92 kB │ gzip: 70.33 kB
✓ built in 2.51s
Exit code: 0
```

### D. Backend Unit Tests
```bash
$ python -m pytest tests/unit -q
115 passed, 10 warnings in 5.78s
Exit code: 0
```

### E. Backend Lint & Typecheck
```bash
$ python -m ruff check backend tests
All checks passed!
Exit code: 0

$ python -m mypy backend tests
Success: no issues found in 71 source files
Exit code: 0
```
