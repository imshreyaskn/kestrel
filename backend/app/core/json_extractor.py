"""
Robust JSON & Structured Output Extractor for LLM Outputs
Handles real-world model variances:
- `<think>...</think>` reasoning tokens (DeepSeek / Qwen reasoning models)
- Markdown code fences (```json ... ``` or ``` ... ```)
- Conversational preambles ("Here is the requested output:") and postambles ("Hope this helps!")
- Balanced outermost bracket extraction for raw JSON embedded in prose
"""

import json
import re
from typing import Any, Dict, Optional, Type, TypeVar
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


class StructuredExtractionError(ValueError):
    """Raised when structured JSON cannot be extracted from LLM text."""
    pass


def clean_llm_text(text: str) -> str:
    """Strip reasoning tokens and normalize whitespace."""
    if not text:
        return ""
    # Strip <think>...</think> blocks (including multi-line)
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    return cleaned.strip()


def find_outermost_json_object(text: str) -> Optional[str]:
    """Find the substring between the first '{' and its matching closing '}'."""
    start_idx = text.find("{")
    if start_idx == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for idx in range(start_idx, len(text)):
        char = text[idx]

        if escape:
            escape = False
            continue

        if char == "\\":
            escape = True
            continue

        if char == '"':
            in_string = not in_string
            continue

        if not in_string:
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start_idx : idx + 1]

    return None


def extract_json_payload(text: str) -> str:
    """
    Extract raw JSON string from LLM output through progressive heuristics:
    1. Markdown ```json ... ``` code fence
    2. Markdown ``` ... ``` code fence
    3. Balanced outermost '{...}' substring
    4. Fallback to cleaned raw text
    """
    cleaned = clean_llm_text(text)
    if not cleaned:
        raise StructuredExtractionError("Empty LLM output; cannot extract JSON.")

    # 1. Check for ```json ... ``` fence
    json_fence_match = re.search(r"```json\s*(.*?)\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if json_fence_match:
        candidate = json_fence_match.group(1).strip()
        if candidate.startswith("{") and candidate.endswith("}"):
            return candidate

    # 2. Check for generic ``` ... ``` fence
    generic_fence_match = re.search(r"```\s*(.*?)\s*```", cleaned, flags=re.DOTALL)
    if generic_fence_match:
        candidate = generic_fence_match.group(1).strip()
        if candidate.startswith("{") and candidate.endswith("}"):
            return candidate

    # 3. Search for outermost balanced { ... }
    outer_obj = find_outermost_json_object(cleaned)
    if outer_obj:
        return outer_obj

    # 4. Fallback to cleaned text directly
    return cleaned


def extract_and_validate(text: str, schema: Type[T]) -> T:
    """
    Extract JSON from LLM text and validate against a Pydantic schema.
    Raises StructuredExtractionError if extraction or validation fails.
    """
    raw_json = extract_json_payload(text)
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        raise StructuredExtractionError(f"Extracted payload is not valid JSON: {e}\nPayload: {raw_json[:200]}") from e

    try:
        return schema.model_validate(data)
    except ValidationError as e:
        raise StructuredExtractionError(f"JSON does not conform to schema {schema.__name__}: {e}") from e
