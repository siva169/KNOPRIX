"""Document-chat routes — BYOK-first, mocked providers.

Contract (`docs/byok-security-contract.md`):
- Browser holds the key and calls the provider DIRECTLY. The backend NEVER
  accepts, logs, or stores provider keys (fail closed: key-like fields -> 400).
- Only allowlisted FREE providers/models. Client enforcement is decoration;
  the server re-validates every model name.
- Only SELECTED documents are read. Unselected docs never leave the DB.
- No live provider calls exist yet: answers are clearly-labeled MOCKS built
  from the project's own inverted index. Live calls land only after boss
  supplies credentials and authorizes use.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from ..services.indexer import search_project

router = APIRouter(prefix="/api", tags=["chat"])

# Free-only allowlist. Re-verify each endpoint at build/release time —
# free tiers move fast; a stale free endpoint MUST be removed, never kept.
ALLOWLIST = [
    {
        "id": "gemini-free",
        "name": "Google Gemini (free tier)",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "freeNote": "Free quota tier; verify limits at build time.",
        "models": [{"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash"}],
    },
    {
        "id": "groq-free",
        "name": "Groq (free tier)",
        "baseUrl": "https://api.groq.com/openai/v1",
        "freeNote": "Free quota tier; verify limits at build time.",
        "models": [{"id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B"}],
    },
    {
        "id": "openrouter-free",
        "name": "OpenRouter :free models",
        "baseUrl": "https://openrouter.ai/api/v1",
        "freeNote": "Only :free-suffixed models; verify at build time.",
        "models": [{"id": "meta-llama/llama-3.3-70b-instruct:free", "label": "Llama 3.3 70B (free)"}],
    },
    {
        "id": "zai-glm-free",
        "name": "Z.AI GLM (free tier)",
        "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "freeNote": "Free tier; verify limits at build time.",
        "models": [{"id": "glm-4.5-flash", "label": "GLM 4.5 Flash"}],
    },
]

# Any request carrying one of these is holding a provider key -> reject.
# Checked BEFORE any other validation so a key can never slip into logs.
KEY_LIKE_FIELDS = {"apikey", "api_key", "api-key", "token", "accesstoken",
                   "access_token", "secret", "authkey", "auth_key", "bearer"}

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


@router.post("/chat/ask", status_code=status.HTTP_200_OK)
def chat_ask(body: dict, user=Depends(get_current_user), db=Depends(get_db)):
    # Gate 1 — key material must never reach the backend (contract section 4).
    lowered = {str(k).lower() for k in body}
    if lowered & KEY_LIKE_FIELDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Provider keys stay in the browser — never send them here.",
        )

    provider_id = body.get("providerId")
    model = body.get("model")
    document_ids = body.get("documentIds")
    question = body.get("question")

    # Gate 2 — strict shape (manual: Pydantic extra="forbid" would answer 422,
    # but the contract promises 400 for key-like fields, so one code path).
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

    # Gate 3 — allowlist enforced server-side (contract section 6).
    provider = _lookup(provider_id)
    if provider is None:
        raise HTTPException(400, f"Provider '{provider_id}' is not allowlisted.")
    if model not in {m["id"] for m in provider["models"]}:
        raise HTTPException(400, f"Model '{model}' is not allowlisted for '{provider_id}'.")

    # Gate 4 — every selected doc must be owned, all in ONE project
    # (contract: selected-documents scope only).
    docs = [get_owned_document(db, user["id"], did) for did in document_ids]
    project_ids = {d["project_id"] for d in docs}
    if len(project_ids) != 1:
        raise HTTPException(400, "All selected documents must belong to one project.")
    project_id = project_ids.pop()
    get_owned_project(db, user["id"], project_id)
    selected = {d["id"] for d in docs}

    # Mocked answer from the project's OWN index — no provider call exists.
    hits = [h for h in search_project(db, project_id, question.strip(), 6)
            if h["documentId"] in selected][:3]
    citations = [
        {
            "documentId": h["documentId"],
            "fileName": h["fileName"],
            "pageNumber": (h["pages"] or [1])[0],
            "excerpt": h["snippet"],
        }
        for h in hits
    ]
    if citations:
        answer = (
            "[MOCKED answer — no provider was called] "
            f"Top {len(citations)} passage(s) in your {len(docs)} selected "
            f"document(s) related to your question. Wire a free-tier key to "
            f"get a real cited answer."
        )
    else:
        answer = (
            "[MOCKED answer — no provider was called] "
            "No passages in your selected documents matched. Try fewer or "
            "different keywords."
        )
    return {
        "answer": answer,
        "citations": citations,
        "provider": {"id": provider["id"], "name": provider["name"]},
        "model": model,
        "selectedDocuments": len(docs),
        "mocked": True,
    }
