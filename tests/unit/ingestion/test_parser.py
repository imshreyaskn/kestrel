"""
Unit tests for TranscriptParser.
Tests YAML frontmatter extraction, fallback strategies, and body preservation.
"""

import datetime

from backend.app.ingestion.parser import (
    TranscriptParser,
    compute_content_hash,
    extract_video_id,
    parse_date,
)

SAMPLE_VALID_TRANSCRIPT = """---
guest: Adam Fishman
title: How to build a high-performing growth team | Adam Fishman (Patreon, Lyft)
youtube_url: https://www.youtube.com/watch?v=wP8YyWH524A
video_id: wP8YyWH524A
publish_date: 2022-10-13
description: "Adam Fishman has decades of experience building and scaling growth teams."
duration_seconds: 3946.0
keywords:
  - product-market fit
  - growth
  - onboarding
---

# How to build a high-performing growth team

## Transcript

Adam Fishman (00:00:00):
Onboarding is the only part of your product experience that a hundred percent of people touch.
"""


def test_parse_valid_frontmatter():
    parsed = TranscriptParser.parse(
        SAMPLE_VALID_TRANSCRIPT, "episodes/adam-fishman/transcript.md"
    )
    assert (
        parsed.title
        == "How to build a high-performing growth team | Adam Fishman (Patreon, Lyft)"
    )
    assert parsed.guest == "Adam Fishman"
    assert parsed.episode_url == "https://www.youtube.com/watch?v=wP8YyWH524A"
    assert parsed.video_id == "wP8YyWH524A"
    assert parsed.publish_date == datetime.date(2022, 10, 13)
    assert (
        parsed.description
        == "Adam Fishman has decades of experience building and scaling growth teams."
    )
    assert "onboarding" in parsed.keywords
    assert parsed.metadata.get("duration_seconds") == 3946.0
    assert "Adam Fishman (00:00:00):" in parsed.body
    assert "Onboarding is the only part" in parsed.body
    assert not parsed.body.startswith("---")


def test_parse_missing_frontmatter():
    raw_markdown = """# The Secret to Retention

Lenny (00:01:00):
Welcome to the podcast. Today we talk retention.
"""
    parsed = TranscriptParser.parse(
        raw_markdown, "episodes/retention-secret/transcript.md"
    )
    assert parsed.title == "The Secret to Retention"
    assert parsed.guest is None
    assert parsed.episode_url is None
    assert parsed.publish_date is None
    assert "Welcome to the podcast." in parsed.body


def test_parse_malformed_yaml_frontmatter_preserves_body():
    # Intentionally malformed YAML syntax with bad indentations and unescaped colons
    malformed = """---
guest: Elena Verna
title: Unquoted: Special: Characters: That: Break: Yaml
keywords: [bad syntax
---

# Elena on PLG

Elena Verna (00:00:10):
Product-led growth requires intentional viral loops.
"""
    parsed = TranscriptParser.parse(malformed, "episodes/elena-verna/transcript.md")
    assert "Elena on PLG" in parsed.body
    assert "Elena Verna (00:00:10):" in parsed.body
    # Should not crash, and should preserve body
    assert parsed.content_hash is not None


def test_extract_video_id():
    assert (
        extract_video_id("https://www.youtube.com/watch?v=wP8YyWH524A") == "wP8YyWH524A"
    )
    assert extract_video_id("https://youtu.be/wP8YyWH524A?t=10") == "wP8YyWH524A"
    assert extract_video_id("https://example.com/not-youtube") is None
    assert extract_video_id(None) is None


def test_parse_date_formats():
    assert parse_date(datetime.date(2023, 1, 1)) == datetime.date(2023, 1, 1)
    assert parse_date("2024-05-19") == datetime.date(2024, 5, 19)
    assert parse_date("2024/05/19") == datetime.date(2024, 5, 19)
    assert parse_date("May 19, 2024") == datetime.date(2024, 5, 19)
    assert parse_date("invalid-date") is None
    assert parse_date(None) is None


def test_content_hash_deterministic():
    text1 = "Hello\r\nWorld"
    text2 = "Hello\nWorld"
    # Normalized line endings should yield identical SHA-256
    assert compute_content_hash(text1) == compute_content_hash(text2)
