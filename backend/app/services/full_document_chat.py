"""Provider adapters for explicitly authorized, full-document chat."""
from __future__ import annotations

import base64
import json
import logging
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterator

from pypdf import PdfReader

from ..config import UPLOAD_DIR
from . import document_ai, document_io, rag

logger = logging.getLogger(__name__)
_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
_ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
_GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
)
_NVIDIA_COMPLETIONS_URL = (
    "https://integrate.api.nvidia.com/v1/chat/completions"
)
_NVIDIA_PAGES_PER_BATCH = 4


def _stream_json_events(
    url: str, payload: dict, headers: dict[str, str], provider: str
) -> Iterator[dict]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                value = line[5:].strip()
                if not value or value == "[DONE]":
                    continue
                try:
                    event = json.loads(value)
                except json.JSONDecodeError:
                    continue
                if isinstance(event, dict):
                    yield event
    except urllib.error.HTTPError as exc:
        logger.warning("%s full-document request failed with HTTP %s", provider, exc.code)
        raise document_ai.ProviderFileError(
            f"{provider} could not process the authorized documents (HTTP {exc.code}).",
            502,
        ) from exc
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        raise document_ai.ProviderFileError(
            f"Could not reach {provider} for full-document chat.", 502
        ) from exc


def _stream_openai(
    api_key: str, model: str, system: str, question: str, files: list[dict]
) -> Iterator[str]:
    content = [
        {"type": "input_text", "text": question},
        *[
            {"type": "input_file", "file_id": part["provider_file_id"], "detail": "high"}
            for part in files
        ],
    ]
    payload = {
        "model": model,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": system}]},
            {"role": "user", "content": content},
        ],
        "stream": True,
    }
    emitted = False
    for event in _stream_json_events(
        _OPENAI_RESPONSES_URL,
        payload,
        {"Authorization": f"Bearer {api_key}"},
        "OpenAI",
    ):
        if event.get("type") == "response.output_text.delta":
            text = event.get("delta")
            if isinstance(text, str) and text:
                emitted = True
                yield text
    if not emitted:
        raise document_ai.ProviderFileError("OpenAI returned no answer.", 502)


def _stream_anthropic(
    api_key: str, model: str, system: str, question: str, files: list[dict]
) -> Iterator[str]:
    content = [{"type": "text", "text": question}]
    content.extend(
        {
            "type": "document",
            "source": {"type": "file", "file_id": part["provider_file_id"]},
        }
        for part in files
    )
    payload = {
        "model": model,
        "system": system,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 4096,
        "stream": True,
    }
    emitted = False
    for event in _stream_json_events(
        _ANTHROPIC_MESSAGES_URL,
        payload,
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "files-api-2025-04-14",
        },
        "Anthropic",
    ):
        if event.get("type") == "content_block_delta":
            delta = event.get("delta", {})
            text = delta.get("text") if isinstance(delta, dict) else None
            if isinstance(text, str) and text:
                emitted = True
                yield text
    if not emitted:
        raise document_ai.ProviderFileError("Anthropic returned no answer.", 502)


def _stream_gemini(
    api_key: str, model: str, system: str, question: str, files: list[dict]
) -> Iterator[str]:
    parts = [{"text": f"Question: {question}"}]
    parts.extend(
        {
            "fileData": {
                "mimeType": "application/pdf",
                "fileUri": part["provider_file_uri"],
            }
        }
        for part in files
    )
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
    }
    emitted = False
    for event in _stream_json_events(
        _GEMINI_GENERATE_URL.format(model=model),
        payload,
        {"x-goog-api-key": api_key},
        "Gemini",
    ):
        candidates = event.get("candidates", [])
        if not candidates or not isinstance(candidates[0], dict):
            continue
        response_parts = candidates[0].get("content", {}).get("parts", [])
        for part in response_parts:
            text = part.get("text") if isinstance(part, dict) else None
            if isinstance(text, str) and text:
                emitted = True
                yield text
    if not emitted:
        raise document_ai.ProviderFileError("Gemini returned no answer.", 502)


def _render_nvidia_batch(
    pdf_path: Path, page_start: int, page_end: int, output_dir: Path
) -> list[Path]:
    prefix = output_dir / "page"
    try:
        result = subprocess.run(
            [
                "pdftoppm",
                "-f",
                str(page_start),
                "-l",
                str(page_end),
                "-r",
                "100",
                "-jpeg",
                "-jpegopt",
                "quality=75",
                str(pdf_path),
                str(prefix),
            ],
            capture_output=True,
            timeout=120,
            check=False,
        )
    except FileNotFoundError as exc:
        raise document_ai.ProviderFileError(
            "NVIDIA visual processing is unavailable on this server.", 503
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise document_ai.ProviderFileError(
            "Rendering document pages exceeded the server time limit.", 422
        ) from exc
    images = sorted(
        output_dir.glob("page-*.jpg"),
        key=lambda path: int(path.stem.rsplit("-", 1)[-1]),
    )
    if result.returncode != 0 or len(images) != page_end - page_start + 1:
        raise document_ai.ProviderFileError(
            "Could not render every authorized page for NVIDIA visual chat.", 422
        )
    return images


def _stream_nvidia_batch(
    api_key: str,
    model: str,
    system: str,
    question: str,
    file_name: str,
    page_start: int,
    images: list[Path],
) -> Iterator[str]:
    content = [
        {
            "type": "text",
            "text": (
                f"{system}\n\nInspect pages {page_start}-{page_start + len(images) - 1} "
                f"of {file_name}. For the user's question, record only relevant "
                "facts and evidence, preserving exact values and page numbers. "
                "Do not answer beyond this batch."
            ),
        }
    ]
    for offset, image in enumerate(images):
        encoded = base64.b64encode(image.read_bytes()).decode("ascii")
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
            }
        )
        content[0]["text"] += (
            f" Image {offset + 1} is page {page_start + offset}."
        )
    content[0]["text"] += f"\nQuestion: {question}"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 2048,
        "temperature": 0.1,
        "stream": True,
    }
    emitted = False
    for event in _stream_json_events(
        _NVIDIA_COMPLETIONS_URL,
        payload,
        {"Authorization": f"Bearer {api_key}"},
        "NVIDIA",
    ):
        choices = event.get("choices", [])
        if not choices or not isinstance(choices[0], dict):
            continue
        delta = choices[0].get("delta", {})
        text = delta.get("content") if isinstance(delta, dict) else None
        if isinstance(text, str) and text:
            emitted = True
            yield text
    if not emitted:
        raise document_ai.ProviderFileError(
            f"NVIDIA returned no analysis for pages {page_start}-"
            f"{page_start + len(images) - 1}.",
            502,
        )


def _stream_nvidia(
    api_key: str,
    model: str,
    system: str,
    question: str,
    documents: list[dict],
) -> Iterator[tuple[str, dict]]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    temporary_sources = []
    try:
        with tempfile.TemporaryDirectory(
            prefix="knoprix-nvidia-chat-", dir=UPLOAD_DIR
        ) as temp_name:
            work_dir = Path(temp_name)
            batches = []
            for document in documents:
                source_path, source_temporary = document_io.materialize_document(document)
                if source_temporary:
                    temporary_sources.append(source_path)
                pdf_path = document_ai.prepare_pdf(
                    source_path,
                    str(document["file_type"]),
                    work_dir / f"convert-{document['id']}",
                )
                page_count = len(PdfReader(str(pdf_path), strict=True).pages)
                for first in range(1, page_count + 1, _NVIDIA_PAGES_PER_BATCH):
                    batches.append(
                        (
                            document,
                            pdf_path,
                            first,
                            min(first + _NVIDIA_PAGES_PER_BATCH - 1, page_count),
                        )
                    )

            notes = []
            total = len(batches)
            yield "progress", {
                "stage": "pages",
                "current": 0,
                "total": total,
                "detail": "Preparing visual page batches for NVIDIA.",
            }
            for current, (document, pdf_path, first, last) in enumerate(batches, 1):
                batch_dir = work_dir / f"batch-{current}"
                batch_dir.mkdir()
                images = _render_nvidia_batch(pdf_path, first, last, batch_dir)
                try:
                    note = "".join(
                        _stream_nvidia_batch(
                            api_key,
                            model,
                            system,
                            question,
                            document["file_name"],
                            first,
                            images,
                        )
                    )
                finally:
                    for image in images:
                        image.unlink(missing_ok=True)
                notes.append(
                    f"[{document['file_name']}, pages {first}-{last}]\n{note}"
                )
                yield "progress", {
                    "stage": "pages",
                    "current": current,
                    "total": total,
                    "detail": (
                        f"Reviewed {document['file_name']} pages {first}-{last}."
                    ),
                }

            yield "thought", {
                "text": f"Combining evidence from {total} visual page batch(es)."
            }
            final_prompt = (
                "Answer the user's question using only the page-batch evidence below. "
                "Retain each source filename and page reference for factual claims. "
                "Point out uncertainty or missing evidence; do not invent details.\n\n"
                f"Question: {question}\n\nPage-batch evidence:\n"
                + "\n\n".join(notes)
            )
            for token in rag.stream_llm_response(
                "nvidia-nim", model, api_key, system, final_prompt
            ):
                yield "token", {"text": token}
            yield "progress", {
                "stage": "complete",
                "current": total,
                "total": total,
                "detail": "All selected pages were processed.",
            }
    finally:
        for source_path in temporary_sources:
            source_path.unlink(missing_ok=True)


def stream_full_document_response(
    provider_id: str,
    model: str,
    api_key: str,
    system: str,
    question: str,
    documents: list[dict],
    provider_files: dict[str, list[dict]],
) -> Iterator[tuple[str, dict]]:
    """Stream full visual-document answers; never use retrieval as a fallback."""
    if provider_id == "nvidia-nim":
        yield from _stream_nvidia(api_key, model, system, question, documents)
        return

    files = [
        {**part, "file_name": document["file_name"]}
        for document in documents
        for part in provider_files[document["id"]]
    ]
    labels = "\n".join(
        f"- {document['file_name']}: pages "
        f"{provider_files[document['id']][0]['page_start']}-"
        f"{provider_files[document['id']][-1]['page_end']}"
        for document in documents
    )
    question = f"Selected source documents:\n{labels}\n\nQuestion: {question}"
    yield "progress", {
        "stage": "provider",
        "current": 0,
        "total": 1,
        "detail": "Sending the authorized document files to the selected model.",
    }
    if provider_id == "openai":
        tokens = _stream_openai(api_key, model, system, question, files)
    elif provider_id == "anthropic":
        tokens = _stream_anthropic(api_key, model, system, question, files)
    elif provider_id == "gemini-free":
        tokens = _stream_gemini(api_key, model, system, question, files)
    else:
        raise document_ai.ProviderFileError(
            "This provider does not support full-document chat.", 400
        )
    for token in tokens:
        yield "token", {"text": token}
    yield "progress", {
        "stage": "complete",
        "current": 1,
        "total": 1,
        "detail": "The authorized documents were processed.",
    }
