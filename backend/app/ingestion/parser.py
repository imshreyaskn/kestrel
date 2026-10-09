"""
Robust Markdown Transcript Parser
Extracts YAML frontmatter, canonical episode metadata, and clean transcript body.
Gracefully handles absent or malformed frontmatter without dropping body content.
"""

from __future__ import annotations

import datetime
import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Any

import yaml

logger = logging.getLogger(__name__)

# Regex patterns for fallback metadata extraction
FRONTMATTER_PATTERN = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
H1_TITLE_PATTERN = re.compile(r"^#\s+(.+)$", re.MULTILINE)
YOUTUBE_ID_PATTERN = re.compile(
    r"(?:v=|\/embed\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})"
)
GUEST_FROM_TITLE_PATTERN = re.compile(
    r"(?:\|\s*|with\s+)([A-Z][a-zA-Z\s\.\-']+?)(?:\s*\(|$)", re.IGNORECASE
)


@dataclass(frozen=True)
class ParsedTranscript:
    """Canonical representation of a parsed transcript file."""

    title: str
    guest: str | None
    episode_url: str | None
    video_id: str | None
    publish_date: datetime.date | None
    description: str | None
    keywords: list[str]
    metadata: dict[str, Any]
    body: str
    content_hash: str
    raw_frontmatter: str | None = None


def parse_date(value: Any) -> datetime.date | None:
    """Robustly parse a date value from various representations."""
    if value is None:
        return None
    if isinstance(value, datetime.date):
        return value
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, str):
        value_str = value.strip()
        # Try standard ISO YYYY-MM-DD
        try:
            return datetime.date.fromisoformat(value_str[:10])
        except ValueError:
            pass
        # Try other common formats
        for fmt in ("%Y/%m/%d", "%m/%d/%Y", "%d-%m-%Y", "%B %d, %Y"):
            try:
                return (
                    datetime.datetime.strptime(value_str, fmt)
                    .replace(tzinfo=datetime.UTC)
                    .date()
                )
            except ValueError:
                continue

    return None


def extract_video_id(url: str | None) -> str | None:
    """Extract YouTube video ID from standard watch/embed URLs."""
    if not url:
        return None
    match = YOUTUBE_ID_PATTERN.search(url)
    if match:
        return match.group(1)
    return None


def compute_content_hash(text: str) -> str:
    """Compute SHA-256 hash of normalized text."""
    normalized = text.strip().replace("\r\n", "\n")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class TranscriptParser:
    """Parser for podcast transcripts formatted as Markdown with YAML frontmatter."""

    @classmethod
    def parse(cls, content: str, source_path: str = "") -> ParsedTranscript:
        """
        Parse raw markdown file content into structured episode metadata and body.

        Guarantees:
        - Never throws unhandled exceptions on invalid YAML; logs and falls back.
        - Preserves all body text.
        - Normalizes line endings to UNIX '\n'.
        """
        normalized_content = content.replace("\r\n", "\n")
        content_hash = compute_content_hash(normalized_content)

        frontmatter_data: dict[str, Any] = {}
        raw_frontmatter: str | None = None
        body: str = normalized_content

        # 1. Match and extract frontmatter block
        fm_match = FRONTMATTER_PATTERN.match(normalized_content)
        if fm_match:
            raw_frontmatter = fm_match.group(1)
            body = normalized_content[fm_match.end() :]
            try:
                parsed_yaml = yaml.safe_load(raw_frontmatter)
                if isinstance(parsed_yaml, dict):
                    frontmatter_data = parsed_yaml
                else:
                    logger.warning(
                        "Frontmatter in %s parsed as non-dict: %s",
                        source_path,
                        type(parsed_yaml),
                    )
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "Failed to parse YAML frontmatter in %s: %s. Preserving body.",
                    source_path,
                    str(e),
                )

                # Fallback: attempt simple line-by-line key: value extraction
                frontmatter_data = cls._fallback_parse_frontmatter(raw_frontmatter)

        # 2. Extract Title
        title = ""
        if "title" in frontmatter_data and isinstance(frontmatter_data["title"], str):
            title = frontmatter_data["title"].strip()

        if not title:
            # Fall back to first H1 Markdown heading
            h1_match = H1_TITLE_PATTERN.search(body)
            if h1_match:
                title = h1_match.group(1).strip()
            elif source_path:
                # Fall back to filename slug or directory name
                parts = source_path.replace("\\", "/").rstrip("/").split("/")
                title = parts[-1].replace(".md", "").replace("-", " ").title()
            else:
                title = "Untitled Episode"

        # 3. Extract Guest
        guest: str | None = None
        if frontmatter_data.get("guest"):
            guest = str(frontmatter_data["guest"]).strip()
        else:
            # Try to infer guest from title (e.g., "... | Adam Fishman (...")
            guest_match = GUEST_FROM_TITLE_PATTERN.search(title)
            if guest_match:
                guest = guest_match.group(1).strip()

        # 4. Extract Episode URL & Video ID
        episode_url: str | None = None
        if frontmatter_data.get("youtube_url"):
            episode_url = str(frontmatter_data["youtube_url"]).strip()
        elif frontmatter_data.get("url"):
            episode_url = str(frontmatter_data["url"]).strip()

        video_id: str | None = None
        if frontmatter_data.get("video_id"):
            video_id = str(frontmatter_data["video_id"]).strip()
        elif episode_url:
            video_id = extract_video_id(episode_url)

        # 5. Extract Publish Date
        publish_date = parse_date(frontmatter_data.get("publish_date"))

        # 6. Extract Description
        description: str | None = None
        if frontmatter_data.get("description"):
            description = str(frontmatter_data["description"]).strip()

        # 7. Extract Keywords
        keywords: list[str] = []
        raw_keywords = frontmatter_data.get("keywords")
        if isinstance(raw_keywords, list):
            keywords = [
                str(k).strip() for k in raw_keywords if k is not None and str(k).strip()
            ]
        elif isinstance(raw_keywords, str):
            keywords = [k.strip() for k in raw_keywords.split(",") if k.strip()]

        # 8. Clean and normalize body text
        cleaned_body = cls._clean_body(body)

        # Store any additional fields in metadata
        reserved_keys = {
            "title",
            "guest",
            "youtube_url",
            "url",
            "video_id",
            "publish_date",
            "description",
            "keywords",
        }
        extra_metadata = {
            k: v for k, v in frontmatter_data.items() if k not in reserved_keys
        }

        return ParsedTranscript(
            title=title,
            guest=guest,
            episode_url=episode_url,
            video_id=video_id,
            publish_date=publish_date,
            description=description,
            keywords=keywords,
            metadata=extra_metadata,
            body=cleaned_body,
            content_hash=content_hash,
            raw_frontmatter=raw_frontmatter,
        )

    @classmethod
    def _fallback_parse_frontmatter(cls, raw: str) -> dict[str, Any]:
        """Extract basic key-value pairs if PyYAML fails on invalid syntax."""
        data: dict[str, Any] = {}
        for line in raw.split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                key, val = line.split(":", 1)
                k = key.strip()
                v = val.strip().strip("'\"")
                if k and v:
                    data[k] = v
        return data

    @classmethod
    def _clean_body(cls, body: str) -> str:
        """
        Normalize body text:
        - Strip extraneous leading/trailing whitespace
        - Standardize multiple blank lines to at most 2 newlines (standard Markdown paragraph break)
        - Preserve speaker timestamps and quotes verbatim
        """
        lines = [line.rstrip() for line in body.split("\n")]
        text = "\n".join(lines).strip()
        # Collapse 3 or more newlines into 2
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text
