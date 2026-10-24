"""Knoprix Document-Grounded RAG Service.

Combines:
1. Server-side AI document grants enforcement (unauthorized docs are never read).
2. Hybrid retrieval (DSA Inverted Index keyword search + passage chunks).
3. MinHeap top-k passage ranking.
4. Multi-provider adapters (Gemini, OpenAI, Anthropic, Groq, GLM/Z.AI, Ollama)
   that call the correct upstream endpoint for each provider.
5. Key resolution: BYOK header wins, then the server-side configured key.
   Keys are never persisted or returned to the browser.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.request
import urllib.error
from typing import Any, AsyncGenerator, Generator
from urllib.parse import urlsplit

from ..config import cfg
from ..dsa.minheap import top_k
from .indexer import search_project, tokenize

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider endpoint routing
# ---------------------------------------------------------------------------
# Every provider MUST map to its own upstream host. Falling through to a
# generic OpenAI URL would post a provider's key to a third party, so unknown
# providers are rejected rather than guessed.
_OPENAI_COMPATIBLE_URLS = {
    "groq-free": "https://api.groq.com/openai/v1/chat/completions",
    "openrouter-free": "https://openrouter.ai/api/v1/chat/completions",
    "zai-glm-free": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
    "nvidia-nim": "https://integrate.api.nvidia.com/v1/chat/completions",
}
NVIDIA_MODEL_ID = "nvidia/nemotron-3.5-lightning-30b-a3b"
_NATIVE_PROVIDERS = {"gemini-free", "anthropic", "ollama"}
_GEMINI_SEARCH_MODELS = {
    ("gemini-free", "gemini-2.5-flash"),
    ("gemini-free", "gemini-2.5-flash-lite"),
}


class ProviderSearchError(RuntimeError):
    """A provider-native search request failed or returned invalid data."""


def provider_supports_native_search(provider_id: str, model: str) -> bool:
    return ((provider_id or "").strip().lower(), model) in _GEMINI_SEARCH_MODELS


def _safe_web_citation(annotation: dict, offset: int, text: str) -> dict | None:
    url = annotation.get("url")
    if (
        not isinstance(url, str)
        or len(url) > 2048
        or any(ord(char) < 32 for char in url)
    ):
        return None
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return None
        parsed.port
    except ValueError:
        return None
    citation = {
        "sourceType": "web",
        "url": url,
        "title": (
            annotation.get("title", "")[:300]
            if isinstance(annotation.get("title"), str)
            else ""
        ) or parsed.hostname,
    }
    start = annotation.get("start_index")
    end = annotation.get("end_index")
    if (
        isinstance(start, int)
        and not isinstance(start, bool)
        and isinstance(end, int)
        and not isinstance(end, bool)
        and 0 <= start <= end <= len(text.encode("utf-8"))
    ):
        citation["startIndex"] = offset + start
        citation["endIndex"] = offset + end
    return citation


def complete_gemini_search_response(
    model: str,
    api_key: str,
    system_instruction: str,
    user_prompt: str,
) -> tuple[str, list[dict], bool]:
    """Run one Gemini Interaction with optional Google Search grounding."""
    if not provider_supports_native_search("gemini-free", model):
        raise ValueError("Google Search is not enabled for this Gemini model.")
    request_body = {
        "model": model,
        "input": user_prompt,
        "system_instruction": system_instruction,
        "tools": [{"type": "google_search"}],
        "generation_config": {"max_output_tokens": 1024},
        "store": False,
    }
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        logger.error("Gemini Search request failed with HTTP %s", exc.code)
        raise ProviderSearchError(
            f"Gemini Search request failed (HTTP {exc.code})."
        ) from exc
    except urllib.error.URLError as exc:
        logger.error("Gemini Search connection failed")
        raise ProviderSearchError("Gemini Search connection failed.") from exc
    except TimeoutError as exc:
        logger.error("Gemini Search request timed out")
        raise ProviderSearchError("Gemini Search request timed out.") from exc
    except UnicodeDecodeError as exc:
        raise ProviderSearchError("Gemini Search returned invalid text data.") from exc
    except json.JSONDecodeError as exc:
        raise ProviderSearchError("Gemini Search returned invalid JSON.") from exc

    if not isinstance(raw, dict):
        raise ProviderSearchError("Gemini Search returned an invalid response.")
    interaction = raw.get("interaction", raw)
    if not isinstance(interaction, dict) or not isinstance(interaction.get("steps"), list):
        raise ProviderSearchError("Gemini Search returned an invalid response.")
    if interaction.get("status") != "completed":
        raise ProviderSearchError("Gemini Search did not complete successfully.")
    answer_parts = []
    citations = []
    seen_urls = set()
    search_used = False
    for step in interaction.get("steps", []):
        if not isinstance(step, dict):
            raise ProviderSearchError("Gemini Search returned an invalid response.")
        if step.get("type") == "google_search_call":
            search_used = True
        if step.get("type") != "model_output":
            continue
        content = step.get("content")
        if not isinstance(content, list):
            raise ProviderSearchError("Gemini Search returned an invalid response.")
        for block in content:
            if not isinstance(block, dict):
                raise ProviderSearchError("Gemini Search returned an invalid response.")
            if block.get("type") != "text":
                continue
            text = block.get("text")
            if not isinstance(text, str):
                raise ProviderSearchError("Gemini Search returned invalid text output.")
            offset = sum(len(part.encode("utf-8")) for part in answer_parts)
            answer_parts.append(text)
            annotations = block.get("annotations", [])
            if not isinstance(annotations, list):
                raise ProviderSearchError("Gemini Search returned invalid citations.")
            for annotation in annotations:
                if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
                    continue
                citation = _safe_web_citation(annotation, offset, text)
                if citation and citation["url"] not in seen_urls:
                    seen_urls.add(citation["url"])
                    citations.append(citation)
    untrimmed_answer = "".join(answer_parts)
    answer = untrimmed_answer.strip()
    if not answer:
        raise ProviderSearchError("Gemini Search returned an empty answer.")
    leading_text = untrimmed_answer[
        : len(untrimmed_answer) - len(untrimmed_answer.lstrip())
    ]
    leading_bytes = len(leading_text.encode("utf-8"))
    answer_bytes = len(answer.encode("utf-8"))
    for citation in citations:
        if "startIndex" not in citation:
            continue
        start, end = citation["startIndex"], citation["endIndex"]
        if start >= leading_bytes and end <= leading_bytes + answer_bytes:
            citation["startIndex"] = start - leading_bytes
            citation["endIndex"] = end - leading_bytes
        else:
            citation.pop("startIndex")
            citation.pop("endIndex")
    return answer, citations, search_used


def provider_is_supported(provider_id: str) -> bool:
    pid = (provider_id or "").strip().lower()
    return pid in _OPENAI_COMPATIBLE_URLS or pid in _NATIVE_PROVIDERS


def resolve_api_key(provider_id: str, supplied_key: str | None = None) -> str | None:
    """BYOK header wins; otherwise fall back to the server-side configured key."""
    if isinstance(supplied_key, str) and supplied_key.strip():
        return supplied_key.strip()
    return cfg.PROVIDER_API_KEYS.get((provider_id or "").strip().lower()) or None


def provider_has_server_key(provider_id: str) -> bool:
    return bool(cfg.PROVIDER_API_KEYS.get((provider_id or "").strip().lower()))


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
_SUFFIXES = (
    "ing", "ings", "ed", "es", "s", "ly", "ment", "ments", "tion", "tions",
    "ive", "al", "ic", "ness", "able", "ible",
)


def stem(word: str) -> str:
    """Crude but effective suffix stripper.

    Fixes the 'Grounding' vs 'grounded' blind spot: without stemming, a topic
    that is merely a morphological variant of the document's wording scored
    zero and artifact generation failed with 404.
    """
    if len(word) <= 4:
        return word
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def _stem_set(words: list[str]) -> set[str]:
    return {stem(w) for w in words if w}


def _term_counts(haystack: str, stems: set[str]) -> int:
    """Count stem matches in text, allowing simple prefix matching."""
    if not stems:
        return 0
    tokens = tokenize(haystack)
    total = 0
    for token in tokens:
        token_stem = stem(token)
        if token_stem in stems:
            total += 2
            continue
        for candidate in stems:
            # Only match when one side is a solid prefix of the other and the
            # shorter side is long enough to avoid noisy collisions.
            if len(candidate) >= 5 and (
                token_stem.startswith(candidate) or candidate.startswith(token_stem)
            ):
                total += 1
                break
    return total


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
        # tokenize() drops stopwords and short words. A query made entirely of
        # those ("Core Concepts", "the key ideas") would previously return
        # nothing at all, so fall back to raw lowercase words.
        words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z\-']+", query or "")]
        if not words:
            return []

    query_stems = _stem_set(words)
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
    # A passage that matches nothing is still useful evidence, so when the
    # question shares no vocabulary with the corpus we fall back to the
    # leading passages rather than 404-ing the whole feature.
    for r in chunk_rows:
        content_lower = r["content"].lower()
        score = float(_term_counts(content_lower, query_stems))

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
    if fallback:
        return fallback[:top_n]

    # Last resort: the query shared no vocabulary with any chunk and the index
    # is empty. Returning the leading authorized passages is better than
    # 404-ing the whole AI feature — the LLM still receives grounded evidence.
    leading = []
    for r in chunk_rows[:top_n]:
        leading.append({
            "chunkId": r["id"],
            "documentId": r["document_id"],
            "fileName": doc_names.get(r["document_id"], "Document"),
            "pageNumber": r["page_number"],
            "chunkIndex": r["chunk_index"],
            "content": r["content"][:600],
            "score": 0.0,
        })
    return leading


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
    """Stream response tokens from the provider's own endpoint.

    `api_key` is the *resolved* key (BYOK or server-side); see resolve_api_key.
    """
    provider_clean = (provider_id or "").strip().lower()

    if not provider_is_supported(provider_clean):
        yield (
            f"[Unsupported provider '{provider_id}'. "
            "Choose one of the allowlisted providers to continue.]"
        )
        return

    if not api_key and provider_clean != "ollama":
        yield (
            f"[Live generation paused: no API key is configured for '{provider_id}'. "
            "Add one under Provider & BYOK to stream live responses.]"
        )
        return

    try:
        if "gemini" in provider_clean:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
            payload = {
                "contents": [{"parts": [{"text": f"{system_instruction}\n\n{user_prompt}"}]}]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
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
            # OpenAI-compatible providers. Each provider is routed to its own
            # host — never fall through to a shared default, or one provider's
            # key would be posted to another company's API.
            url = _OPENAI_COMPATIBLE_URLS[provider_clean]

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
            stream_timeout = 120 if provider_clean == "nvidia-nim" else 30
            with urllib.request.urlopen(req, timeout=stream_timeout) as resp:
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


# ---------------------------------------------------------------------------
# Non-streaming completion (used by study-artifact generation)
# ---------------------------------------------------------------------------
def complete_llm(
    provider_id: str,
    model: str,
    api_key: str | None,
    system_instruction: str,
    user_prompt: str,
    max_tokens: int = 2048,
) -> str | None:
    """Single-shot completion against the provider's own endpoint.

    Returns the assistant text, or None when the provider is unsupported, has
    no key, or the call fails — callers then fall back to deterministic
    extractive output rather than showing a broken artifact.
    """
    provider_clean = (provider_id or "").strip().lower()
    if not provider_is_supported(provider_clean):
        return None
    if not api_key and provider_clean != "ollama":
        return None

    try:
        if provider_clean == "anthropic":
            url = "https://api.anthropic.com/v1/messages"
            payload = {
                "model": model,
                "system": system_instruction,
                "messages": [{"role": "user", "content": user_prompt}],
                "max_tokens": max_tokens,
            }
            headers = {
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            }
        elif provider_clean == "gemini-free":
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent"
            )
            payload = {
                "contents": [
                    {"parts": [{"text": f"{system_instruction}\n\n{user_prompt}"}]}
                ]
            }
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            }
        elif provider_clean == "ollama":
            url = "http://localhost:11434/api/generate"
            payload = {
                "model": model or "llama3",
                "system": system_instruction,
                "prompt": user_prompt,
                "stream": False,
            }
            headers = {"Content-Type": "application/json"}
        else:
            url = _OPENAI_COMPATIBLE_URLS[provider_clean]
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            }
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = json.loads(resp.read().decode("utf-8"))

        if provider_clean == "anthropic":
            blocks = raw.get("content", [])
            return "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
        if provider_clean == "gemini-free":
            candidates = raw.get("candidates", [])
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts).strip()
        if provider_clean == "ollama":
            return (raw.get("response") or "").strip()
        choices = raw.get("choices", [])
        if not choices:
            return None
        return (choices[0].get("message", {}).get("content") or "").strip()
    except urllib.error.HTTPError as err:
        logger.error("Provider HTTP error %s: %s", err.code, err.reason)
        return None
    except Exception as exc:
        logger.error("Provider completion error: %s", exc)
        return None


def parse_json_block(raw: str | None) -> Any | None:
    """Extract the first JSON object/array from a model response.

    Models wrap JSON in prose or ```json fences often enough that a strict
    json.loads() fails often enough to break the whole artifact feature.
    """
    if not raw:
        return None
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        end = text.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    return None
