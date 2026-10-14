"""Account management routes — Data Export (GDPR) and Cascading Deletion.

Ensures compliance with privacy mandates:
1. Exporting all user-generated content, documents metadata, annotations, and study artifacts.
2. Complete cascading erasure of files on disk, storage objects, and database records.
"""
from __future__ import annotations

import io
import json
import logging
import time
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from ..config import UPLOAD_DIR
from ..database import get_db
from ..security import get_current_user
from ..services import storage

router = APIRouter(prefix="/api/account", tags=["account"])
logger = logging.getLogger(__name__)


@router.post("/export", status_code=status.HTTP_200_OK)
def export_account_data(user=Depends(get_current_user), db=Depends(get_db)):
    """Export all user-associated data into a structured ZIP archive."""
    user_id = user["id"]

    # 1. Fetch user profile
    user_row = db.execute("SELECT id, email, full_name, knoprix_id, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    profile = dict(user_row) if user_row else {}

    # 2. Fetch projects
    projects = [dict(r) for r in db.execute("SELECT * FROM projects WHERE user_id = ?", (user_id,)).fetchall()]

    # 3. Fetch documents
    documents = [
        dict(r)
        for r in db.execute(
            """
            SELECT d.id, d.project_id, d.file_name, d.file_type, d.file_size, d.page_count,
                   d.created_at, d.tables_json, d.reading_order_json, d.ocr_status
            FROM documents d
            JOIN projects p ON p.id = d.project_id
            WHERE p.user_id = ?
            """,
            (user_id,),
        ).fetchall()
    ]

    # 4. Fetch annotations (bookmarks & highlights)
    bookmarks = [dict(r) for r in db.execute("SELECT * FROM bookmarks WHERE user_id = ?", (user_id,)).fetchall()]
    highlights = [dict(r) for r in db.execute("SELECT * FROM highlights WHERE user_id = ?", (user_id,)).fetchall()]

    # 5. Fetch study artifacts
    artifacts = [dict(r) for r in db.execute("SELECT * FROM study_artifacts WHERE user_id = ?", (user_id,)).fetchall()]

    # 6. Fetch contacts and shares
    contacts = [
        dict(r)
        for r in db.execute(
            "SELECT * FROM contacts WHERE user_low = ? OR user_high = ?",
            (user_id, user_id),
        ).fetchall()
    ]

    # Create ZIP archive in-memory
    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("profile.json", json.dumps(profile, indent=2))
        zf.writestr("projects.json", json.dumps(projects, indent=2))
        zf.writestr("documents_metadata.json", json.dumps(documents, indent=2))
        zf.writestr("bookmarks.json", json.dumps(bookmarks, indent=2))
        zf.writestr("highlights.json", json.dumps(highlights, indent=2))
        zf.writestr("study_artifacts.json", json.dumps(artifacts, indent=2))
        zf.writestr("contacts.json", json.dumps(contacts, indent=2))

    archive_buffer.seek(0)
    job_id = str(uuid.uuid4())
    token = uuid.uuid4().hex
    expires_at = int(time.time()) + 3600

    db.execute(
        """
        INSERT INTO data_export_jobs (id, user_id, status, download_token, expires_at)
        VALUES (?, ?, 'ready', ?, ?)
        """,
        (job_id, user_id, token, expires_at),
    )

    filename = f"knoprix_export_{user.get('knoprix_id', 'user')}.zip"
    return StreamingResponse(
        archive_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(user=Depends(get_current_user), db=Depends(get_db)):
    """Permanent cascading deletion of user account and all associated resources."""
    user_id = user["id"]

    # 1. Gather all user documents to purge files from disk/storage
    doc_rows = db.execute(
        """
        SELECT d.id, d.file_path FROM documents d
        JOIN projects p ON p.id = d.project_id
        WHERE p.user_id = ?
        """,
        (user_id,),
    ).fetchall()

    for d in doc_rows:
        fpath = str(d["file_path"] or "")
        if fpath.startswith("s3://") or fpath.startswith("r2://"):
            key = fpath[5:]
            if storage.enabled():
                try:
                    storage.delete(key)
                except Exception:
                    logger.exception("Failed to delete remote storage object during account purge")
        else:
            p = Path(fpath)
            if not p.exists():
                p = UPLOAD_DIR / p.name
            p.unlink(missing_ok=True)

    # 2. Delete database records (foreign keys cascade from users)
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return None
