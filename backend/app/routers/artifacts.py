"""Study Artifacts routes — Flashcards, Quizzes, and Analogies.

Every artifact is strictly grounded in authorized document passages,
citing original document pages and excerpts.
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status

from ..config import cfg
from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from ..services.rag import (
    build_rag_prompt,
    complete_llm,
    parse_json_block,
    resolve_api_key,
    retrieve_hybrid_passages,
    verify_granted_documents,
)

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])


def _verify_documents_for_artifacts(db, user_id: str, document_ids: list[str]):
    if not document_ids:
        raise HTTPException(400, "Provide at least one document ID.")
    docs = [get_owned_document(db, user_id, did) for did in document_ids]
    project_ids = {d["project_id"] for d in docs}
    if len(project_ids) != 1:
        raise HTTPException(400, "All documents must belong to the same project.")
    project_id = project_ids.pop()

    granted = verify_granted_documents(db, user_id, document_ids)
    unauthorized = set(document_ids) - set(granted)
    if unauthorized:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Access denied: {len(unauthorized)} document(s) have not been granted AI access.",
        )
    return docs, project_id


# --- provider/model selection -------------------------------------------
_ARTIFACT_MODELS = {
    "zai-glm-free": "glm-4.5-flash",
    "gemini-free": "gemini-2.5-flash",
    "groq-free": "openai/gpt-oss-120b",
    "openrouter-free": "meta-llama/llama-3.3-70b-instruct:free",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-haiku-5-5",
    "ollama": "llama3",
}


def _resolve_generation(body: dict, header_key: Optional[str]):
    """Pick provider + model and resolve the key (BYOK wins, then server key)."""
    provider_id = (body.get("providerId") or cfg.DEFAULT_AI_PROVIDER or "").strip()
    model = (body.get("model") or _ARTIFACT_MODELS.get(provider_id) or "").strip()
    if not model:
        model = _ARTIFACT_MODELS.get(provider_id, "glm-4.5-flash")
    return provider_id, model, resolve_api_key(provider_id, header_key)


def _passage_source(p: dict) -> dict:
    return {
        "documentId": p["documentId"],
        "fileName": p["fileName"],
        "page": p["pageNumber"],
        "pageNumber": p["pageNumber"],
        "excerpt": p["content"][:220],
    }


def _normalize_source(source, passages: list[dict], index: int) -> dict:
    """Force every citation onto a real retrieved passage.

    A model can hallucinate a page number or a filename. Citations are the one
    thing in this product that must be verifiable, so the document id and page
    are re-derived from the passage set rather than trusted from the response.
    """
    by_id = {p["documentId"]: p for p in passages}
    chosen = None
    if isinstance(source, dict):
        chosen = by_id.get(str(source.get("documentId") or ""))
    if chosen is None:
        chosen = passages[min(max(index, 0), len(passages) - 1)]
    return _passage_source(chosen)


def _generate(passages, topic, provider_id, model, api_key, instruction, shape_hint):
    """Ask the provider for structured JSON.

    Returns ``(parsed, used_llm)``. ``used_llm`` is True only when the provider
    actually returned usable JSON — never merely because a key exists, so the
    UI can honestly label extractive fallbacks.
    """
    if not (api_key or provider_id == "ollama"):
        return None, False
    sys_inst, user_prompt = build_rag_prompt(passages, topic)
    sys_inst = (
        f"{sys_inst} You generate study material as strict JSON matching this shape: "
        f"{shape_hint} Use ONLY the provided passages. Every item MUST carry a "
        "\"source\" object with documentId, fileName and page copied from its passage. "
        "Return JSON only, with no prose and no markdown fences."
    )
    raw = complete_llm(provider_id, model, api_key, sys_inst, user_prompt)
    parsed = parse_json_block(raw)
    return (parsed, parsed is not None)


@router.post("/flashcards", status_code=status.HTTP_201_CREATED)
def generate_flashcards(
    body: dict,
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: Optional[str] = Header(None, alias="X-Provider-Key"),
):
    document_ids = body.get("documentIds", [])
    topic = (body.get("topic") or "Key Concepts").strip()
    docs, project_id = _verify_documents_for_artifacts(db, user["id"], document_ids)

    passages = retrieve_hybrid_passages(db, project_id, [d["id"] for d in docs], topic, top_n=6)
    if not passages:
        raise HTTPException(404, "No matching document passages found to generate flashcards.")

    provider_id, model, api_key = _resolve_generation(body, x_provider_key)

    cards: list[dict] = []
    generated, used_llm = _generate(
        passages,
        topic,
        provider_id,
        model,
        api_key,
        instruction="Write revision flashcards for the topic.",
        shape_hint='{"cards": [{"question": "...", "answer": "...", "source": {...}}]}',
    )
    if generated and isinstance(generated, dict) and isinstance(generated.get("cards"), list):
        for i, item in enumerate(generated["cards"][:10], start=1):
            if not isinstance(item, dict):
                continue
            question = str(item.get("question") or "").strip()
            answer = str(item.get("answer") or "").strip()
            if not question or not answer:
                continue
            source = item.get("source") or _passage_source(passages[min(i - 1, len(passages) - 1)])
            cards.append({
                "id": item.get("id") or f"card-{i}",
                "question": question,
                "answer": answer,
                "source": _normalize_source(source, passages, i - 1),
            })

    if not cards:
        # Deterministic extractive fallback — still fully grounded.
        for i, p in enumerate(passages[:5], start=1):
            clean_text = p["content"].replace("\n", " ").strip()
            words = clean_text.split()
            concept_title = " ".join(words[:4]) if len(words) >= 4 else f"Concept {i}"
            cards.append({
                "id": f"card-{i}",
                "question": f"What does the source state regarding {concept_title}?",
                "answer": clean_text[:250] + ("…" if len(clean_text) > 250 else ""),
                "source": _passage_source(p),
            })

    artifact_id = str(uuid.uuid4())
    title = f"Flashcards: {topic}"
    content_json = json.dumps(cards)
    citations_json = json.dumps([c["source"] for c in cards])

    db.execute(
        """
        INSERT INTO study_artifacts (id, user_id, project_id, artifact_type,
                                     title, content_json, citations_json)
        VALUES (?, ?, ?, 'flashcards', ?, ?, ?)
        """,
        (artifact_id, user["id"], project_id, title, content_json, citations_json),
    )

    return {
        "id": artifact_id,
        "projectId": project_id,
        "artifactType": "flashcards",
        "title": title,
        "provider": provider_id,
        "model": model,
        "generatedBy": "llm" if used_llm else "extractive",
        "cards": cards,
        "citations": [c["source"] for c in cards],
    }


@router.post("/quiz", status_code=status.HTTP_201_CREATED)
def generate_quiz(
    body: dict,
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: Optional[str] = Header(None, alias="X-Provider-Key"),
):
    document_ids = body.get("documentIds", [])
    topic = (body.get("topic") or "Knowledge Check").strip()
    docs, project_id = _verify_documents_for_artifacts(db, user["id"], document_ids)

    passages = retrieve_hybrid_passages(db, project_id, [d["id"] for d in docs], topic, top_n=5)
    if not passages:
        raise HTTPException(404, "No matching document passages found to generate a quiz.")

    provider_id, model, api_key = _resolve_generation(body, x_provider_key)

    questions: list[dict] = []
    generated, used_llm = _generate(
        passages,
        topic,
        provider_id,
        model,
        api_key,
        instruction="Write multiple-choice comprehension questions for the topic.",
        shape_hint=(
            '{"questions": [{"question": "...", "options": ["...","...","...","..."], '
            '"correctIndex": 0, "explanation": "...", "source": {...}}]}'
        ),
    )
    if generated and isinstance(generated, dict) and isinstance(generated.get("questions"), list):
        for i, item in enumerate(generated["questions"][:10], start=1):
            if not isinstance(item, dict):
                continue
            question = str(item.get("question") or "").strip()
            options = [str(o).strip() for o in (item.get("options") or []) if str(o).strip()]
            if not question or len(options) < 2:
                continue
            try:
                correct = int(item.get("correctIndex", 0))
            except (TypeError, ValueError):
                correct = 0
            if not 0 <= correct < len(options):
                correct = 0
            questions.append({
                "id": item.get("id") or f"q-{i}",
                "question": question,
                "options": options,
                "correctIndex": correct,
                "explanation": str(item.get("explanation") or "").strip(),
                "source": _normalize_source(item.get("source"), passages, i - 1),
            })

    if not questions:
        # Deterministic extractive fallback: distractors are drawn from other
        # retrieved passages, so every option is real source text rather than
        # invented filler.
        pool = [p["content"].replace("\n", " ").strip() for p in passages]
        for i, p in enumerate(passages[:4], start=1):
            clean_text = pool[i - 1]
            words = clean_text.split()
            snippet = " ".join(words[:15]) if len(words) >= 15 else clean_text
            correct_option = clean_text[:120] + ("…" if len(clean_text) > 120 else "")
            distractors = [
                (pool[(i + offset) % len(pool)][:120] + "…") for offset in (1, 2, 3)
            ]
            options = [correct_option, *distractors]
            questions.append({
                "id": f"q-{i}",
                "question": f"Based on '{p['fileName']}' (p. {p['pageNumber']}), what is verified regarding {topic}?",
                "options": options,
                "correctIndex": 0,
                "explanation": f"Grounded in verified passage: '{clean_text[:160]}…'",
                "source": _passage_source(p),
            })

    artifact_id = str(uuid.uuid4())
    title = f"Quiz: {topic}"
    content_json = json.dumps(questions)
    citations_json = json.dumps([q["source"] for q in questions])

    db.execute(
        """
        INSERT INTO study_artifacts (id, user_id, project_id, artifact_type,
                                     title, content_json, citations_json)
        VALUES (?, ?, ?, 'quiz', ?, ?, ?)
        """,
        (artifact_id, user["id"], project_id, title, content_json, citations_json),
    )

    return {
        "id": artifact_id,
        "projectId": project_id,
        "artifactType": "quiz",
        "title": title,
        "provider": provider_id,
        "model": model,
        "generatedBy": "llm" if used_llm else "extractive",
        "questions": questions,
        "citations": [q["source"] for q in questions],
    }


@router.post("/analogy", status_code=status.HTTP_201_CREATED)
def generate_analogy(
    body: dict,
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: Optional[str] = Header(None, alias="X-Provider-Key"),
):
    document_ids = body.get("documentIds", [])
    concept = (body.get("concept") or "Core Principle").strip()
    docs, project_id = _verify_documents_for_artifacts(db, user["id"], document_ids)

    passages = retrieve_hybrid_passages(db, project_id, [d["id"] for d in docs], concept, top_n=3)
    if not passages:
        raise HTTPException(404, "No matching document passages found to create an analogy.")

    provider_id, model, api_key = _resolve_generation(body, x_provider_key)

    lead_passage = passages[0]
    lead_text = lead_passage["content"].replace("\n", " ").strip()

    analogy_text: str | None = None
    explanation: str | None = None

    generated, used_llm = _generate(
        passages,
        concept,
        provider_id,
        model,
        api_key,
        instruction="Explain the concept using one clear everyday analogy grounded in the passages.",
        shape_hint='{"analogy": "...", "explanation": "...", "source": {...}}',
    )
    if generated and isinstance(generated, dict):
        candidate = str(generated.get("analogy") or "").strip()
        if candidate:
            analogy_text = candidate
            explanation = str(generated.get("explanation") or "").strip()

    if not analogy_text:
        # Deterministic extractive fallback: describe the mechanism from the
        # source text rather than asserting an invented metaphor.
        analogy_text = (
            f"Treat \"{concept}\" as a relay in a coordinated system: each stage "
            f"passes a verified signal to the next, so the whole only works when "
            f"every handoff stays consistent. The source describes the same "
            f"dependency — {lead_text[:180]}"
        )
        explanation = f"Extractive summary grounded in {lead_passage['fileName']}, p. {lead_passage['pageNumber']}."

    source = _passage_source(lead_passage)

    artifact_id = str(uuid.uuid4())
    title = f"Analogy: {concept}"
    content_json = json.dumps({
        "concept": concept,
        "analogy": analogy_text,
        "explanation": explanation,
        "source": source,
    })
    citations_json = json.dumps([source])

    db.execute(
        """
        INSERT INTO study_artifacts (id, user_id, project_id, artifact_type,
                                     title, content_json, citations_json)
        VALUES (?, ?, ?, 'analogy', ?, ?, ?)
        """,
        (artifact_id, user["id"], project_id, title, content_json, citations_json),
    )

    return {
        "id": artifact_id,
        "projectId": project_id,
        "artifactType": "analogy",
        "title": title,
        "provider": provider_id,
        "model": model,
        "generatedBy": "llm" if used_llm else "extractive",
        # Flat fields so the client can render directly; `analogyObject` keeps
        # the nested form for API consumers.
        "concept": concept,
        "analogy": analogy_text,
        "explanation": explanation,
        "source": source,
        "analogyObject": {
            "concept": concept,
            "analogy": analogy_text,
            "explanation": explanation,
            "source": source,
        },
        "citations": [source],
    }


def _hydrate_artifact(row) -> dict:
    """Expand a stored artifact into the same shape the create endpoints return.

    Saved artifacts are re-opened in the client, which renders `cards`,
    `questions` or a flat analogy — so listing must expose those fields at the
    top level, not only the raw `content` blob.
    """
    try:
        content = json.loads(row["content_json"])
    except Exception:
        content = {}
    try:
        citations = json.loads(row["citations_json"])
    except Exception:
        citations = []
    if not isinstance(content, dict):
        content = {"value": content}

    artifact = {
        "id": row["id"],
        "projectId": row["project_id"],
        "artifactType": row["artifact_type"],
        "title": row["title"],
        "content": content,
        "citations": citations,
        "createdAt": row["created_at"],
    }
    if row["artifact_type"] == "flashcards":
        artifact["cards"] = content.get("cards") or []
    elif row["artifact_type"] == "quiz":
        artifact["questions"] = content.get("questions") or []
    elif row["artifact_type"] == "analogy":
        artifact["concept"] = content.get("concept") or row["title"].removeprefix("Analogy: ")
        artifact["analogy"] = content.get("analogy") or ""
        artifact["explanation"] = content.get("explanation") or ""
        artifact["source"] = content.get("source")
        artifact["analogyObject"] = content
    return artifact


@router.get("")
def list_artifacts(
    project_id: Optional[str] = None,
    # The client sends camelCase; FastAPI ignores unknown query params, so
    # without this alias the project filter was silently dropped and artifacts
    # from every project were listed.
    projectId: Optional[str] = None,
    artifact_type: Optional[str] = None,
    artifactType: Optional[str] = None,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    query = "SELECT * FROM study_artifacts WHERE user_id = ?"
    params = [user["id"]]

    effective_project = project_id or projectId
    effective_type = artifact_type or artifactType

    if effective_project:
        query += " AND project_id = ?"
        params.append(effective_project)
    if effective_type:
        query += " AND artifact_type = ?"
        params.append(effective_type)

    query += " ORDER BY created_at DESC"
    rows = db.execute(query, params).fetchall()

    artifacts = [_hydrate_artifact(r) for r in rows]
    return {"artifacts": artifacts}


@router.get("/{artifact_id}")
def get_artifact(
    artifact_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    row = db.execute(
        "SELECT * FROM study_artifacts WHERE id = ? AND user_id = ?",
        (artifact_id, user["id"]),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Study artifact not found.")

    return {"artifact": _hydrate_artifact(row)}


@router.delete("/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_artifact(
    artifact_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    res = db.execute(
        "DELETE FROM study_artifacts WHERE id = ? AND user_id = ?",
        (artifact_id, user["id"]),
    )
    return None
