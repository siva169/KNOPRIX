"""Bookmark routes backed by an ordered hash-table/list collection."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..database import get_db
from ..dsa.bookmark_collection import BookmarkCollection
from ..security import get_current_user, get_owned_document, get_owned_project

router = APIRouter(prefix="/api", tags=["bookmarks"])


class BookmarkBody(BaseModel):
    projectId: str
    documentId: str
    pageNumber: int = Field(ge=1)
    highlightedText: str = Field(default="", max_length=2000)
    notes: str = Field(default="", max_length=1000)
    colorTag: str = Field(default="yellow", max_length=30)
    bookmarkType: str = Field(default="text", pattern="^(text|page)$")
    tags: list[str] = Field(default_factory=list)


def _load_bookmarks(db, project_id: str, user_id: str) -> BookmarkCollection:
    """Load persisted rows oldest-first, then insert each at the collection head."""
    rows = db.execute(
        """
        SELECT * FROM bookmarks
        WHERE project_id = ? AND user_id = ?
        ORDER BY created_at ASC, id ASC
        """,
        (project_id, user_id),
    ).fetchall()
    return BookmarkCollection([dict(r) for r in rows])


@router.get("/projects/{project_id}/bookmarks")
def list_bookmarks(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    collection = _load_bookmarks(db, project_id, user["id"])
    bookmarks = []
    for b in collection.items_newest_first():
        b["tags"] = json.loads(b.pop("tags_json") or "[]")
        bookmarks.append(b)
    top = bookmarks[0] if bookmarks else None
    return {
        "bookmarks": bookmarks,
        "bookmarkCollection": {
            "size": collection.size(),
            "isEmpty": collection.is_empty(),
            "top": top,
        },
    }


@router.post("/bookmarks", status_code=status.HTTP_201_CREATED)
def create_bookmark(body: BookmarkBody, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], body.projectId)
    get_owned_document(db, user["id"], body.documentId)
    bookmark_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO bookmarks (id, user_id, project_id, document_id, page_number,
                               highlighted_text, notes, color_tag, bookmark_type,
                               tags_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (bookmark_id, user["id"], body.projectId, body.documentId,
         body.pageNumber, body.highlightedText.strip(), body.notes.strip(),
         body.colorTag, body.bookmarkType, json.dumps(body.tags),
         datetime.now(timezone.utc).isoformat(timespec="microseconds")),
    )
    return {"id": bookmark_id}


@router.delete("/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(bookmark_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    row = db.execute(
        "SELECT * FROM bookmarks WHERE id = ? AND user_id = ?",
        (bookmark_id, user["id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Bookmark not found")
    db.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
    return None
