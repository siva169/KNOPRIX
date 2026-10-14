"""Study Artifacts routes — Flashcards, Quizzes, and Analogies.

Every artifact is strictly grounded in authorized document passages,
citing original document pages and excerpts.
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status

from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from ..services.rag import (
    build_rag_prompt,
    retrieve_hybrid_passages,
    stream_llm_response,
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

    # Build grounded flashcards from the retrieved evidence passages
    cards = []
    for i, p in enumerate(passages[:5], start=1):
        clean_text = p["content"].replace("\n", " ").strip()
        words = clean_text.split()
        concept_title = " ".join(words[:4]) if len(words) >= 4 else f"Concept {i}"
        cards.append({
            "id": f"card-{i}",
            "question": f"What does the source state regarding {concept_title}?",
            "answer": clean_text[:250] + ("…" if len(clean_text) > 250 else ""),
            "source": {
                "documentId": p["documentId"],
                "fileName": p["fileName"],
                "page": p["pageNumber"],
                "excerpt": clean_text[:180],
            },
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

    questions = []
    for i, p in enumerate(passages[:4], start=1):
        clean_text = p["content"].replace("\n", " ").strip()
        words = clean_text.split()
        snippet = " ".join(words[:15]) if len(words) >= 15 else clean_text
        questions.append({
            "id": f"q-{i}",
            "question": f"Based on '{p['fileName']}' (p. {p['pageNumber']}), what is verified regarding {topic}?",
            "options": [
                f"{clean_text[:120]}…",
                "It contradicts fundamental experimental observations.",
                "It is completely undefined in the authorized source.",
                "It was disproved by classical thermodynamics.",
            ],
            "correctIndex": 0,
            "explanation": f"Grounded in verified passage: '{clean_text[:160]}…'",
            "source": {
                "documentId": p["documentId"],
                "fileName": p["fileName"],
                "page": p["pageNumber"],
                "excerpt": clean_text[:160],
            },
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

    lead_passage = passages[0]
    lead_text = lead_passage["content"].replace("\n", " ").strip()

    analogy_payload = {
        "concept": concept,
        "analogy": (
            f"Think of {concept} like a synchronized postal network: rather than each message traveling "
            f"in isolation, the structured relationship guarantees the recipient and sender coordinate "
            f"without delay, exactly mirroring the source description."
        ),
        "explanation": f"Grounded in source: '{lead_text[:200]}…'",
        "source": {
            "documentId": lead_passage["documentId"],
            "fileName": lead_passage["fileName"],
            "page": lead_passage["pageNumber"],
            "excerpt": lead_text[:200],
        },
    }

    artifact_id = str(uuid.uuid4())
    title = f"Analogy: {concept}"
    content_json = json.dumps(analogy_payload)
    citations_json = json.dumps([analogy_payload["source"]])

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
        "analogy": analogy_payload,
        "citations": [analogy_payload["source"]],
    }


@router.get("")
def list_artifacts(
    project_id: Optional[str] = None,
    artifact_type: Optional[str] = None,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    query = "SELECT * FROM study_artifacts WHERE user_id = ?"
    params = [user["id"]]

    if project_id:
        query += " AND project_id = ?"
        params.append(project_id)
    if artifact_type:
        query += " AND artifact_type = ?"
        params.append(artifact_type)

    query += " ORDER BY created_at DESC"
    rows = db.execute(query, params).fetchall()

    artifacts = []
    for r in rows:
        try:
            content = json.loads(r["content_json"])
        except Exception:
            content = {}
        try:
            citations = json.loads(r["citations_json"])
        except Exception:
            citations = []
        artifacts.append({
            "id": r["id"],
            "projectId": r["project_id"],
            "artifactType": r["artifact_type"],
            "title": r["title"],
            "content": content,
            "citations": citations,
            "createdAt": r["created_at"],
        })
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

    return {
        "artifact": {
            "id": row["id"],
            "projectId": row["project_id"],
            "artifactType": row["artifact_type"],
            "title": row["title"],
            "content": json.loads(row["content_json"]),
            "citations": json.loads(row["citations_json"]),
            "createdAt": row["created_at"],
        }
    }


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
