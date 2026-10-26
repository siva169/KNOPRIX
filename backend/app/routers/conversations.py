"""Owner-scoped conversation history routes."""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..database import get_db
from ..security import get_current_user, get_owned_project

router = APIRouter(prefix="/api/chat/conversations", tags=["chat"])


class ConversationCreateBody(BaseModel):
    projectId: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)

    class Config:
        extra = "forbid"


class ConversationRenameBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)

    class Config:
        extra = "forbid"


def _conversation_payload(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "projectId": row["project_id"],
        "createdAt": _timestamp(row["created_at"]),
        "updatedAt": _timestamp(row["updated_at"]),
    }


def _timestamp(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return value.replace(" ", "T", 1) + "Z"


def _owned_conversation(db, user_id: str, conversation_id: str):
    row = db.execute(
        "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return row


@router.get("")
def list_conversations(
    search: str = "",
    projectId: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    user_id = user["id"]
    conditions = ["c.user_id = ?"]
    params = [user_id]

    if projectId:
        conditions.append("c.project_id = ?")
        params.append(projectId)

    if search.strip():
        search_pattern = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        conditions.append("""(
            LOWER(c.title) LIKE LOWER(?) ESCAPE '\\'
            OR EXISTS (
                SELECT 1 FROM messages m
                WHERE m.conversation_id = c.id
                  AND LOWER(m.content) LIKE LOWER(?) ESCAPE '\\'
            )
        )""")
        params.extend([search_pattern, search_pattern])

    where_clause = " WHERE " + " AND ".join(conditions)

    count_sql = f"SELECT COUNT(*) AS total FROM conversations c {where_clause}"
    total = db.execute(count_sql, tuple(params)).fetchone()["total"]

    list_sql = f"""
        SELECT c.* FROM conversations c
        {where_clause}
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT ? OFFSET ?
    """
    rows = db.execute(list_sql, (*params, limit, offset)).fetchall()

    return {
        "conversations": [_conversation_payload(row) for row in rows],
        "pagination": {"limit": limit, "offset": offset, "total": total},
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreateBody,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    if body.projectId is not None:
        get_owned_project(db, user["id"], body.projectId)
    title = "New chat" if body.title is None else body.title.strip()
    if not title:
        raise HTTPException(422, "Title must not be blank")

    conversation_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO conversations (id, user_id, project_id, title)
        VALUES (?, ?, ?, ?)
        """,
        (conversation_id, user["id"], body.projectId, title),
    )
    row = db.execute(
        "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user["id"]),
    ).fetchone()
    return {"conversation": _conversation_payload(row)}


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    conversation = _owned_conversation(db, user["id"], conversation_id)
    rows = db.execute(
        """
        SELECT id, sequence, role, content, provider_id, model_id,
               citations_json, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY sequence ASC
        """,
        (conversation_id,),
    ).fetchall()
    messages = []
    for row in rows:
        citations = json.loads(row["citations_json"])
        if not isinstance(citations, list):
            raise RuntimeError("Stored message citations must be a JSON array")
        message = {
            "id": row["id"],
            "sequence": row["sequence"],
            "role": row["role"],
            "content": row["content"],
            "createdAt": _timestamp(row["created_at"]),
            "citations": citations,
        }
        if row["provider_id"] is not None:
            message["providerId"] = row["provider_id"]
        if row["model_id"] is not None:
            message["modelId"] = row["model_id"]
        messages.append(message)
    return {
        "conversation": _conversation_payload(conversation),
        "messages": messages,
    }


@router.patch("/{conversation_id}")
def rename_conversation(
    conversation_id: str,
    body: ConversationRenameBody,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(422, "Title must not be blank")
    db.execute(
        """
        UPDATE conversations
        SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
        """,
        (title, conversation_id, user["id"]),
    )
    row = db.execute(
        "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user["id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return {"conversation": _conversation_payload(row)}


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    row = _owned_conversation(db, user["id"], conversation_id)
    db.execute(
        "DELETE FROM conversations WHERE id = ? AND user_id = ?",
        (row["id"], user["id"]),
    )
    return None
