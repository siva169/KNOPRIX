"""Owner-scoped saved AI response snapshots."""
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from ..database import get_db
from ..security import get_current_user, get_owned_project

router = APIRouter(prefix="/api/ai/favorites", tags=["ai favorites"])


class FavoriteCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    projectId: str | None = None
    question: str = Field(min_length=1, max_length=1000)
    answer: str = Field(min_length=1, max_length=30_000)
    citations: list[dict] = Field(default_factory=list, max_length=50)
    providerId: str = Field(default="", max_length=100)
    modelId: str = Field(default="", max_length=150)


def _decode_citations(value) -> list:
    try:
        citations = json.loads(value or "[]")
    except (TypeError, ValueError):
        return []
    return citations if isinstance(citations, list) else []


def _payload(row) -> dict:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "question": row["question"],
        "answer": row["answer"],
        "citations": _decode_citations(row["citations_json"]),
        "providerId": row["provider_id"],
        "modelId": row["model_id"],
        "createdAt": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    }


@router.get("")
def list_favorites(
    projectId: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    projectId = projectId if isinstance(projectId, str) and projectId else None
    limit = limit if isinstance(limit, int) else 50
    if projectId:
        get_owned_project(db, user["id"], projectId)
    conditions = ["user_id = ?"]
    params = [user["id"]]
    if projectId:
        conditions.append("project_id = ?")
        params.append(projectId)
    rows = db.execute(
        f"SELECT * FROM ai_favorites WHERE {' AND '.join(conditions)} "
        "ORDER BY created_at DESC, id DESC LIMIT ?",
        (*params, limit),
    ).fetchall()
    return {"favorites": [_payload(row) for row in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_favorite(
    body: FavoriteCreateBody,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    if body.projectId:
        get_owned_project(db, user["id"], body.projectId)
    favorite_id = str(uuid.uuid4())
    db.execute(
        """INSERT INTO ai_favorites
           (id, user_id, project_id, question, answer, citations_json, provider_id, model_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            favorite_id,
            user["id"],
            body.projectId,
            body.question.strip(),
            body.answer.strip(),
            json.dumps(body.citations, ensure_ascii=False),
            body.providerId.strip(),
            body.modelId.strip(),
        ),
    )
    row = db.execute(
        "SELECT * FROM ai_favorites WHERE id = ? AND user_id = ?",
        (favorite_id, user["id"]),
    ).fetchone()
    return {"favorite": _payload(row)}


@router.delete("/{favorite_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_favorite(
    favorite_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    deleted = db.execute(
        "DELETE FROM ai_favorites WHERE id = ? AND user_id = ?",
        (favorite_id, user["id"]),
    )
    if deleted.rowcount != 1:
        raise HTTPException(404, "AI favorite not found")
    return None
