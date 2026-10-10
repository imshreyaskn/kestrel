# Agent Transcripts & Decision Logs

This directory contains genuine, sanitized transcripts and decision records of the AI coding agents working on **The Lenny Growth Assistant (Codename: Kestrel)**.

## Policy & Requirements (per `AGENTS.md`)
- Log significant attempts, failures, corrections, and verification outcomes as work happens.
- Never fabricate transcripts after the fact.
- All secrets, API keys, private tokens, and personally identifiable information must be strictly redacted before commit.
- Transcripts serve as an honest record of engineering decisions, tool execution outcomes, and architectural pivots.

## Index of Transcripts
- `000-phase-0-audit-and-remediation.md`: Forensic audit of initial Phase 0 claims, rejection of synthetic test theatre, and systematic remediation plan.
- `001-phase-0-live-ollama-evidence.md`: Live Ollama smoke test verification: embeddinggemma 768-dim check, qwen2.5:1.5b structured output, and preamble stripping.
- `002-phase-0-gateway-and-sdk-evidence.md`: Live containerized Node 22 Pi Agent Gateway build, spike verification, and end-to-end integration with Host Ollama and Python backend.
- `003-phase-0-pi-ai-sdk-realization.md`: Genuine Pi AI SDK integration (models.complete, Google & Ollama providers), pytest test suite standardization (13/13 passing), and Node 22 engine constraint documentation.
- `004-phase-0-final-audit.md`: Formal adversarial audit verifying commits bea9670 and 2a8d04f, confirming Phase 0 is definitively complete and unblocking Phase 1.
- `005-phase-1-foundation-evidence.md`: Phase 1 verification: Alembic migration 0002_add_users, single-user demo identity seed, Editorial Research Studio React + TypeScript build, and 20/20 passing test suite.
- `006-phase-2-ingestion-evidence.md`: Phase 2 verification: Transcript parser, sentence-preserving chunker, Ollama/embeddinggemma 768-dim embedder, Reciprocal Rank Fusion (RRF) hybrid search, 20-case retrieval benchmark evaluation, and idempotent ingestion CLI.
- `007-phase-3-conversation-evidence.md`: Phase 3 verification: Server-Sent Events (SSE) streaming pipeline, nh3 HTML sanitizer and CSP builder, runtime Ship 30 for 30 essay skill, Pydantic schema validation and hallucination pruning, session CRUD, and 95 passing tests.
- `008-phase-4-workbench-evidence.md`: Phase 4 verification: Editorial Research Studio workbench integration, zero-dependency MarkdownViewer component, sandboxed iframe Plate Viewer, dynamic Growth Brief editor with optimistic versioning (HTTP 409), and 99 passing tests including integrated E2E workbench test suite.
- `009-phase-5-hardening-and-handoff-evidence.md`: Phase 5 verification: Full documentation suite (architecture, design, manual test plan, PRD, README), zero linter/type issues across 69 files, and formal definition of done audit.
- `010-phase-3-audit-remediation.md`: Adversarial audit of the shipped Phase 3–5 claims, the 18 findings (including a gateway request-contract bug that had broken the live research flow), full remediation, and live end-to-end re-verification on the running stack.
