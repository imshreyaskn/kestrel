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
from typing import TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


class StructuredExtractionError(ValueError):
    """Raised when structured JSON cannot be extracted from LLM text."""


def clean_llm_text(text: str) -> str:
    """Strip reasoning tokens and normalize whitespace."""
    if not text:
        return ""
    # Strip <think>...</think> blocks (including multi-line)
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    return cleaned.strip()


def find_outermost_json_object(text: str) -> str | None:
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


def try_repair_unclosed_json(text: str) -> str | None:
    """
    Attempts to repair syntactically unclosed JSON objects caused by model truncation
    or omitted closing delimiters before code fences.
    """
    start_idx = text.find("{")
    if start_idx == -1:
        return None

    in_string = False
    escape = False
    stack: list[str] = []

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
            if char in ("{", "["):
                stack.append("}" if char == "{" else "]")
            elif char in ("}", "]"):
                if stack and stack[-1] == char:
                    stack.pop()

    suffix = ""
    if in_string:
        suffix += '"'
    while stack:
        suffix += stack.pop()

    candidate = text[start_idx:] + suffix
    try:
        json.loads(candidate, strict=False)
        return candidate
    except (json.JSONDecodeError, TypeError):
        return None


def extract_json_payload(text: str) -> str:
    """
    Extract raw JSON string from LLM output through progressive heuristics:
    1. Outermost balanced '{...}' on cleaned text
    2. Greedy outermost code fence (handles nested fences inside JSON string values)
    3. Non-greedy code fences (if multiple code blocks exist)
    4. Auto-closing repair for unclosed JSON objects / truncated fences
    5. Fallback to best unparsed candidate for detailed error reporting
    """
    cleaned = clean_llm_text(text)
    if not cleaned:
        raise StructuredExtractionError("Empty LLM output; cannot extract JSON.")

    candidates: list[str] = []

    # 1. Outermost balanced { ... } on the cleaned text
    outer_obj = find_outermost_json_object(cleaned)
    if outer_obj:
        candidates.append(outer_obj)

    # 2. Greedy outermost code fence (```json ... ``` or ``` ... ```)
    # Handles nested code fences inside JSON string values.
    greedy_fence = re.search(
        r"```(?:json)?\s*\n?(.*)\n?```", cleaned, flags=re.DOTALL | re.IGNORECASE
    )
    if greedy_fence:
        c = greedy_fence.group(1).strip()
        candidates.append(c)
        outer_in_fence = find_outermost_json_object(c)
        if outer_in_fence:
            candidates.append(outer_in_fence)

    # 3. Non-greedy fences (in case multiple separate code blocks exist in text)
    for fence in re.finditer(
        r"```(?:json)?\s*\n?(.*?)\n?```", cleaned, flags=re.DOTALL | re.IGNORECASE
    ):
        c = fence.group(1).strip()
        candidates.append(c)
        outer = find_outermost_json_object(c)
        if outer:
            candidates.append(outer)

    # Return the first candidate that parses as valid JSON
    for cand in candidates:
        try:
            json.loads(cand, strict=False)
            return cand
        except (json.JSONDecodeError, TypeError):
            continue

    # 4. Auto-closing repair for unclosed JSON objects / truncated fences
    for cand in candidates + [cleaned]:
        repaired = try_repair_unclosed_json(cand)
        if repaired:
            return repaired

    # If no candidate parses cleanly, return the best candidate for diagnosis
    if outer_obj:
        return outer_obj
    if greedy_fence:
        return greedy_fence.group(1).strip()
    return cleaned


def extract_and_validate(text: str, schema: type[T]) -> T:
    """
    Extract JSON from LLM text and validate against a Pydantic schema.
    Raises StructuredExtractionError if extraction or validation fails.
    """
    raw_json = extract_json_payload(text)
    try:
        data = json.loads(raw_json, strict=False)
    except json.JSONDecodeError as e:
        raise StructuredExtractionError(
            f"Extracted payload is not valid JSON: {e}\nPayload: {raw_json[:200]}"
        ) from e

    try:
        return schema.model_validate(data)
    except ValidationError as e:
        raise StructuredExtractionError(
            f"JSON does not conform to schema {schema.__name__}: {e}"
        ) from e
