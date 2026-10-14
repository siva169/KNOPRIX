"""Knoprix Document-Grounded RAG Service.

Combines:
1. Server-side AI document grants enforcement (unauthorized docs are never read).
2. Hybrid retrieval (DSA Inverted Index keyword search + passage chunks).
3. MinHeap top-k passage ranking.
4. Multi-provider streaming adapters (Gemini, OpenAI, Anthropic, Groq, Ollama)
   with BYOK headers kept strictly in request memory.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.request
import urllib.error
from typing import Any, AsyncGenerator, Generator

from ..dsa.minheap import top_k
from .indexer import search_project, tokenize

logger = logging.getLogger(__name__)


def verify_granted_documents(
    db, user_id: str, document_ids: list[str], purpose: str = "all"
) -> list[str]:
    """Return only document IDs that have an active, non-revoked AI grant for the user."""
    if not document_ids:
        return []
    placeholders = ", ".join("?" for _ in document_ids)
    rows = db.execute(
        f"""
        SELECT document_id FROM ai_document_grants
        WHERE user_id = ? AND purpose = ? AND revoked_at IS NULL
          AND document_id IN ({placeholders})
        """,
        [user_id, purpose, *document_ids],
    ).fetchall()
    return [r["document_id"] for r in rows]


def retrieve_hybrid_passages(
    db,
    project_id: str,
    granted_document_ids: list[str],
    query: str,
    top_n: int = 5,
) -> list[dict[str, Any]]:
    """Hybrid retrieval: combines Inverted Index search and chunk-level passage scoring."""
    if not granted_document_ids:
        return []

    words = tokenize(query)
    if not words:
        return []

    granted_set = set(granted_document_ids)

    # 1. Fetch document titles
    doc_placeholders = ", ".join("?" for _ in granted_document_ids)
    doc_rows = db.execute(
        f"SELECT id, file_name FROM documents WHERE id IN ({doc_placeholders})",
        granted_document_ids,
    ).fetchall()
    doc_names = {r["id"]: r["file_name"] for r in doc_rows}

    # 2. Score passages from document_chunks table
    chunk_rows = db.execute(
        f"""
        SELECT id, document_id, page_number, chunk_index, content
        FROM document_chunks
        WHERE document_id IN ({doc_placeholders})
        """,
        granted_document_ids,
    ).fetchall()

    scored_passages: list[tuple[float, dict[str, Any]]] = []
    query_lower = query.lower()

    for r in chunk_rows:
        content_lower = r["content"].lower()
        score = 0.0

        # Term frequency score for query tokens
        for w in words:
            count = content_lower.count(w)
            if count > 0:
                score += count * 2.0

        # Bonus for contiguous phrase matches
        if len(query_lower) > 3 and query_lower in content_lower:
            score += 15.0

        if score > 0:
            scored_passages.append(
                (
                    score,
                    {
                        "chunkId": r["id"],
                        "documentId": r["document_id"],
                        "fileName": doc_names.get(r["document_id"], "Document"),
                        "pageNumber": r["page_number"],
                        "chunkIndex": r["chunk_index"],
                        "content": r["content"][:600],
                        "score": score,
                    },
                )
            )

    # If chunks yielded matches, rank top_n using MinHeap
    if scored_passages:
        ranked = [p for _, p in top_k(scored_passages, top_n)]
        return ranked

    # Fallback to Inverted Index doc snippets if chunks table is empty for these docs
    index_hits = search_project(db, project_id, query, limit=top_n)
    fallback = []
    for h in index_hits:
        if h["documentId"] in granted_set:
            fallback.append({
                "chunkId": f"doc-{h['documentId']}-0",
                "documentId": h["documentId"],
                "fileName": h["fileName"],
                "pageNumber": (h["pages"] or [1])[0],
                "chunkIndex": 0,
                "content": h["snippet"],
                "score": float(h["score"]),
            })
    return fallback[:top_n]


def build_rag_prompt(passages: list[dict[str, Any]], question: str) -> tuple[str, str]:
    """Format system instructions and user message with citation guidelines."""
    system_instruction = (
        "You are Knoprix AI, a document-grounded research assistant. "
        "Answer the user's question using ONLY the provided verified document passages. "
        "Every factual claim MUST cite its source like [Document Name, p. X]. "
        "If the passages do not contain sufficient evidence to answer, state clearly "
        "that the authorized documents do not contain that information."
    )
    context_lines = []
    for p in passages:
        context_lines.append(
            f"--- SOURCE: [{p['fileName']}, p. {p['pageNumber']}] ---\n{p['content']}\n"
        )
    user_prompt = (
        f"Verified Passages:\n\n{''.join(context_lines)}\n\n"
        f"Question: {question.strip()}"
    )
    return system_instruction, user_prompt


def stream_llm_response(
    provider_id: str,
    model: str,
    api_key: str | None,
    system_instruction: str,
    user_prompt: str,
) -> Generator[str, None, None]:
    """Stream response tokens from live provider via standard HTTP streaming."""
    provider_clean = (provider_id or "").lower()

    if not api_key and provider_clean != "ollama":
        yield (
            f"[Live generation paused: No API key provided for '{provider_id}'. "
            "Please pass your key in the X-Provider-Key header to stream live responses. "
            "Showing retrieved citations below.]"
        )
        return

    try:
        if "gemini" in provider_clean:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": f"{system_instruction}\n\n{user_prompt}"}]}]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        data_str = line_str[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            item = json.loads(data_str)
                            candidates = item.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for part in parts:
                                    if "text" in part:
                                        yield part["text"]
                        except json.JSONDecodeError:
                            continue

        elif "anthropic" in provider_clean:
            url = "https://api.anthropic.com/v1/messages"
            payload = {
                "model": model,
                "system": system_instruction,
                "messages": [{"role": "user", "content": user_prompt}],
                "max_tokens": 1024,
                "stream": True,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        data_str = line_str[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            item = json.loads(data_str)
                            if item.get("type") == "content_block_delta":
                                delta = item.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    yield delta.get("text", "")
                        except json.JSONDecodeError:
                            continue

        elif provider_clean == "ollama":
            url = "http://localhost:11434/api/generate"
            payload = {
                "model": model or "llama3",
                "system": system_instruction,
                "prompt": user_prompt,
                "stream": True,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str:
                        try:
                            item = json.loads(line_str)
                            yield item.get("response", "")
                            if item.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue

        else:
            # OpenAI and OpenAI-compatible providers (Groq, OpenRouter)
            if "groq" in provider_clean:
                url = "https://api.groq.com/openai/v1/chat/completions"
            elif "openrouter" in provider_clean:
                url = "https://openrouter.ai/api/v1/chat/completions"
            else:
                url = "https://api.openai.com/v1/chat/completions"

            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": True,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        data_str = line_str[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            item = json.loads(data_str)
                            choices = item.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue

    except urllib.error.HTTPError as err:
        logger.error("Provider HTTP error %s: %s", err.code, err.reason)
        yield f"[Provider error {err.code}: {err.reason}]"
    except Exception as exc:
        logger.error("Provider stream error: %s", exc)
        yield f"[Provider connection error: {exc}]"
