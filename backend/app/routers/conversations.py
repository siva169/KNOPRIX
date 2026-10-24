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
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    user_id = user["id"]
    search_pattern = (
        "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        if search.strip()
        else None
    )
    search_clause = " AND LOWER(title) LIKE LOWER(?) ESCAPE '\\'" if search_pattern else ""
    params = (user_id, search_pattern) if search_pattern else (user_id,)
    total = db.execute(
        "SELECT COUNT(*) AS total FROM conversations WHERE user_id = ?" + search_clause,
        params,
    ).fetchone()["total"]
    rows = db.execute(
        "SELECT * FROM conversations WHERE user_id = ?" + search_clause
        + " ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
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

    conversation_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO conversations (id, user_id, project_id, title)
        VALUES (?, ?, ?, 'New chat')
        """,
        (conversation_id, user["id"], body.projectId),
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
