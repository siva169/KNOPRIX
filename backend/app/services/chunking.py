"""Semantic chunking service for Knoprix document-grounded RAG.

Splits document pages into passage-level chunks with page-number tracking
and overlap, enabling verifiable citations pointing to specific pages.
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any


def chunk_text(
    text: str,
    page_number: int,
    start_index: int = 0,
    chunk_word_size: int = 250,
    overlap_words: int = 50,
) -> list[dict[str, Any]]:
    """Split page text into chunks of ~chunk_word_size words with overlap."""
    clean_text = re.sub(r"\s+", " ", text or "").strip()
    if not clean_text:
        return []

    words = clean_text.split(" ")
    if len(words) <= chunk_word_size:
        return [
            {
                "page_number": page_number,
                "chunk_index": start_index,
                "content": clean_text,
                "token_count": len(words),
                "metadata": {
                    "page": page_number,
                    "word_count": len(words),
                },
            }
        ]

    chunks = []
    i = 0
    curr_index = start_index
    step = max(1, chunk_word_size - overlap_words)

    while i < len(words):
        chunk_words = words[i : i + chunk_word_size]
        content = " ".join(chunk_words).strip()
        if content:
            chunks.append(
                {
                    "page_number": page_number,
                    "chunk_index": curr_index,
                    "content": content,
                    "token_count": len(chunk_words),
                    "metadata": {
                        "page": page_number,
                        "word_count": len(chunk_words),
                    },
                }
            )
            curr_index += 1
        i += step
        if i >= len(words):
            break

    return chunks


def chunk_document_pages(
    pages: list[str],
    chunk_word_size: int = 250,
    overlap_words: int = 50,
) -> list[dict[str, Any]]:
    """Chunk all pages of a document, tracking sequential chunk_index and page numbers."""
    all_chunks: list[dict[str, Any]] = []
    chunk_idx = 0
    for page_num, page_text in enumerate(pages, start=1):
        page_chunks = chunk_text(
            page_text,
            page_number=page_num,
            start_index=chunk_idx,
            chunk_word_size=chunk_word_size,
            overlap_words=overlap_words,
        )
        all_chunks.extend(page_chunks)
        chunk_idx += len(page_chunks)
    return all_chunks


def store_document_chunks(db, document_id: str, pages: list[str]) -> list[dict[str, Any]]:
    """Generate and persist chunks into document_chunks table."""
    db.execute("DELETE FROM document_chunks WHERE document_id = ?", (document_id,))
    chunks = chunk_document_pages(pages)
    saved_chunks = []
    for c in chunks:
        chunk_id = str(uuid.uuid4())
        meta_json = json.dumps(c["metadata"])
        db.execute(
            """
            INSERT INTO document_chunks (id, document_id, page_number, chunk_index,
                                         content, embedding_json, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chunk_id,
                document_id,
                c["page_number"],
                c["chunk_index"],
                c["content"],
                None,
                meta_json,
            ),
        )
        saved_chunks.append({
            "id": chunk_id,
            "document_id": document_id,
            "page_number": c["page_number"],
            "chunk_index": c["chunk_index"],
            "content": c["content"],
            "token_count": c["token_count"],
            "metadata": c["metadata"],
        })
    return saved_chunks
