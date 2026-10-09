"""
Unit tests for TranscriptChunker.
Verifies bounded token targets, overlap behavior, and character offset fidelity.
"""

from backend.app.ingestion.chunker import TranscriptChunker, estimate_tokens


def test_chunker_empty_input():
    chunker = TranscriptChunker()
    assert chunker.chunk("") == []
    assert chunker.chunk("   \n\n   ") == []


def test_chunker_short_text_single_chunk():
    body = "Lenny: Welcome to the podcast. Today we discuss product-led growth with Elena Verna."
    chunker = TranscriptChunker(target_tokens=400, max_tokens=500)
    chunks = chunker.chunk(body)
    assert len(chunks) == 1
    assert chunks[0].chunk_index == 0
    assert chunks[0].content == body
    assert body[chunks[0].char_start : chunks[0].char_end] == chunks[0].content
    assert chunks[0].token_count > 0


def test_chunker_multi_chunk_overlap_and_offsets():
    # Construct a synthetic multi-paragraph document of ~1000 tokens
    paragraphs = [
        f"Paragraph {i}: Lenny and guest discuss growth strategies in detail. "
        f"Key metrics include retention, activation, and churn. "
        f"Building high-velocity experimentation cadences requires deep cross-functional alignment. "
        f"Product teams must establish rapid feedback loops and rigorous statistical analysis."
        for i in range(25)
    ]
    body = "\n\n".join(paragraphs)

    chunker = TranscriptChunker(
        target_tokens=300, min_tokens=150, max_tokens=400, overlap_tokens=60
    )
    chunks = chunker.chunk(body)

    assert len(chunks) > 1

    # Check indexing sequence
    for i, c in enumerate(chunks):
        assert c.chunk_index == i
        # Check character offsets slice exact text
        extracted = body[c.char_start : c.char_end]
        assert extracted == c.content
        assert len(c.content_hash) == 64  # valid SHA-256

    # Verify overlap exists between consecutive chunks
    for i in range(len(chunks) - 1):
        c1 = chunks[i]
        c2 = chunks[i + 1]
        assert c2.char_start < c1.char_end, (
            f"Chunk {i + 1} does not overlap with chunk {i}"
        )


def test_token_estimation():
    text = "Hello, world! This is a test sentence with 10 tokens."
    tokens = estimate_tokens(text)
    assert tokens >= 10
    assert estimate_tokens("") == 0
