# Agent Transcript 002: Phase 0 Pi Gateway & SDK Verification Evidence

**Date:** 2026-10-09  
**Phase:** Phase 0 (Reconnaissance & Architecture Spike)  
**Status:** COMPLETED & EMPIRICALLY VERIFIED  

---

## 1. Context & Objectives

Following the adversarial audit of the Phase 0 remediation, four specific defects and validation gaps were identified:
1. Missing `pytest.ini` preventing direct `pytest` execution without `python -m`.
2. Non-greedy code fence regex in `json_extractor.py` causing truncation when JSON string values contained markdown code blocks (e.g., SQL queries).
3. The TypeScript/Node.js "Pi Coding Agent Gateway" was an incomplete stub without `server.ts`, uninstalled `node_modules`, and lacked live SDK verification.
4. Premature claims of Phase 0 completion before empirical proof of the containerized gateway.

---

## 2. Actions & Empirical Execution

### A. Test Runner Standardization
- Created root `pytest.ini` with `pythonpath = .` and `testpaths = tests`.
- Verified direct invocation:
  ```bash
  .\.venv\Scripts\pytest.exe -v
  ```
- **Result:** 8/8 tests passed in 0.18s cleanly.

### B. Robust JSON Extraction Hardening
- Rebuilt `extract_json_payload()` in `backend/app/core/json_extractor.py` using candidate testing:
  1. Outermost balanced `{...}` on cleaned text.
  2. Greedy outermost code fences to preserve nested fences inside string values.
  3. Non-greedy fences for multi-block responses.
  4. Validation through `json.loads` before returning candidates.
- Added comprehensive unit tests in `tests/unit/test_json_extractor.py`:
  - `test_nested_code_fences_with_sql_and_curlys`
  - `test_multiple_code_blocks_in_conversational_response`
- Static type verification:
  ```bash
  python -m mypy backend tests scripts
  # Success: no issues found in 8 source files
  ```

### C. Containerized Node 22 Pi Agent Gateway Implementation
- Implemented `agent-gateway/src/server.ts` implementing the HTTP contract from spec §6.6 (`GET /health`, `POST /api/v1/generate`).
- Updated `agent-gateway/src/spike.ts` importing `@earendil-works/pi-ai` and verifying Node 22 engine compliance and tool contracts.
- Configured `agent-gateway/Dockerfile` using Node 22 (`node:22-bookworm-slim`) and `--registry=https://registry.npmmirror.com` to prevent ISP-level Cloudflare resets on `registry.npmjs.org`.
- Built Docker image:
  ```bash
  docker build -t kestrel-agent-gateway ./agent-gateway
  # Exit code: 0, added 205 packages
  ```
- Ran spike test inside the Docker container:
  ```bash
  docker run --rm kestrel-agent-gateway npm run spike
  ```
  **Output:**
  ```
  === Pi Coding Agent Gateway Spike (Phase 0) ===
  Node Runtime Version: v22.23.3
  [Node Check] Node version v22.23.3 satisfies Pi SDK engine requirements (>=22.19.0).
  [Pi SDK Module Check]
  Pi AI module loaded successfully: true
  Available Pi AI exports count: 68
  Pi AI TypeBox export verified.
  [Provider Config] Resolved: {
    "provider": "local",
    "model_id": "qwen2.5:1.5b",
    "base_url": "http://host.docker.internal:11434"
  }
  === Pi Gateway Spike Verification Succeeded! ===
  ```
- Verified TypeScript compilation inside the container:
  ```bash
  docker run --rm kestrel-agent-gateway npm run build
  # Exit code: 0 (tsc clean)
  ```

### D. End-to-End Live Integration Verification
- Ran live test container with host gateway mapping:
  ```bash
  docker run -d --name test-gateway -p 8010:8010 --add-host=host.docker.internal:host-gateway kestrel-agent-gateway
  ```
- Executed `scripts/test_live_gateway.py` connecting Python backend to Agent Gateway to Host Ollama:
  ```bash
  python scripts/test_live_gateway.py
  ```
  **Output:**
  ```
  === Testing Live Agent Gateway at http://localhost:8010 ===
  [Health Check] OK: {'status': 'ok', 'service': 'kestrel-agent-gateway', 'runtime': 'node', 'node_version': 'v22.23.3', 'uptime_seconds': 64.048173171}

  [Generate Test] Sending grounded generation request to Agent Gateway...
  [Generate Test] Status 200 in 1.29s (Gateway reported latency: 1084ms)
  [Raw Model Response]
  {
    "answer_markdown": "Elena Verna's rule on product activation is that activation is the single biggest predictor of long-term retention and growth. If users never experience value, retention is dead.",
    "citations": [
      {
        "evidence_id": "E1",
        "supports": "Elena Verna's rule on product activation"
      }
    ],
    "insufficient_evidence": false
  }

  [Backend Validation] Parsing and validating raw response...
  [Validation Success] Answer length: 178 chars
  [Validation Success] Citations found: 1
    - Citation [E1]: Elena Verna's rule on product activation

  === All Gateway Phase 0 Verification Checks Passed! ===
  ```
- Cleaned up test container:
  ```bash
  docker rm -f test-gateway
  ```

---

## 3. Phase 0 Gate Audit Assessment

With empirical proof on both Python and Node/Docker sides:
1. Host Ollama (`qwen2.5:1.5b` chat + `embeddinggemma` 768-dim embeddings): **PASSED**
2. Pi Agent Gateway (Node 22 container, `@earendil-works/pi-ai`, Express `/health`, `/api/v1/generate`): **PASSED**
3. End-to-End Grounded Generation + Pydantic Schema Validation: **PASSED**
4. Python Unit & Type Verification (`pytest`, `mypy`): **PASSED**
