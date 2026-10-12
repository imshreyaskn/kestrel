# Audit Record

This directory holds the independent audit cycle run against Kestrel between 2026-10-11 and 2026-10-12, and the verification of its remediation. The audits were performed against the repository as static analysis plus externally verified artifacts (the installed `@earendil-works/pi-ai` package, provider model catalogs, Ollama documentation), with test suites re-executed independently where possible.

Finding identifiers from these documents (A1…H3, BA1…BA22, CIT1…CIT10, SK/AR/MM, N1…N7) are referenced by several commit messages in the repository history. This index is the key to them.

## Documents

| Document | Scope | Outcome |
|---|---|---|
| `kestrel-harness-audit.md` | The agent harness: identity, context engineering, query handling, tool/pipeline engineering, response engineering, prompt architecture, personality; remediation waves 1–3 with code | ~26 findings; remediated across commits `c9cfeb1`, `61238b5`, `a01ec09`, `0466cd9`, `a5e9d82` |
| `design-implementation-audit.md` | The frontend against `uiux-research/awwwards-bone-aubergine-design-research.md`, clause by clause | ~30 findings; remediated in `1be8ee6`, `03eee9f`, `d98427f` |
| `backend-architecture-audit.md` | Backend architecture, process flow, per-functionality state-of-the-art comparison, over/under-engineering | 22 findings (BA1–BA22); remediated in `2d255f3` (Wave A), `febadf7` (Wave B), `d1a7a46` (Wave C) |
| `skills-artifacts-audit.md` | Assignment §4.2 (Ship 30 for 30 skill) and §4.3 (artifacts, viewer, security); mermaid design; the document-craft skill | 14 findings; remediated in `a8650ad` and the mermaid implementation |
| `citation-system-audit.md` | The citation pipeline end to end: numbering, leader lines, persistence, reload stability; redesign specification | 10 findings (CIT1–CIT10); remediated in `a8650ad` and Wave C |
| `findings-ledger.md` | The working ledger from the harness audit, with recorded product decisions | Superseded by the reports above; retained for process visibility |
| `rebaseline-verification.md` | Re-verification after the first remediation waves: fix matrix, newly introduced findings (N1–N7), independent test runs (175 backend, 99 frontend at that commit) | Confirmed ~90% closure; N-series items addressed in later commits except where noted below |

## Path note

`kestrel-harness-audit.md` originally lived at the repository root and is referenced under that name in `agent-transcripts/015` and `016`. Transcripts are historical records and were not edited; the file now lives in this directory.

## Open items carried forward

| Item | Source | Status |
|---|---|---|
| Font redistribution rights for the self-hosted display faces | rebaseline N1 · PRD risk R10 · `design.md` §2.2 | Must be confirmed (or faces swapped to OFL-licensed equivalents) before external redistribution |
| Ollama `num_ctx` passthrough is version-dependent | harness B1 correction · rebaseline N2 | `OLLAMA_CONTEXT_LENGTH` on the host documented as the guaranteed mechanism; probe MT-17.4 covers verification |
| In-app credential management | skills/harness audits · PRD §10 | Designed, intentionally deferred: `../proposals/multi-provider-credential-management.md` |
| Constrained output decoding | harness F1 | Evaluated and rejected for the local path with evidence (transcript 016, probe 5); ADR-001 amendment records the decision |
| Dead code after states-tray removal | rebaseline follow-up | Done: `StatesTray.tsx`, its CSS block, and all `TOUR_*` fixture data deleted; `demoData.ts` reduced to the shared CSP constant (`lib/csp.ts`); Fold and plate lookup carry no fixture fallbacks |
| Semantic citation-support evaluation (M2) | PRD §2.2 | Method defined; review campaign pending a live corpus run |
