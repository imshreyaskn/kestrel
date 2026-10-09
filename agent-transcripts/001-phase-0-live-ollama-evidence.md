# Decision & Evidence Log 001: Phase 0 Live Ollama & Vector Verification

**Date:** 9 October 2026  
**Auditor:** Adversarial Verification Gate  
**Status:** ✅ PASSED (Empirical Evidence Verified)  

## 1. Environment & Service Verification
- **Host Ollama Binary:** `C:\Users\Drizz\AppData\Local\Programs\Ollama\ollama.exe`
- **Host Ollama Service:** PID `17912` active on `http://127.0.0.1:11434`
- **Ollama Engine Version:** `0.40.2`

## 2. Models Pulled & Verified
1. **Embedding Model:** `embeddinggemma:latest`
   - Parameter Size: `307.58M`
   - Quantization: `BF16`
   - Context Length: `2048`
   - Stored Embedding Length: `768`
2. **Chat Model:** `qwen2.5:1.5b`
   - Parameter Size: `1.5B`
   - Quantization: `Q4_K_M`
   - Context Length: `32768`
   - Capabilities: `["completion", "tools"]`

## 3. Empirical Test Output (`scripts/test_live_ollama.py`)
```text
=== Running Live Ollama Smoke Test (http://127.0.0.1:11434) ===
Ollama Version: 0.40.2

Testing embeddinggemma vector generation...
Embedding Dimensions: 768 (Duration: 3311.2ms)
Embedding dimension test PASSED (strictly 768).

Testing qwen2.5:1.5b structured chat completion...
Raw Model Output (latency: 5903.2ms):
To determine the relationship between activation and retention, let's analyze the given information:

1. The passage states: "Elena Verna explains that activation rate is the leading indicator for long-term retention."
2. This statement directly establishes a relationship between activation and retention.
3. The relationship is that activation rate is a leading indicator for long-term retention.
4. The evidence provided is directly related to this statement, making it a strong support for the relationship.
5. There is no additional information or context needed to support this relationship.

Based on this analysis, we can conclude that the relationship between activation and retention is that activation rate is a leading indicator for long-term retention.

{"answer_markdown": "# Relationship Between Activation and Retention\nActivation rate is a leading indicator for long-term retention.", "citations": [{"evidence_id": "E1", "supports": "Elena Verna explains that activation rate is the leading indicator for long-term retention."}], "insufficient_evidence": false}

Parsed Structured Output:
{
  "answer_markdown": "# Relationship Between Activation and Retention\nActivation rate is a leading indicator for long-term retention.",
  "citations": [
    {
      "evidence_id": "E1",
      "supports": "Elena Verna explains that activation rate is the leading indicator for long-term retention."
    }
  ],
  "insufficient_evidence": false,
  "follow_up_question": null
}

ALL LIVE TESTS PASSED WITH REAL EVIDENCE!
```

## 4. Key Takeaways & Invariants Established
1. **pgvector Schema Alignment:** `embeddinggemma` outputs strictly 768-dimensional float arrays, perfectly matching `vector(768)` in the database schema.
2. **Real Model Variance Handled:** Compact model `qwen2.5:1.5b` naturally produces conversational reasoning preambles before its JSON payload. Our `backend/app/core/json_extractor.py` correctly extracts and validates the JSON without crashing or requiring artificial prompts.
3. **Citation Provenance:** The model correctly cited `[E1]` and extracted the quote into the citations array.
