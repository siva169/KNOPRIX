"""Document-chat routes — BYOK-first, hybrid RAG, and live streaming.

Contract (`docs/byok-security-contract.md`):
- BYOK keys are passed in request headers ('X-Provider-Key' / 'X-API-Key') and held
  strictly in volatile request memory. The backend NEVER logs or persists provider keys.
- Server-side validation of provider and model allowlist.
- Server-side document grants enforcement: ungranted docs are NEVER retrieved.
- True SSE streaming ('/chat/stream') with citations linking back to original pages.
"""
from __future__ import annotations

import json
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from ..config import cfg
from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from ..services.rag import (
    build_rag_prompt,
    provider_has_server_key,
    resolve_api_key,
    retrieve_hybrid_passages,
    stream_llm_response,
    verify_granted_documents,
    NVIDIA_MODEL_ID,
)

router = APIRouter(prefix="/api", tags=["chat"])

ALLOWLIST = [
    {
        "id": "gemini-free",
        "name": "Google Gemini (free tier)",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "freeNote": "Free quota tier; verify limits at build time.",
        "models": [
            {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash"},
            {"id": "gemini-2.5-flash-lite", "label": "Gemini 2.5 Flash-Lite"},
        ],
    },
    {
        "id": "groq-free",
        "name": "Groq (free tier)",
        "baseUrl": "https://api.groq.com/openai/v1",
        "freeNote": "Free quota tier; verify limits at build time.",
        "models": [
            {"id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B"},
            {"id": "openai/gpt-oss-120b", "label": "GPT-OSS 120B"},
        ],
    },
    {
        "id": "openrouter-free",
        "name": "OpenRouter :free models",
        "baseUrl": "https://openrouter.ai/api/v1",
        "freeNote": "Only :free-suffixed models; verify at build time.",
        "models": [
            {"id": "meta-llama/llama-3.3-70b-instruct:free", "label": "Llama 3.3 70B (free)"}
        ],
    },
    {
        "id": "zai-glm-free",
        "name": "Z.AI GLM (free tier)",
        "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "freeNote": "Free tier; verify limits at build time.",
        "models": [{"id": "glm-4.5-flash", "label": "GLM 4.5 Flash"}],
    },
    {
        "id": "nvidia-nim",
        "name": "NVIDIA NIM (hosted trial)",
        "baseUrl": "https://integrate.api.nvidia.com/v1",
        "freeNote": "Hosted trial; availability and rate limits are set by NVIDIA.",
        "browserAvailable": False,
        "availabilityNote": (
            "Temporarily unavailable in the Knoprix web app: NVIDIA's CORS policy "
            "blocks browser requests from this origin."
        ),
        "models": [
            {
                "id": NVIDIA_MODEL_ID,
                "label": "Nemotron 3.5 Lightning 30B",
            }
        ],
    },
    {
        "id": "openai",
        "name": "OpenAI",
        "baseUrl": "https://api.openai.com/v1",
        "freeNote": "Pay-as-you-go / developer key",
        "models": [
            {"id": "gpt-4o-mini", "label": "GPT-4o Mini"},
            {"id": "gpt-4o", "label": "GPT-4o"},
        ],
    },
    {
        "id": "anthropic",
        "name": "Anthropic Claude",
        "baseUrl": "https://api.anthropic.com/v1",
        "freeNote": "Direct Anthropic API key",
        "models": [
            {"id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5"},
            {"id": "claude-haiku-5-5", "label": "Claude Haiku 5.5"},
        ],
    },
    {
        "id": "ollama",
        "name": "Ollama (Local / Offline)",
        "baseUrl": "http://localhost:11434",
        "freeNote": "Local model, no API key required.",
        "models": [
            {"id": "llama3", "label": "Llama 3"},
            {"id": "mistral", "label": "Mistral"},
            {"id": "phi3", "label": "Phi-3"},
        ],
    },
]

# The provider picker renders `m.name`, so every model descriptor carries both
# `label` and `name`. Serverside-key presence is reported (never the key) so
# the UI can show which providers work without the user pasting anything.
for _provider in ALLOWLIST:
    for _model in _provider["models"]:
        _model.setdefault("name", _model.get("label", _model["id"]))
    _provider["hasServerKey"] = provider_has_server_key(_provider["id"])
# Put the configured default provider first so it is preselected.
ALLOWLIST.sort(key=lambda p: 0 if p["id"] == cfg.DEFAULT_AI_PROVIDER else 1)

KEY_LIKE_FIELDS = {
    "apikey", "api_key", "api-key", "token", "accesstoken",
    "access_token", "secret", "authkey", "auth_key", "bearer"
}

MAX_DOCUMENTS = 10
MAX_QUESTION_CHARS = 1000


def _lookup(provider_id: str):
    for p in ALLOWLIST:
        if p["id"] == provider_id:
            return p
    return None


@router.get("/providers/allowlist")
def providers_allowlist(user=Depends(get_current_user)):
    return {"providers": ALLOWLIST}


def _validate_chat_request(body: dict, user: dict, db):
    # Gate 1 — key material must never be sent in the JSON body
    lowered = {str(k).lower() for k in body}
    if lowered & KEY_LIKE_FIELDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Provider keys stay in the browser or X-Provider-Key header — never send them in the JSON body.",
        )

    provider_id = body.get("providerId")
    model = body.get("model")
    document_ids = body.get("documentIds")
    question = body.get("question")

    # Gate 2 — strict shape
    if not isinstance(provider_id, str) or not provider_id:
        raise HTTPException(400, "'providerId' must be a non-empty string.")
    if not isinstance(model, str) or not model:
        raise HTTPException(400, "'model' must be a non-empty string.")
    if not isinstance(document_ids, list) or not document_ids:
        raise HTTPException(400, "'documentIds' must be a non-empty list.")
    if len(document_ids) > MAX_DOCUMENTS:
        raise HTTPException(400, f"Select at most {MAX_DOCUMENTS} documents.")
    if not isinstance(question, str) or not question.strip():
        raise HTTPException(400, "'question' must be a non-empty string.")
    if len(question) > MAX_QUESTION_CHARS:
        raise HTTPException(400, f"Question exceeds {MAX_QUESTION_CHARS} characters.")

    # Gate 3 — allowlist enforced server-side
    provider = _lookup(provider_id)
    if provider is None:
        raise HTTPException(400, f"Provider '{provider_id}' is not allowlisted.")
    if model not in {m["id"] for m in provider["models"]}:
        raise HTTPException(400, f"Model '{model}' is not allowlisted for '{provider_id}'.")

    # Gate 4 — document ownership and single-project validation
    docs = [get_owned_document(db, user["id"], did) for did in document_ids]
    project_ids = {d["project_id"] for d in docs}
    if len(project_ids) != 1:
        raise HTTPException(400, "All selected documents must belong to one project.")
    project_id = project_ids.pop()
    get_owned_project(db, user["id"], project_id)

    # Gate 5 — Document Grants Enforcement: only granted documents may be retrieved
    granted_ids = verify_granted_documents(db, user["id"], [d["id"] for d in docs])
    unauthorized = set(document_ids) - set(granted_ids)
    if unauthorized:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Access denied: {len(unauthorized)} document(s) have not been authorized for AI processing. Grant access first.",
        )

    return provider, model, docs, project_id, question.strip()


@router.post("/chat/ask", status_code=status.HTTP_200_OK)
def chat_ask(
    body: dict,
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: Optional[str] = Header(None, alias="X-Provider-Key"),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    provider, model, docs, project_id, clean_question = _validate_chat_request(
        body, user, db
    )
    if provider["id"] == "nvidia-nim" and (x_provider_key or x_api_key):
        raise HTTPException(
            400,
            "NVIDIA API keys must be sent directly from the browser to NVIDIA, not to Knoprix.",
        )
    api_key = resolve_api_key(
        provider["id"],
        None if provider["id"] == "nvidia-nim" else (
            x_provider_key if x_provider_key else x_api_key
        ),
    )

    # Hybrid retrieval: chunks + inverted index via MinHeap
    passages = retrieve_hybrid_passages(
        db, project_id, [d["id"] for d in docs], clean_question, top_n=3
    )

    citations = [
        {
            "documentId": p["documentId"],
            "fileName": p["fileName"],
            "pageNumber": p["pageNumber"],
            "chunkIndex": p.get("chunkIndex", 0),
            "excerpt": p["content"],
        }
        for p in passages
    ]

    sys_inst, user_prompt = build_rag_prompt(passages, clean_question)

    if api_key or provider["id"] == "ollama":
        tokens = list(
            stream_llm_response(provider["id"], model, api_key, sys_inst, user_prompt)
        )
        answer = "".join(tokens).strip()
        is_mocked = False
    else:
        if citations:
            answer = (
                f"[Retrieved {len(citations)} verified passage(s) from your authorized documents] "
                "No API key is configured for this provider — add one under "
                "Provider & BYOK to receive a live cited answer."
            )
        else:
            answer = "No passages in your authorized documents matched your question."
        is_mocked = True

    return {
        "answer": answer,
        "citations": citations,
        "provider": {"id": provider["id"], "name": provider["name"]},
        "model": model,
        "selectedDocuments": len(docs),
        "mocked": is_mocked,
    }


@router.post("/chat/stream")
def chat_stream(
    body: dict,
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: Optional[str] = Header(None, alias="X-Provider-Key"),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Real SSE stream: named events carrying token / thought / citation / done.

    The wire format is `event: <name>` + `data: <json>` because the client's
    parser keys off the event name. Previously only bare `data:` lines were
    emitted, so the client matched zero frames and rendered an empty answer.
    """
    provider, model, docs, project_id, clean_question = _validate_chat_request(
        body, user, db
    )
    if provider["id"] == "nvidia-nim":
        raise HTTPException(
            400,
            "NVIDIA requests must be made directly from the browser; use /chat/ask only to retrieve authorized citations.",
        )
    api_key = resolve_api_key(
        provider["id"],
        None if provider["id"] == "nvidia-nim" else (
            x_provider_key if x_provider_key else x_api_key
        ),
    )

    passages = retrieve_hybrid_passages(
        db, project_id, [d["id"] for d in docs], clean_question, top_n=4
    )
    citations = [
        {
            "documentId": p["documentId"],
            "fileName": p["fileName"],
            "pageNumber": p["pageNumber"],
            "chunkIndex": p.get("chunkIndex", 0),
            "excerpt": p["content"],
        }
        for p in passages
    ]
    sys_inst, user_prompt = build_rag_prompt(passages, clean_question)

    def frame(event: str, payload: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(payload)}\n\n"

    async def event_stream():
        yield frame(
            "meta",
            {
                "provider": provider["id"],
                "model": model,
                "documents": len(docs),
                "passages": len(passages),
                "grounded": bool(passages),
                "hasKey": bool(api_key) or provider["id"] == "ollama",
            },
        )
        # Retrieval progress doubles as the client's reasoning indicator.
        yield frame(
            "thought",
            {
                "text": (
                    f"Retrieved {len(passages)} authorized passage(s) from "
                    f"{len({c['documentId'] for c in citations})} document(s)."
                    if passages
                    else "No authorized passages matched this question."
                )
            },
        )
        for token in stream_llm_response(
            provider["id"], model, api_key, sys_inst, user_prompt
        ):
            if token.startswith("[Provider error") or token.startswith("[Provider connection error"):
                yield frame("error", {"detail": token.strip("[]")})
                continue
            if token.startswith("[Live generation paused"):
                yield frame("thought", {"text": token})
                continue
            if token.startswith("[Unsupported provider"):
                yield frame("error", {"detail": token})
                continue
            yield frame("token", {"text": token})
        for citation in citations:
            yield frame("citation", citation)
        yield frame("done", {"citations": citations, "done": True})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
