"""Document routes — upload / list / stream / get / delete (owner-scoped)."""
import re
import shutil
import tempfile
import uuid
import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse

from ..config import cfg, UPLOAD_DIR
from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from ..services.indexer import rebuild_project_indices
from ..services.pdf_parser import extract_document, extract_pptx_slides
from ..services import storage

router = APIRouter(prefix="/api", tags=["documents"])

ALLOWED_TYPES = {".pdf", ".pptx", ".ppt", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"}
PREFIX_RE = re.compile(r"^\d+-\d+-")
OBJECT_URI_PREFIXES = ("s3://", "r2://")


def _object_key(file_path: str) -> str | None:
    for prefix in OBJECT_URI_PREFIXES:
        if file_path.startswith(prefix):
            return file_path[len(prefix):]
    return None


def _resolve_path(doc: dict) -> Path:
    """Return the on-disk file for a document row.

    Falls back to the uploads directory by filename — the project folder may
    have moved since upload (e.g. Downloads -> AI-Rules), which leaves the
    stored absolute path stale while the file copy still lives in uploads/.
    """
    stored_path = str(doc["file_path"] or "")
    # Neon can contain paths written on Windows while the API runs on Linux.
    # Normalize both separators before resolving the portable uploads fallback.
    path = Path(stored_path.replace("\\", "/"))
    if not path.exists():
        path = UPLOAD_DIR / path.name
    return path


def _materialize_document(doc: dict) -> tuple[Path, bool]:
    """Return a readable path and whether the caller owns the temporary file."""
    object_key_value = _object_key(str(doc["file_path"]))
    if storage.enabled() and object_key_value:
        fd, temp_name = tempfile.mkstemp(prefix="knoprix-document-")
        os.close(fd)
        temp = Path(temp_name)
        storage.download(object_key_value, temp)
        return temp, True
    return _resolve_path(doc), False


@router.get("/projects/{project_id}/documents")
def list_documents(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    rows = db.execute(
        "SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    # Full rows (incl. extracted_text) so text viewers can render without an
    # extra fetch. Typical extracted text is tens of KB — acceptable for lists.
    docs = [dict(r) for r in rows]
    return {"documents": docs}


@router.post("/projects/{project_id}/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(project_id: str, file: UploadFile = File(...),
                          user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)

    original = file.filename or "untitled"
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(415, f"Unsupported file type '{ext or 'none'}'")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{int(__import__('time').time() * 1000)}-{uuid.uuid4().hex[:8]}-{Path(original).name}"
    dest = UPLOAD_DIR / safe_name

    size = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > cfg.MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"File exceeds the {cfg.MAX_UPLOAD_MB}MB limit")
            out.write(chunk)
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(422, "Uploaded file is empty")

    doc_id = str(uuid.uuid4())
    parsed = extract_document(dest, ext.lstrip("."))
    if storage.enabled():
        key = storage.object_key(doc_id, original)
        storage.upload(dest, key, file.content_type)
        dest.unlink(missing_ok=True)
        file_path = f"s3://{key}"
    else:
        file_path = str(dest)
    db.execute(
        """
        INSERT INTO documents (id, project_id, file_name, file_type, file_path,
                               file_size, page_count, extracted_text,
                               extraction_method, is_scanned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (doc_id, project_id, original, ext.lstrip("."), file_path,
         size, parsed["page_count"], parsed["text"], parsed["method"],
         1 if parsed["is_scanned"] else 0),
    )
    for i, page_text in enumerate(parsed["pages"], start=1):
        db.execute(
            "INSERT INTO document_pages (id, document_id, page_number, page_text) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), doc_id, i, page_text),
        )

    rebuild_project_indices(db, project_id)

    row = db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    d = dict(row)
    return {"document": d}


@router.get("/documents/{document_id}")
def get_document(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc = get_owned_document(db, user["id"], document_id)
    return {"document": doc}


@router.get("/documents/{document_id}/slides")
def get_slides(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """Visual slide data for PPTX — renders like PowerPoint (shapes, text, tables, images)."""
    doc = get_owned_document(db, user["id"], document_id)
    if (doc["file_type"] or "").lower() not in ("pptx", "ppt"):
        raise HTTPException(404, "Not a slideshow document")
    path, temporary = _materialize_document(doc)
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    try:
        data = extract_pptx_slides(path)
    except Exception:
        raise HTTPException(422, "Could not parse this slideshow")
    finally:
        if temporary:
            path.unlink(missing_ok=True)
    return {"slides": data["slides"], "widthPt": data["widthPt"], "heightPt": data["heightPt"]}


@router.get("/documents/{document_id}/pages")
def get_pages(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_document(db, user["id"], document_id)
    rows = db.execute(
        "SELECT page_number, page_text FROM document_pages WHERE document_id = ? ORDER BY page_number",
        (document_id,),
    ).fetchall()
    return {"pages": [dict(r) for r in rows]}


@router.get("/documents/{document_id}/stream")
def stream_document(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc = get_owned_document(db, user["id"], document_id)
    object_key_value = _object_key(str(doc["file_path"]))
    if storage.enabled() and object_key_value:
        body = storage.stream(object_key_value)
        media = "application/pdf" if doc["file_type"] == "pdf" else "application/octet-stream"
        return StreamingResponse(
            body,
            media_type=media,
            headers={"Content-Disposition": f'inline; filename="{doc["file_name"]}"'},
        )
    path = _resolve_path(doc)
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    media = "application/pdf" if doc["file_type"] == "pdf" else "application/octet-stream"
    return FileResponse(path, media_type=media, filename=doc["file_name"])


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc = get_owned_document(db, user["id"], document_id)
    file_path = str(doc["file_path"])
    object_key_value = _object_key(file_path)
    if storage.enabled() and object_key_value:
        storage.delete(object_key_value)
    else:
        Path(file_path).unlink(missing_ok=True)
    db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    rebuild_project_indices(db, doc["project_id"])
    return None
