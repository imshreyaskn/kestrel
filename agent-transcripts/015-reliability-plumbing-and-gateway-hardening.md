# Decision & Audit Log 015: Wave 2 Reliability Plumbing, Context Engineering & Gateway Hardening

**Date:** 11 October 2026  
**Auditor / Engineer:** Antigravity Pairing Agent  
**Status:** ✅ IMPLEMENTED & EMPIRICALLY VERIFIED  

---

## 1. Executive Summary & Scope

Following the completion and verification of Wave 1 (Epistemic Foundations & Companion Flow), Wave 2 addresses the structural reliability, context budgeting, and gateway hardening findings identified in `kestrel-harness-audit.md`:
- **Finding G2:** Typed gateway errors (`GatewayConfigError`, `PayloadTooLargeError`, `ModelNotAllowedError`) preventing misleading retryable classification on 400 missing keys, 403 bad token, 404 bad model, 413 oversized payload.
- **Finding D3:** Gateway `stop_reason` propagation to backend validator; `stop_reason in ("length", "max_tokens")` raises `AgentOutputError("TRUNCATED")` to prevent false JSON syntax error classification.
- **Finding D2:** Typed repair guidance via `REPAIR_GUIDANCE` in `prompts.py` (reason-keyed instructions for `JSON_PARSE`, `ESSAY_LENGTH`, `EMPTY_ANSWER`, `INVALID_LABELS`, `TRUNCATED`).
- **Finding E1:** Inline label validation (`enforce_inline_labels`) rejecting phantom markers `[E99]` in strict mode and gracefully pruning them post-repair.
- **Findings B1 & G4:** Ollama context allocation (`num_ctx: 16384`) and provider-aware `maxTokens` (3072 local, 8192 gemini/anthropic, 4096 openai) passed via Pi AI `samplingParams` in `server.ts`; token-budgeted sliding window history in `conversation_service.py`.
- **Finding G3:** Elimination of duplicate `@router.get("/providers")` in `config.py`; `providers.py` is the single source of truth.
- **Finding G7:** Newest-page pagination semantics in `session_service.py` (`order_by(created_at.desc(), id.desc())` with list reversed for chronological UI rendering).
- **Findings B5 & B3:** Candidate overlap deduplication (`_overlaps` >50% char span suppression) in `hybrid_search.py` + follow-up pronoun query expansion (`build_retrieval_query`).
- **Findings B4 & B7:** Weak evidence advisory flag in `RetrievalResult` (`top_dense < 0.32`) surfaced to UI + ambient UTC date stamp in system prompt + bounded artifact digest in message content.
- **Findings D4, G1, G6, G8:** Removal of unused `@earendil-works/pi-coding-agent` dependency; canonicalization of compose environment defaults; startup catalog verification in gateway.

---

## 2. Weak Model Policy & Anti-Duct-Tape Commitment

The local default model (`qwen2.5:1.5b`) is a 1.5-billion parameter model. Expecting it to reliably follow intricate multi-layered structured generation contracts with zero formatting issues is unrealistic. 
In strict alignment with user instructions and project principles:
1. **Zero Duct-Tape Prompt Engineering:** We do NOT shout in prompts, add repetitive "MUST COMPLY" boilerplate, or craft fragile prompt hacks to bend a 1.5B model.
2. **Fail Fast and Honestly:** Truncation at token limits produces `GENERATION_TRUNCATED` (`retryable: false`), not a false syntax retry loop.
3. **Bounded Repair:** At most one single repair attempt is made per generation. If it fails, a clean `MODEL_OUTPUT_INVALID` error is returned advising the user to select Cloud models for complex deliverables (e.g. 1,250-word essays or structured Growth Briefs).
4. **Graceful Pruning:** On repair passes (`strict_labels=False`), phantom citation markers (e.g. `[E99]`) are pruned rather than crashing the pipeline.

---

## 3. Empirical Verification Results

1. **Python Unit Suite:**
   - Command: `pytest tests/unit`
   - Result: `140 passed, 12 warnings in 2.91s` (Exit Code 0).
2. **Linter Check:**
   - Command: `python -m ruff check backend tests`
   - Result: `All checks passed!` (Exit Code 0).
3. **Frontend Vitest Suite:**
   - Command: `npm --prefix frontend test -- --run`
   - Result: `6 passed (6), 51 passed (51)` (Exit Code 0).
4. **Agent Gateway Build inside Container:**
   - Command: `docker exec kestrel-agent-gateway npm run build`
   - Result: `tsc` succeeded with zero diagnostic errors (Exit Code 0).
5. **Readiness Probe on Live Docker Stack:**
   - Command: `curl.exe -s http://localhost:8000/api/v1/health/ready`
   - Result: `{"status":"ready","components":{"database":{"status":"up","type":"postgresql"},"ollama":{"status":"up","version":"0.40.2"},"agent_gateway":{"status":"up"}}}` (Exit Code 0).
