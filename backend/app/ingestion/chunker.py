"""
Paragraph-Aware Markdown Chunker
Segments transcript bodies into semantic chunks of ~350-550 tokens with 60-100 token overlap.
Preserves sentence boundaries, exact character offsets, and SHA-256 content hashes.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

# Sentence boundary regex that respects quotes and punctuation
SENTENCE_SPLIT_REGEX = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])")
TOKEN_REGEX = re.compile(r"\w+|[^\w\s]")


@dataclass(frozen=True)
class Chunk:
    """A semantic chunk of a transcript ready for embedding and indexing."""

    chunk_index: int
    content: str
    token_count: int
    char_start: int
    char_end: int
    content_hash: str


def estimate_tokens(text: str) -> int:
    """Estimate token count based on words and punctuation."""
    if not text:
        return 0
    return len(TOKEN_REGEX.findall(text))


@dataclass(frozen=True)
class TextUnit:
    """Atomic text block (sentence or small paragraph) with character offsets."""

    text: str
    char_start: int
    char_end: int
    tokens: int


class TranscriptChunker:
    """
    Paragraph-aware Markdown chunker that merges sentences/paragraphs into
    bounded token chunks with semantic overlap.
    """

    def __init__(
        self,
        target_tokens: int = 450,
        min_tokens: int = 250,
        max_tokens: int = 550,
        overlap_tokens: int = 75,
    ) -> None:
        self.target_tokens = target_tokens
        self.min_tokens = min_tokens
        self.max_tokens = max_tokens
        self.overlap_tokens = overlap_tokens

    def chunk(self, body: str) -> list[Chunk]:
        """
        Split a transcript body into sequential overlapping chunks.

        Args:
            body: Normalized transcript markdown text (without frontmatter).

        Returns:
            List of Chunk objects with 0-indexed chunk_index, token_count,
            char_start, char_end, and content_hash.
        """
        if not body or not body.strip():
            return []

        # 1. Break into atomic units (paragraphs / sentences) with exact offsets
        units = self._extract_units(body)
        if not units:
            return []

        # Total body is smaller than max_tokens: single chunk
        total_tokens = sum(u.tokens for u in units)
        if total_tokens <= self.max_tokens:
            content = body[units[0].char_start : units[-1].char_end].strip()
            return [
                Chunk(
                    chunk_index=0,
                    content=content,
                    token_count=estimate_tokens(content),
                    char_start=units[0].char_start,
                    char_end=units[-1].char_end,
                    content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
                )
            ]

        # 2. Merge units into bounded chunks with overlap
        chunks: list[Chunk] = []
        unit_idx = 0
        total_units = len(units)

        while unit_idx < total_units:
            current_units: list[TextUnit] = []
            accumulated_tokens = 0
            start_unit_idx = unit_idx

            while unit_idx < total_units:
                unit = units[unit_idx]
                next_tokens = accumulated_tokens + unit.tokens

                # If adding this unit exceeds max_tokens and we already have enough tokens
                if (
                    next_tokens > self.max_tokens
                    and accumulated_tokens >= self.min_tokens
                ):
                    break

                current_units.append(unit)
                accumulated_tokens = next_tokens
                unit_idx += 1

                # If we've reached or exceeded target_tokens, check if it's a good place to break
                if accumulated_tokens >= self.target_tokens:
                    break

            if not current_units:
                # Force advance in case a single unit exceeded max_tokens on its own
                current_units.append(units[unit_idx])
                unit_idx += 1

            # Build chunk from current_units
            first_unit = current_units[0]
            last_unit = current_units[-1]
            raw_content = body[first_unit.char_start : last_unit.char_end].strip()
            c_tokens = estimate_tokens(raw_content)
            c_hash = hashlib.sha256(raw_content.encode("utf-8")).hexdigest()

            chunks.append(
                Chunk(
                    chunk_index=len(chunks),
                    content=raw_content,
                    token_count=c_tokens,
                    char_start=first_unit.char_start,
                    char_end=last_unit.char_end,
                    content_hash=c_hash,
                )
            )

            # Check if we reached the end of all units
            if unit_idx >= total_units:
                break

            # 3. Calculate overlap for the next chunk
            overlap_accumulated = 0
            overlap_count = 0
            # Walk backwards through current_units
            for u in reversed(current_units):
                overlap_accumulated += u.tokens
                overlap_count += 1
                if overlap_accumulated >= self.overlap_tokens:
                    break

            # Avoid infinite loop: the next chunk must start strictly after start_unit_idx
            next_start_idx = unit_idx - overlap_count
            if next_start_idx <= start_unit_idx:
                next_start_idx = start_unit_idx + 1

            unit_idx = next_start_idx

        return chunks

    def _extract_units(self, body: str) -> list[TextUnit]:
        """
        Split body into paragraph and sentence-level units with exact character offsets.
        """
        units: list[TextUnit] = []
        # Split on paragraph boundaries (double newlines)
        para_pattern = re.compile(r"\n\s*\n")
        para_spans: list[tuple[int, int]] = []
        last_end = 0

        for match in para_pattern.finditer(body):
            start = last_end
            end = match.start()
            if end > start:
                para_spans.append((start, end))
            last_end = match.end()

        if last_end < len(body):
            para_spans.append((last_end, len(body)))

        for p_start, p_end in para_spans:
            p_text = body[p_start:p_end].strip()
            if not p_text:
                continue

            # Adjust p_start and p_end to trimmed text
            trim_offset_start = body[p_start:p_end].find(p_text)
            actual_start = p_start + trim_offset_start
            actual_end = actual_start + len(p_text)

            p_tokens = estimate_tokens(p_text)

            # If paragraph is within reasonable size, keep as single unit
            if p_tokens <= 180:
                units.append(
                    TextUnit(
                        text=p_text,
                        char_start=actual_start,
                        char_end=actual_end,
                        tokens=p_tokens,
                    )
                )
            else:
                # Break long paragraph into sentences
                sentence_matches = list(SENTENCE_SPLIT_REGEX.finditer(p_text))
                if not sentence_matches:
                    units.append(
                        TextUnit(
                            text=p_text,
                            char_start=actual_start,
                            char_end=actual_end,
                            tokens=p_tokens,
                        )
                    )
                else:
                    s_last = 0
                    for sm in sentence_matches:
                        s_text = p_text[s_last : sm.start()].strip()
                        if s_text:
                            s_start = actual_start + s_last
                            s_end = s_start + len(s_text)
                            units.append(
                                TextUnit(
                                    text=s_text,
                                    char_start=s_start,
                                    char_end=s_end,
                                    tokens=estimate_tokens(s_text),
                                )
                            )
                        s_last = sm.end()

                    if s_last < len(p_text):
                        tail_text = p_text[s_last:].strip()
                        if tail_text:
                            s_start = actual_start + s_last
                            s_end = s_start + len(tail_text)
                            units.append(
                                TextUnit(
                                    text=tail_text,
                                    char_start=s_start,
                                    char_end=s_end,
                                    tokens=estimate_tokens(tail_text),
                                )
                            )

        return units
