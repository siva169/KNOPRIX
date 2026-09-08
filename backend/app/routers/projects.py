"""Project routes — CRUD with per-user ownership."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..database import get_db
from ..security import get_current_user, get_owned_project

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
    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return None
