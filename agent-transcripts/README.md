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
