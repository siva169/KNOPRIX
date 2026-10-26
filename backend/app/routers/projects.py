"""Project routes — CRUD with per-user ownership."""
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..database import get_db
from ..security import get_current_user, get_owned_project
from ..services import storage
from ..services.document_io import object_key
from ..services.presentation_preview import remove_presentation_preview
from .social import revoke_resource_shares

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)


@router.get("")
def list_projects(user=Depends(get_current_user), db=Depends(get_db)):
    rows = db.execute(
        "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC",
        (user["id"],),
    ).fetchall()
    return {"projects": [dict(r) for r in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectBody, user=Depends(get_current_user), db=Depends(get_db)):
    project_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO projects (id, user_id, name, description)
        VALUES (?, ?, ?, ?)
        """,
        (project_id, user["id"], body.name.strip(), body.description.strip()),
    )
    row = db.execute(
        "SELECT * FROM projects WHERE id = ?", (project_id,)
    ).fetchone()
    return {"project": dict(row)}


@router.get("/{project_id}")
def get_project(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    return {"project": get_owned_project(db, user["id"], project_id)}


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectBody,
                   user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    db.execute(
        "UPDATE projects SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
        (body.name.strip(), body.description.strip(), project_id),
    )
    row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return {"project": dict(row)}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)

    # 1. Purge physical files, previews, and shares for all documents in this project
    docs = db.execute(
        "SELECT id, file_path FROM documents WHERE project_id = ?",
        (project_id,),
    ).fetchall()

    for doc in docs:
        doc_id = doc["id"]
        # Revoke bookmarks/highlights shares
        for table, resource_type in (("bookmarks", "bookmark"), ("highlights", "highlight")):
            rows = db.execute(
                f"SELECT id FROM {table} WHERE document_id = ? AND user_id = ?",
                (doc_id, user["id"]),
            ).fetchall()
            for r in rows:
                revoke_resource_shares(db, user["id"], resource_type, r["id"])
        revoke_resource_shares(db, user["id"], "document", doc_id)
        remove_presentation_preview(doc_id)

        # Unlink physical file on disk or object storage
        file_path = str(doc["file_path"] or "")
        object_key_value = object_key(file_path)
        if storage.enabled() and object_key_value:
            storage.delete(object_key_value)
        else:
            Path(file_path).unlink(missing_ok=True)

    # 2. Delete project from DB (cascades to documents, bookmarks, highlights, dsa_indices)
    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return None

