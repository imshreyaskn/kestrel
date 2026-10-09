"""
Unit tests for robust JSON extraction from LLM outputs.
Tests real-world model outputs: reasoning tags, code fences, prose preambles, and failure modes.
"""

from typing import List, Optional
import pytest
from pydantic import BaseModel, Field

from backend.app.core.json_extractor import (
    StructuredExtractionError,
    extract_and_validate,
    extract_json_payload,
)


class CitationRef(BaseModel):
    evidence_id: str
    supports: Optional[str] = None


class SampleResearchResponse(BaseModel):
    answer_markdown: str
    citations: List[CitationRef] = Field(default_factory=list)
    insufficient_evidence: bool = False


def test_clean_json_extraction():
    raw = '{"answer_markdown": "Focus on activation first [E1].", "citations": [{"evidence_id": "E1"}], "insufficient_evidence": false}'
    result = extract_and_validate(raw, SampleResearchResponse)
    assert result.answer_markdown == "Focus on activation first [E1]."
    assert len(result.citations) == 1
    assert result.citations[0].evidence_id == "E1"


def test_markdown_code_fence_extraction():
    raw = """
```json
{
  "answer_markdown": "Focus on activation first [E1].",
  "citations": [{"evidence_id": "E1"}],
  "insufficient_evidence": false
}
```
"""
    result = extract_and_validate(raw, SampleResearchResponse)
    assert result.citations[0].evidence_id == "E1"


def test_reasoning_think_tags_and_conversational_preamble():
    raw = """
<think>
The user asked about activation metrics.
I will reference Elena Verna's talk from chunk E1.
Let me structure the JSON output properly.
</think>

Certainly! Here is the research answer:

```json
{
  "answer_markdown": "Activation is the leading indicator of retention [E1].",
  "citations": [{"evidence_id": "E1", "supports": "Elena Verna framework"}],
  "insufficient_evidence": false
}
```

I hope this helps your growth strategy!
"""
    result = extract_and_validate(raw, SampleResearchResponse)
    assert "Activation is the leading indicator" in result.answer_markdown
    assert result.citations[0].supports == "Elena Verna framework"


def test_embedded_json_without_code_fences():
    raw = """
Here is the raw data: {"answer_markdown": "No code fences used here.", "citations": [], "insufficient_evidence": true} - please review.
"""
    result = extract_and_validate(raw, SampleResearchResponse)
    assert result.insufficient_evidence is True
    assert result.answer_markdown == "No code fences used here."


def test_invalid_json_raises_structured_extraction_error():
    raw = "```json\n{ answer_markdown: invalid_json_without_quotes }\n```"
    with pytest.raises(StructuredExtractionError) as exc_info:
        extract_and_validate(raw, SampleResearchResponse)
    assert "not valid JSON" in str(exc_info.value)


def test_missing_required_fields_raises_validation_error():
    raw = '{"citations": []}'  # Missing required answer_markdown
    with pytest.raises(StructuredExtractionError) as exc_info:
        extract_and_validate(raw, SampleResearchResponse)
    assert "does not conform to schema" in str(exc_info.value)


def test_nested_code_fences_with_sql_and_curlys():
    raw = """
```json
{
  "answer_markdown": "To run this query in PostgreSQL:\\n```sql\\nSELECT * FROM experiments WHERE config = '{}';\\n```\\nCheck the metrics dashboard.",
  "citations": [{"evidence_id": "E1"}],
  "insufficient_evidence": false
}
```
"""
    result = extract_and_validate(raw, SampleResearchResponse)
    assert "SELECT * FROM experiments" in result.answer_markdown
    assert result.citations[0].evidence_id == "E1"


def test_multiple_code_blocks_in_conversational_response():
    raw = """
Here is an example bash script:
```bash
curl -X GET http://localhost:8000/api/v1/health
```

And here is the structured result:
```json
{
  "answer_markdown": "All systems operational.",
  "citations": [],
  "insufficient_evidence": false
}
```
"""
    result = extract_and_validate(raw, SampleResearchResponse)
    assert result.answer_markdown == "All systems operational."
    assert result.insufficient_evidence is False
