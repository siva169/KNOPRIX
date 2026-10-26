"""Highlight routes — saved color markers on document text.

A SEPARATE feature from bookmarks: highlighting a passage just paints a
colored marker on the text (like a real highlighter in a book) so the user
can give it attention when they come back to read the document. Highlights
never touch the bookmark collection.

- Saving a highlight          → INSERT a row (color marker)
- Deleting a highlight        → remove the marker
- Listing highlights          → all markers for a document (per user)
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator

from ..annotation_geometry import RegionGeometry
from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from .social import revoke_resource_shares

router = APIRouter(prefix="/api", tags=["highlights"])

# Marker palette — must stay in sync with frontend/src/highlights.js
VALID_COLORS = {"yellow", "green", "blue", "pink", "orange", "purple"}


class HighlightBody(BaseModel):
    projectId: str
    documentId: str
    pageNumber: int = Field(ge=1)
    text: str = Field(default="", max_length=2000)
    color: str = Field(default="yellow", max_length=20)
    matchAll: bool = Field(default=False)  # paint every occurrence, not just the first
    selectionStart: int | None = Field(default=None, ge=0)
    selectionEnd: int | None = Field(default=None, ge=0)
    highlightType: str = Field(default="text", pattern="^(text|region)$")
    region: RegionGeometry | None = None

    @model_validator(mode="after")
    def validate_region_type(self):
        if self.highlightType == "region":
            if self.region is None:
                raise ValueError("region geometry is required for region highlights")
            if self.text.strip() or self.matchAll or self.selectionStart is not None or self.selectionEnd is not None:
                raise ValueError("region highlights cannot include text selection data")
        elif self.region is not None:
            raise ValueError("region geometry is only valid for region highlights")
        elif not self.text.strip():
            raise ValueError("text highlights require selected text")
        return self


class HighlightColorBody(BaseModel):
    color: str = Field(max_length=20)


@router.get("/documents/{document_id}/highlights")
def list_highlights(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_document(db, user["id"], document_id)
    rows = db.execute(
        """
        SELECT * FROM highlights
        WHERE document_id = ? AND user_id = ?
        ORDER BY created_at ASC, id ASC
        """,
        (document_id, user["id"]),
    ).fetchall()
    return {"documentId": document_id, "highlights": [dict(r) for r in rows]}


@router.post("/highlights", status_code=status.HTTP_201_CREATED)
def create_highlight(body: HighlightBody, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], body.projectId)
    get_owned_document(db, user["id"], body.documentId)
    if body.color not in VALID_COLORS:
        raise HTTPException(422, f"Invalid color. Allowed: {sorted(VALID_COLORS)}")
    if (body.selectionStart is None) != (body.selectionEnd is None):
        raise HTTPException(422, "selectionStart and selectionEnd must be supplied together")
    if (
        body.selectionStart is not None
        and body.selectionEnd is not None
        and body.selectionEnd <= body.selectionStart
    ):
        raise HTTPException(422, "selectionEnd must be greater than selectionStart")
    highlight_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO highlights (id, user_id, project_id, document_id, page_number,
                                text, color, match_all, anchor_start, anchor_end,
                                highlight_type, region_x, region_y, region_width, region_height)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (highlight_id, user["id"], body.projectId, body.documentId,
         body.pageNumber, body.text.strip(), body.color, 1 if body.matchAll else 0,
         body.selectionStart, body.selectionEnd, body.highlightType,
         body.region.x if body.region else None,
         body.region.y if body.region else None,
         body.region.width if body.region else None,
         body.region.height if body.region else None),
    )
    return {"id": highlight_id}


@router.patch("/highlights/{highlight_id}")
def update_highlight_color(
    highlight_id: str,
    body: HighlightColorBody,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    if body.color not in VALID_COLORS:
        raise HTTPException(422, f"Invalid color. Allowed: {sorted(VALID_COLORS)}")
    row = db.execute(
        "SELECT id FROM highlights WHERE id = ? AND user_id = ?",
        (highlight_id, user["id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Highlight not found")
    db.execute(
        "UPDATE highlights SET color = ? WHERE id = ? AND user_id = ?",
        (body.color, highlight_id, user["id"]),
    )
    return {"id": highlight_id, "color": body.color}


@router.delete("/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(highlight_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    row = db.execute(
        "SELECT * FROM highlights WHERE id = ? AND user_id = ?",
        (highlight_id, user["id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Highlight not found")
    revoke_resource_shares(db, user["id"], "highlight", highlight_id)
    db.execute("DELETE FROM highlights WHERE id = ?", (highlight_id,))
    return None
