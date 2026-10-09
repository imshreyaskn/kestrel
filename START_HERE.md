# Start Here — The Lenny Growth Assistant

This pack is the implementation baseline for Google Antigravity. It is deliberately written as a specification and gated execution plan, not as permission to generate a huge unverified code dump.

## Files

- `IMPLEMENTATION_SPEC.md` — the canonical product, architecture, API, data, security, testing, deployment, and acceptance specification.
- `AGENTS.md` — persistent repo-level rules for Antigravity and other coding agents.
- `.agents/skills/verification-gates/SKILL.md` — reusable implementation/verification protocol for Antigravity.
- `runtime-skills/ship-30-for-30/SKILL.md` — the application’s product skill; the implementation must adapt/package it as a runtime skill loaded by the product, not confuse it with this IDE skill.

## How to start in Antigravity

1. Create/open a clean repository named `lenny-growth-assistant`.
2. Copy the contents of this pack into the repository root, preserving `.agents/` and `runtime-skills/` paths.
3. Open the workspace in Antigravity and verify that the root `AGENTS.md` and `.agents/skills/verification-gates/SKILL.md` are discoverable. Antigravity documents workspace `AGENTS.md` and `.agents/skills` support; use skills instead of legacy workflows.
4. Paste the prompt below into the Agent panel.
5. Keep autonomy supervised. Review architecture decisions and diffs at every phase boundary. Do not ask the agent to build the whole application in one unreviewed pass.

## First prompt to paste into Antigravity

> Read `AGENTS.md`, `IMPLEMENTATION_SPEC.md`, and `.agents/skills/verification-gates/SKILL.md` completely. Treat `IMPLEMENTATION_SPEC.md` as the single source of truth for requirements. Do not start by generating the entire app. First inspect the workspace and produce a concise implementation plan, requirements traceability matrix, risk register, and proposed repository tree. Then execute Phase 0 only: verify runtime versions/tooling; read the current official documentation for the selected agent SDK and Ollama; build a minimal compatibility spike proving local Ollama text generation, cloud-provider generation, structured output, tool/function-call behavior if required, streaming/cancellation behavior, and clean error handling. Do not fabricate test results. Based on the spike, record an ADR and lock the agent architecture. Default to the Pi Coding Agent SDK gateway if the Claude Agent SDK + Ollama path does not pass every required smoke test within 45 minutes. Do not leave two competing implementations. Stop after Phase 0 and show me the evidence, changed files, commands run, test output, and the next phase plan. Do not ask me questions whose answers are already in the spec.

## Subsequent implementation prompts

Use one prompt per phase. Do not merge all phases into a single agent run.

**Phase 1 — Foundation:**
> Implement Phase 1 from `IMPLEMENTATION_SPEC.md`: repository structure, configuration, typed contracts, Compose topology, migrations, database health/readiness, structured logging, and frontend shell. Add tests. Run them and report actual output. Do not implement RAG or final visual polish yet.

**Phase 2 — Knowledge base:**
> Implement Phase 2 from `IMPLEMENTATION_SPEC.md`: source sync, transcript parsing, chunking, local embeddings, PostgreSQL/pgvector indexing, hybrid retrieval, citation mapping, and retrieval evaluation fixtures. Prove retrieval against representative real transcript queries. Keep source transcripts out of the app repository.

**Phase 3 — Agent/model workflows:**
> Implement Phase 3 from `IMPLEMENTATION_SPEC.md`: explicit provider selection, grounded answer workflow, session history, validated evidence IDs, Growth Brief, and the Ship 30 for 30 runtime skill. Preserve session isolation and prohibit silent provider fallback. Test local Ollama first.

**Phase 4 — Product UI and artifacts:**
> Implement Phase 4 from `IMPLEMENTATION_SPEC.md`: Editorial Research Studio UI, sessions, research/brief/content actions, evidence inspector, Markdown/HTML artifact viewer, safe preview isolation, responsive and accessibility states. Use mocked API fixtures only until the real integration contract is available; then integrate and remove inappropriate mocks.

**Phase 5 — Hardening and handoff:**
> Implement Phase 5 from `IMPLEMENTATION_SPEC.md`: full test matrix, security tests, UI manual test plan, one-command startup, `.env.example`, README, PRD, `design.md`, `architecture.md`, representative sanitized agent transcripts, and demo script. Run a fresh-clone rehearsal. Report failed gates honestly; fix them rather than weakening tests.

## One rule for the deadline

When time is tight, reduce optional polish or P2 scope—not correctness, the mandatory Ollama demonstration, source traceability, artifact isolation, persistence, or evaluator handoff. A working narrow feature is better than a fake broad feature. The Growth Brief is a persisted structured deliverable, not a workflow engine.
