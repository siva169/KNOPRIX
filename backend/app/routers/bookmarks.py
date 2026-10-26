"""Bookmark routes backed by an ordered hash-table/list collection."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator

from ..annotation_geometry import RegionGeometry
from ..database import get_db
from ..dsa.bookmark_collection import BookmarkCollection
from ..security import get_current_user, get_owned_document, get_owned_project
from .social import revoke_resource_shares

router = APIRouter(prefix="/api", tags=["bookmarks"])


class BookmarkBody(BaseModel):
    projectId: str
    documentId: str
    pageNumber: int = Field(ge=1)
    name: str = Field(default="", max_length=120)
    highlightedText: str = Field(default="", max_length=2000)
    notes: str = Field(default="", max_length=1000)
    colorTag: str = Field(default="yellow", max_length=30)
    bookmarkType: str = Field(default="text", pattern="^(text|page|region)$")
    tags: list[str] = Field(default_factory=list)
    selectionStart: int | None = Field(default=None, ge=0)
    selectionEnd: int | None = Field(default=None, ge=0)
    region: RegionGeometry | None = None

    @model_validator(mode="after")
    def validate_region_type(self):
        if self.bookmarkType == "region":
            if self.region is None:
                raise ValueError("region geometry is required for region bookmarks")
            if self.highlightedText.strip() or self.selectionStart is not None or self.selectionEnd is not None:
                raise ValueError("region bookmarks cannot include text selection data")
        elif self.region is not None:
            raise ValueError("region geometry is only valid for region bookmarks")
        return self


class BookmarkUpdateBody(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    highlightedText: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=1000)
    colorTag: str | None = Field(default=None, max_length=30)
    tags: list[str] | None = None
    highlightId: str | None = Field(default=None, max_length=128)


def _load_bookmarks(
    db, project_id: str, user_id: str, query: str = ""
) -> BookmarkCollection:
    """Load persisted rows oldest-first, then insert each at the collection head."""
    sql = """
        SELECT b.*,
               (SELECT l.highlight_id FROM bookmark_highlight_links l
                WHERE l.bookmark_id = b.id) AS linked_highlight_id
        FROM bookmarks b
        WHERE b.project_id = ? AND b.user_id = ?
    """
    params = [project_id, user_id]
    if query:
        escaped_query = query.replace("!", "!!").replace("%", "!%").replace("_", "!_")
        pattern = f"%{escaped_query}%"
        sql += """
            AND (
                LOWER(name) LIKE LOWER(?) ESCAPE '!'
                OR LOWER(highlighted_text) LIKE LOWER(?) ESCAPE '!'
                OR LOWER(notes) LIKE LOWER(?) ESCAPE '!'
            )
        """
        params.extend((pattern, pattern, pattern))
    sql += " ORDER BY created_at ASC, id ASC"
    rows = db.execute(
        sql,
        tuple(params),
    ).fetchall()
    return BookmarkCollection([dict(r) for r in rows])


@router.get("/projects/{project_id}/bookmarks")
def list_bookmarks(
    project_id: str,
    q: str = Query(default="", max_length=200),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    get_owned_project(db, user["id"], project_id)
    collection = _load_bookmarks(db, project_id, user["id"], q.strip())
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
                               tags_json, created_at, name, anchor_start, anchor_end,
                               region_x, region_y, region_width, region_height)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (bookmark_id, user["id"], body.projectId, body.documentId,
         body.pageNumber, body.highlightedText.strip(), body.notes.strip(),
         body.colorTag, body.bookmarkType, json.dumps(body.tags),
         datetime.now(timezone.utc).isoformat(timespec="microseconds"),
         body.name.strip(), body.selectionStart, body.selectionEnd,
         body.region.x if body.region else None,
         body.region.y if body.region else None,
         body.region.width if body.region else None,
         body.region.height if body.region else None),
    )
    return {"id": bookmark_id}


@router.patch("/bookmarks/{bookmark_id}")
def update_bookmark(
    bookmark_id: str,
    body: BookmarkUpdateBody,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    bookmark = db.execute(
        "SELECT id, document_id, page_number FROM bookmarks WHERE id = ? AND user_id = ?",
        (bookmark_id, user["id"]),
    ).fetchone()
    if bookmark is None:
        raise HTTPException(404, "Bookmark not found")
    updates = body.model_dump(exclude_unset=True)
    link_requested = "highlightId" in updates
    highlight_id = updates.pop("highlightId", None)
    if not updates and not link_requested:
        raise HTTPException(422, "Provide at least one bookmark field to update")
    columns = {
        "name": "name",
        "highlightedText": "highlighted_text",
        "notes": "notes",
        "colorTag": "color_tag",
        "tags": "tags_json",
    }
    assignments = []
    values = []
    for key, value in updates.items():
        if value is None:
            raise HTTPException(422, f"{key} cannot be null")
        assignments.append(f"{columns[key]} = ?")
        values.append(json.dumps(value) if key == "tags" else (value.strip() if isinstance(value, str) else value))
    values.extend((bookmark_id, user["id"]))
    if assignments:
        db.execute(
            f"UPDATE bookmarks SET {', '.join(assignments)} WHERE id = ? AND user_id = ?",
            tuple(values),
        )
    if link_requested:
        if highlight_id is None:
            db.execute(
                "DELETE FROM bookmark_highlight_links "
                "WHERE bookmark_id = ? AND user_id = ?",
                (bookmark_id, user["id"]),
            )
        else:
            highlight = db.execute(
                """SELECT id FROM highlights
                   WHERE id = ? AND user_id = ? AND document_id = ? AND page_number = ?""",
                (
                    highlight_id,
                    user["id"],
                    bookmark["document_id"],
                    bookmark["page_number"],
                ),
            ).fetchone()
            if highlight is None:
                raise HTTPException(422, "Highlight must belong to this user and page")
            other_link = db.execute(
                "SELECT bookmark_id FROM bookmark_highlight_links WHERE highlight_id = ?",
                (highlight_id,),
            ).fetchone()
            if other_link is not None and other_link["bookmark_id"] != bookmark_id:
                raise HTTPException(409, "Highlight is already linked to another bookmark")
            db.execute(
                """INSERT INTO bookmark_highlight_links
                   (bookmark_id, highlight_id, user_id, document_id, page_number)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(bookmark_id) DO UPDATE SET
                     highlight_id = excluded.highlight_id""",
                (
                    bookmark_id,
                    highlight_id,
                    user["id"],
                    bookmark["document_id"],
                    bookmark["page_number"],
                ),
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
    revoke_resource_shares(db, user["id"], "bookmark", bookmark_id)
    db.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
    return None
