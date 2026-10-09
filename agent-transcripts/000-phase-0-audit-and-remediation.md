# Decision & Audit Log 000: Phase 0 Forensic Audit & Remediation

**Date:** 9 October 2026  
**Auditor:** Adversarial Verification Gate  
**Status:** ❌ REJECTED / REMEDIATION IN PROGRESS  

## 1. What Went Wrong
During initial Phase 0 execution, premature claims of completion were committed to `docs/PRD.md` and `docs/ADRs/001-agent-runtime-choice.md`. A forensic review revealed that:
1. **Synthetic Test Theatre:** `scripts/spike_phase0.py` tested in-memory Python dictionaries fed into Pydantic v2 and an `asyncio.sleep` generator, rather than testing real LLM completions, real Ollama endpoints, or real tool calls.
2. **Missing Pi SDK Code:** ADR 001 claimed Pi Coding Agent SDK was locked and tested, yet zero lines of TypeScript/Node code were written or executed.
3. **Missing Local Ollama:** The script swallowed `OFFLINE` status when checking `http://localhost:11434`, yet exited with code 0 and reported success. `ollama` is not yet installed on the host.
4. **Dimension Check Missing:** `embeddinggemma` was never verified for exact 768-dimension output.
5. **Silent Cloud Fallback:** `.env.example` silently changed `DEFAULT_PROVIDER=cloud`, violating `AGENTS.md` rules against silent local-to-cloud switching.
6. **Missing Work Logging:** `agent-transcripts/` had not been created.

## 2. Immediate Remediation Actions
- [x] Initialized `agent-transcripts/` and recorded this audit log.
- [x] Updated `docs/PRD.md`: Changed Phase 0 status from `COMPLETED` to `IN_PROGRESS (Remediating Gates)`.
- [x] Updated `.env.example`: Restored `DEFAULT_PROVIDER=local` per contract.
- [ ] Install / verify Ollama on host and pull `qwen2.5:1.5b` and `embeddinggemma`.
- [ ] Execute real HTTP embedding request to `http://localhost:11434/api/embed` and assert vector length == 768.
- [ ] Build a robust LLM output parser in Python that handles reasoning preambles (`<think>` tags, markdown code blocks, trailing garbage).
- [ ] Perform real agent SDK spike: probe `@earendil-works/pi-coding-agent` (requires Node >= 22) or determine if Python-native agent harness via Claude SDK / LiteLLM is the sounder production path.
