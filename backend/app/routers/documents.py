"""Document routes — upload / list / stream / get / delete (owner-scoped)."""
import codecs
import json
import logging
import re
import shutil
import uuid
import warnings
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from pathlib import PurePosixPath
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from docx.opc.exceptions import PackageNotFoundError as DocxPackageNotFoundError
from lxml.etree import XMLSyntaxError
from pptx.exc import PackageNotFoundError as PptxPackageNotFoundError
from pypdf.errors import PdfReadError, PdfStreamError

from ..config import UPLOAD_DIR, cfg
from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from .social import has_active_document_share, revoke_resource_shares
from ..services import storage
from ..services import provider_file_cleanup
from ..services.document_io import (
    materialize_document,
    object_key,
    resolve_document_path,
)
from ..services.presentation_preview import (
    preview_cache_path,
    render_presentation_preview,
    remove_presentation_preview,
)
from ..services.indexer import rebuild_project_indices
from ..services.ingestion import create_ingestion_job, process_document_ingestion
from ..services.pdf_parser import extract_document, extract_pptx_slides
from ..services.rag import resolve_api_key

router = APIRouter(prefix="/api", tags=["documents"])
logger = logging.getLogger(__name__)

ALLOWED_TYPES = {
    ".pdf", ".pptx", ".docx", ".txt", ".md",
    ".png", ".jpg", ".jpeg", ".svg",
}
CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "application/octet-stream",
}
MAX_ARCHIVE_ENTRIES = 10_000
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 256 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_SVG_BYTES = 10 * 1024 * 1024
MAX_SVG_ELEMENTS = 100_000
MAX_SVG_DEPTH = 64
PREFIX_RE = re.compile(r"^\d+-\d+-")
def _get_readable_document(db, user_id: str, document_id: str):
    try:
        return get_owned_document(db, user_id, document_id), False
    except HTTPException as exc:
        if exc.status_code != status.HTTP_404_NOT_FOUND:
            raise
    if not has_active_document_share(db, user_id, document_id):
        raise HTTPException(404, "Document not found")
    row = db.execute(
        "SELECT d.* FROM documents d JOIN projects p ON p.id = d.project_id "
        "WHERE d.id = ? AND EXISTS (SELECT 1 FROM shares s "
        "WHERE s.sender_id = p.user_id AND s.recipient_id = ? "
        "AND s.resource_type = 'document' AND s.resource_id = d.id "
        "AND s.status = 'accepted')",
        (document_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Document not found")
    return dict(row), True


def _safe_display_name(filename: str | None) -> str:
    name = PurePosixPath(str(filename or "untitled").replace("\\", "/")).name
    name = "".join(char for char in name if char.isprintable()).strip(" .")
    if not name:
        name = "untitled"
    suffix = Path(name).suffix
    if len(name) > 255:
        name = name[:255 - len(suffix)] + suffix
    return name


def _invalid_upload(detail: str = "File content is invalid or does not match its extension"):
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def _validate_office_archive(path: Path, ext: str) -> None:
    expected_member = (
        "ppt/presentation.xml" if ext == ".pptx" else "word/document.xml"
    )
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if not entries or len(entries) > MAX_ARCHIVE_ENTRIES:
                raise HTTPException(413, "Office archive exceeds the entry limit")
            if len(names) != len(set(names)):
                _invalid_upload()
            for name in names:
                member = PurePosixPath(name)
                if (
                    "\\" in name
                    or member.is_absolute()
                    or ".." in member.parts
                    or (member.parts and ":" in member.parts[0])
                ):
                    _invalid_upload()
            if sum(entry.file_size for entry in entries) > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                raise HTTPException(413, "Office archive exceeds the decompressed-size limit")
            if not {"[Content_Types].xml", expected_member} <= set(names):
                _invalid_upload()
            if archive.testzip() is not None:
                _invalid_upload()
    except (zipfile.BadZipFile, OSError, RuntimeError, ValueError):
        _invalid_upload()


def _validate_text(path: Path) -> None:
    decoder = codecs.getincrementaldecoder("utf-8")()
    try:
        with path.open("rb") as source:
            while chunk := source.read(64 * 1024):
                if b"\x00" in chunk:
                    _invalid_upload()
                decoder.decode(chunk)
            decoder.decode(b"", final=True)
    except UnicodeDecodeError:
        _invalid_upload("Text uploads must contain valid UTF-8")


def _validate_raster_image(path: Path, ext: str) -> None:
    from PIL import Image, UnidentifiedImageError

    expected_format = "PNG" if ext == ".png" else "JPEG"
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                if image.format != expected_format:
                    raise HTTPException(415, "Image content does not match its extension")
                width, height = image.size
                if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(413, "Image exceeds the pixel limit")
                image.verify()
    except HTTPException:
        raise
    except (
        EOFError,
        OSError,
        SyntaxError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
    ):
        _invalid_upload("Image is malformed or truncated")


def _validate_svg(path: Path) -> None:
    if path.stat().st_size > MAX_SVG_BYTES:
        raise HTTPException(413, "SVG exceeds the 10MB XML limit")
    try:
        content = path.read_bytes()
        upper_content = content.upper()
        if b"<!DOCTYPE" in upper_content or b"<!ENTITY" in upper_content:
            _invalid_upload("SVG document types and entities are not supported")
        content.decode("utf-8")
        depth = 0
        element_count = 0
        root_name = None
        for event, element in ET.iterparse(path, events=("start", "end")):
            if event == "start":
                depth += 1
                element_count += 1
                if depth > MAX_SVG_DEPTH or element_count > MAX_SVG_ELEMENTS:
                    raise HTTPException(413, "SVG exceeds XML complexity limits")
                if root_name is None:
                    root_name = element.tag.rsplit("}", 1)[-1].lower()
                tag = element.tag.rsplit("}", 1)[-1].lower()
                if tag in {
                    "script",
                    "foreignobject",
                    "animate",
                    "animatemotion",
                    "animatetransform",
                    "set",
                }:
                    _invalid_upload("Active SVG content is not supported")
                for name, value in element.attrib.items():
                    attribute = name.rsplit("}", 1)[-1].lower()
                    lowered_value = value.lower()
                    if (
                        attribute.startswith("on")
                        or (attribute == "href" and value and not value.startswith("#"))
                        or "url(" in lowered_value
                        or "@import" in lowered_value
                    ):
                        _invalid_upload("Active SVG references are not supported")
            else:
                if element.tag.rsplit("}", 1)[-1].lower() == "style":
                    style = (element.text or "").lower()
                    if "url(" in style or "@import" in style:
                        _invalid_upload("External SVG styles are not supported")
                element.clear()
                depth -= 1
        if root_name != "svg":
            _invalid_upload("SVG content must have an SVG root element")
    except HTTPException:
        raise
    except (ET.ParseError, UnicodeDecodeError, OSError, RecursionError):
        _invalid_upload("SVG is malformed or exceeds XML complexity limits")


def _validate_upload_file(path: Path, ext: str) -> None:
    if ext == ".pdf":
        with path.open("rb") as source:
            if not source.read(5).startswith(b"%PDF-"):
                raise HTTPException(415, "File content does not match its extension")
    elif ext in {".pptx", ".docx"}:
        _validate_office_archive(path, ext)
    elif ext in {".txt", ".md"}:
        _validate_text(path)
    elif ext in {".png", ".jpg", ".jpeg"}:
        _validate_raster_image(path, ext)
    elif ext == ".svg":
        _validate_svg(path)


def _serialize_document_row(row, ai_granted: bool) -> dict:
    """Project a document row into the shape the frontend consumes.

    The AI Wing UI reads `title` / `filename` / `ai_granted`; the database only
    stores `file_name` and keeps grants in a separate table. Serving all three
    aliases here keeps one contract for every client.
    """
    doc = dict(row)
    display = doc.get("file_name") or doc.get("filename") or doc.get("title") or "Untitled document"
    doc["title"] = display
    doc["filename"] = display
    doc["fileName"] = display
    doc["ai_granted"] = bool(ai_granted)
    return doc


@router.get("/projects/{project_id}/documents")
def list_documents(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    rows = db.execute(
        """
        SELECT d.*,
               CASE WHEN g.id IS NULL THEN 0 ELSE 1 END AS has_grant,
               COALESCE(b.bookmark_count, 0) AS bookmark_count,
               COALESCE(h.highlight_count, 0) AS highlight_count
        FROM documents d
        LEFT JOIN ai_document_grants g
               ON g.document_id = d.id
              AND g.user_id = ?
              AND g.purpose = 'all'
              AND g.revoked_at IS NULL
        LEFT JOIN (
            SELECT document_id, COUNT(*) AS bookmark_count
            FROM bookmarks
            WHERE user_id = ? AND project_id = ?
            GROUP BY document_id
        ) b ON b.document_id = d.id
        LEFT JOIN (
            SELECT document_id, COUNT(*) AS highlight_count
            FROM highlights
            WHERE user_id = ? AND project_id = ?
            GROUP BY document_id
        ) h ON h.document_id = d.id
        WHERE d.project_id = ?
        ORDER BY d.created_at DESC
        """,
        (user["id"], user["id"], project_id, user["id"], project_id, project_id),
    ).fetchall()
    # Full rows (incl. extracted_text) so text viewers can render without an
    # extra fetch. Typical extracted text is tens of KB — acceptable for lists.
    docs = [_serialize_document_row(r, bool(r["has_grant"])) for r in rows]
    return {"documents": docs}


@router.post("/projects/{project_id}/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(project_id: str, file: UploadFile = File(...),
                          user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)

    original = _safe_display_name(file.filename)
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(415, f"Unsupported file type '{ext or 'none'}'")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / safe_name
    keep_local_file = False
    try:
        size = 0
        with dest.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > cfg.MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        413, f"File exceeds the {cfg.MAX_UPLOAD_MB}MB limit"
                    )
                out.write(chunk)
        if size == 0:
            raise HTTPException(422, "Uploaded file is empty")

        _validate_upload_file(dest, ext)
        try:
            parsed = extract_document(dest, ext.lstrip("."))
        except (
            DocxPackageNotFoundError,
            ET.ParseError,
            OSError,
            PdfReadError,
            PdfStreamError,
            PptxPackageNotFoundError,
            ValueError,
            XMLSyntaxError,
            zipfile.BadZipFile,
        ) as exc:
            raise HTTPException(
                422, "File is malformed or cannot be processed"
            ) from exc

        doc_id = str(uuid.uuid4())
        use_object_storage = storage.enabled()
        storage_key = None
        if use_object_storage:
            storage_key = storage.object_key(doc_id, safe_name)
            storage.upload(dest, storage_key, CONTENT_TYPES[ext])
            file_path = f"s3://{storage_key}"
        else:
            file_path = str(dest)

        try:
            db.execute(
                """
                INSERT INTO documents (id, project_id, file_name, file_type, file_path,
                                       file_size, page_count, extracted_text,
                                       extraction_method, is_scanned, ocr_text,
                                       ocr_status, tables_json, reading_order_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (doc_id, project_id, original, ext.lstrip("."), file_path,
                 size, parsed["page_count"], parsed["text"], parsed["method"],
                 1 if parsed["is_scanned"] else 0,
                 parsed.get("ocr_text", ""),
                 parsed.get("ocr_status", "none"),
                 json.dumps(parsed.get("tables", [])),
                 json.dumps(parsed.get("reading_order", []))),
            )
            for i, page_text in enumerate(parsed["pages"], start=1):
                db.execute(
                    "INSERT INTO document_pages (id, document_id, page_number, page_text) VALUES (?, ?, ?, ?)",
                    (str(uuid.uuid4()), doc_id, i, page_text),
                )

            job = create_ingestion_job(db, user["id"], doc_id)
            process_document_ingestion(
                db, job["id"], doc_id, project_id, parsed, index_fn=rebuild_project_indices
            )

            # Grant default AI access to owner for this document
            existing_grant = db.execute(
                "SELECT id FROM ai_document_grants WHERE user_id = ? AND document_id = ? AND purpose = ?",
                (user["id"], doc_id, "all"),
            ).fetchone()
            if not existing_grant:
                db.execute(
                    "INSERT INTO ai_document_grants (id, user_id, document_id, purpose) VALUES (?, ?, ?, 'all')",
                    (str(uuid.uuid4()), user["id"], doc_id),
                )

            row = db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        except Exception:
            if storage_key is not None:
                try:
                    storage.delete(storage_key)
                except Exception:
                    logger.exception(
                        "Failed to remove uploaded object after document save failure"
                    )
            raise
        keep_local_file = not use_object_storage
        return {"document": _serialize_document_row(row, True), "jobId": job["id"]}
    finally:
        if not keep_local_file:
            dest.unlink(missing_ok=True)
        await file.close()


@router.get("/documents/{document_id}")
def get_document(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc, read_only = _get_readable_document(db, user["id"], document_id)
    if read_only:
        doc = {
            field: doc[field]
            for field in (
                "id",
                "file_name",
                "file_type",
                "file_size",
                "page_count",
                "extracted_text",
            )
        }
    granted = db.execute(
        "SELECT id FROM ai_document_grants WHERE user_id = ? AND document_id = ? "
        "AND purpose = 'all' AND revoked_at IS NULL",
        (user["id"], document_id),
    ).fetchone()
    return {
        "document": _serialize_document_row(doc, granted is not None),
        "readOnly": read_only,
    }


@router.get("/documents/{document_id}/slides")
def get_slides(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """Visual slide data for PPTX — renders like PowerPoint (shapes, text, tables, images)."""
    doc, _read_only = _get_readable_document(db, user["id"], document_id)
    if (doc["file_type"] or "").lower() not in ("pptx", "ppt"):
        raise HTTPException(404, "Not a slideshow document")
    path, temporary = materialize_document(doc)
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


@router.get("/documents/{document_id}/preview.pdf")
def get_presentation_preview(
    document_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    doc, _read_only = _get_readable_document(db, user["id"], document_id)
    if (doc["file_type"] or "").lower() != "pptx":
        raise HTTPException(404, "Not a PPTX document")

    preview_path = preview_cache_path(document_id)
    if not preview_path.is_file() or not preview_path.stat().st_size:
        source_path, temporary = materialize_document(doc)
        try:
            if not source_path.exists():
                raise HTTPException(404, "File missing on disk")
            try:
                preview_path = render_presentation_preview(source_path, document_id)
            except FileNotFoundError as error:
                raise HTTPException(503, "PowerPoint preview renderer is unavailable") from error
            except TimeoutError as error:
                raise HTTPException(504, "PowerPoint preview took too long to render") from error
            except ValueError as error:
                raise HTTPException(413, "Rendered presentation exceeds the preview size limit") from error
            except RuntimeError as error:
                logger.exception("Could not render PPTX preview")
                raise HTTPException(422, "Could not render this presentation") from error
        finally:
            if temporary:
                source_path.unlink(missing_ok=True)

    filename = f"{Path(str(doc['file_name'])).stem}.pdf"
    return FileResponse(
        preview_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename, safe='')}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/documents/{document_id}/pages")
def get_pages(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    _get_readable_document(db, user["id"], document_id)
    rows = db.execute(
        "SELECT page_number, page_text FROM document_pages WHERE document_id = ? ORDER BY page_number",
        (document_id,),
    ).fetchall()
    return {"pages": [dict(r) for r in rows]}


@router.get("/documents/{document_id}/stream")
def stream_document(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc, _read_only = _get_readable_document(db, user["id"], document_id)
    file_type = (doc["file_type"] or "").lower()
    media_type = CONTENT_TYPES.get(f".{file_type}", "application/octet-stream")
    download_name = quote(str(doc["file_name"]), safe="")
    disposition = "attachment" if file_type == "svg" else "inline"
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{download_name}",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    }
    object_key_value = object_key(str(doc["file_path"]))
    if storage.enabled() and object_key_value:
        body = storage.stream(object_key_value)
        return StreamingResponse(
            body,
            media_type=media_type,
            headers=headers,
        )
    path = resolve_document_path(doc)
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(
        path,
        media_type=media_type,
        headers=headers,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc = get_owned_document(db, user["id"], document_id)
    for table, resource_type in (("bookmarks", "bookmark"), ("highlights", "highlight")):
        rows = db.execute(
            f"SELECT id FROM {table} WHERE document_id = ? AND user_id = ?",
            (document_id, user["id"]),
        ).fetchall()
        for row in rows:
            revoke_resource_shares(db, user["id"], resource_type, row["id"])
    revoke_resource_shares(db, user["id"], "document", document_id)
    remove_presentation_preview(document_id)
    file_path = str(doc["file_path"])
    object_key_value = object_key(file_path)
    if storage.enabled() and object_key_value:
        storage.delete(object_key_value)
    else:
        Path(file_path).unlink(missing_ok=True)
    db.execute(
        """UPDATE provider_document_files
           SET status = CASE
                   WHEN provider_id = 'nvidia-nim' OR provider_file_id IS NULL
                       THEN 'revoked'
                   ELSE 'delete_pending'
               END,
               error_message = CASE
                   WHEN provider_id = 'nvidia-nim' OR provider_file_id IS NULL
                       THEN ''
                   ELSE 'Source document deleted; retry remote deletion.'
               END,
               updated_at = datetime('now')
           WHERE user_id = ? AND document_id = ? AND status != 'revoked'""",
        (user["id"], document_id),
    )
    db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    rebuild_project_indices(db, doc["project_id"])
    return None


@router.get("/documents/{document_id}/status")
def get_document_status(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    _get_readable_document(db, user["id"], document_id)
    job = db.execute(
        "SELECT * FROM ingestion_jobs WHERE document_id = ? ORDER BY created_at DESC LIMIT 1",
        (document_id,),
    ).fetchone()
    if job is None:
        return {
            "job": {
                "id": None,
                "status": "ready",
                "progress": 100,
                "stepDetail": "Document ready",
                "ocrStatus": "none",
                "ocrEngine": "none",
                "ocrConfidence": 0.0,
                "errorMessage": "",
            }
        }
    return {
        "job": {
            "id": job["id"],
            "status": job["status"],
            "progress": job["progress"],
            "stepDetail": job["step_detail"],
            "ocrStatus": job["ocr_status"],
            "ocrEngine": job["ocr_engine"],
            "ocrConfidence": job["ocr_confidence"],
            "errorMessage": job["error_message"],
            "createdAt": job["created_at"],
            "updatedAt": job["updated_at"],
        }
    }


@router.get("/documents/{document_id}/chunks")
def get_document_chunks(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    _get_readable_document(db, user["id"], document_id)
    rows = db.execute(
        "SELECT id, page_number, chunk_index, content, metadata_json FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC",
        (document_id,),
    ).fetchall()
    return {"chunks": [dict(r) for r in rows]}


@router.get("/documents/{document_id}/tables")
def get_document_tables(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc, _ = _get_readable_document(db, user["id"], document_id)
    raw = doc.get("tables_json") or "[]"
    try:
        tables = json.loads(raw)
    except Exception:
        tables = []
    return {"tables": tables}


@router.get("/documents/{document_id}/reading-order")
def get_document_reading_order(document_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    doc, _ = _get_readable_document(db, user["id"], document_id)
    raw = doc.get("reading_order_json") or "[]"
    try:
        reading_order = json.loads(raw)
    except Exception:
        reading_order = []
    return {"readingOrder": reading_order}


@router.post("/documents/{document_id}/grant")
def grant_ai_access(document_id: str, body: dict = None, user=Depends(get_current_user), db=Depends(get_db)):
    """Grant or revoke AI access.

    The client toggles with a single POST and a boolean `granted` flag, so this
    endpoint honours `granted: false` by revoking. Previously the flag was
    ignored and every call re-granted, which meant "Revoke" silently left the
    document readable by the server.
    """
    _get_readable_document(db, user["id"], document_id)
    body = body or {}
    purpose = body.get("purpose", "all")
    should_grant = body.get("granted", True)

    if not should_grant:
        db.execute(
            "UPDATE ai_document_grants SET revoked_at = datetime('now') "
            "WHERE user_id = ? AND document_id = ? AND purpose = ?",
            (user["id"], document_id, purpose),
        )
        return {
            "granted": False,
            "revoked": True,
            "documentId": document_id,
            "purpose": purpose,
        }

    existing = db.execute(
        "SELECT id, revoked_at FROM ai_document_grants WHERE user_id = ? AND document_id = ? AND purpose = ?",
        (user["id"], document_id, purpose),
    ).fetchone()
    if existing:
        if existing["revoked_at"]:
            db.execute("UPDATE ai_document_grants SET revoked_at = NULL WHERE id = ?", (existing["id"],))
        grant_id = existing["id"]
    else:
        grant_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO ai_document_grants (id, user_id, document_id, purpose) VALUES (?, ?, ?, ?)",
            (grant_id, user["id"], document_id, purpose),
        )
    return {"granted": True, "grantId": grant_id, "documentId": document_id, "purpose": purpose}


@router.delete("/documents/{document_id}/grant")
def revoke_ai_access(document_id: str, purpose: str = "all", user=Depends(get_current_user), db=Depends(get_db)):
    _get_readable_document(db, user["id"], document_id)
    db.execute(
        "UPDATE ai_document_grants SET revoked_at = datetime('now') WHERE user_id = ? AND document_id = ? AND purpose = ?",
        (user["id"], document_id, purpose),
    )
    return {"revoked": True, "documentId": document_id, "purpose": purpose}


def _provider_document_model(provider_id: str, model_id: str) -> tuple[dict, dict]:
    from .chat import _lookup

    provider = _lookup(provider_id)
    if provider is None:
        raise HTTPException(400, f"Provider '{provider_id}' is not allowlisted.")
    model = next(
        (item for item in provider["models"] if item["id"] == model_id), None
    )
    if model is None:
        raise HTTPException(400, f"Model '{model_id}' is not allowlisted for '{provider_id}'.")
    return provider, model


def _provider_key(
    provider_id: str, supplied_key: str | None
) -> str | None:
    if provider_id == "nvidia-nim" and supplied_key:
        raise HTTPException(
            400, "NVIDIA uses the backend-managed key; client-supplied keys are not accepted."
        )
    return resolve_api_key(
        provider_id, None if provider_id == "nvidia-nim" else supplied_key
    )


@router.delete("/documents/{document_id}/provider-authorization")
def revoke_provider_document(
    document_id: str,
    providerId: str = Query(...),
    model: str = Query(...),
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: str | None = Header(None, alias="X-Provider-Key"),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    _provider_document_model(providerId, model)
    get_owned_document(db, user["id"], document_id)
    api_key = _provider_key(
        providerId, x_provider_key if x_provider_key else x_api_key
    )
    result = provider_file_cleanup.revoke_document(
        db, user["id"], document_id, providerId, model, api_key
    )
    return {
        "documentId": document_id,
        "providerId": providerId,
        "model": model,
        **result,
    }


@router.post("/provider-files/{document_id}/retry-delete")
def retry_provider_document_deletion(
    document_id: str,
    body: dict,
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: str | None = Header(None, alias="X-Provider-Key"),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    provider_id = body.get("providerId")
    model_id = body.get("model")
    if not isinstance(provider_id, str) or not isinstance(model_id, str):
        raise HTTPException(400, "Provider and model are required.")
    _provider_document_model(provider_id, model_id)
    api_key = _provider_key(
        provider_id, x_provider_key if x_provider_key else x_api_key
    )
    result = provider_file_cleanup.retry_pending_deletions(
        db, user["id"], provider_id, api_key, document_id, model_id
    )
    return {
        "documentId": document_id,
        "providerId": provider_id,
        "model": model_id,
        **result,
    }


@router.get("/projects/{project_id}/provider-documents")
def list_provider_documents(
    project_id: str,
    providerId: str,
    model: str,
    user=Depends(get_current_user),
    db=Depends(get_db),
    x_provider_key: str | None = Header(None, alias="X-Provider-Key"),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    _provider_document_model(providerId, model)
    get_owned_project(db, user["id"], project_id)
    api_key = _provider_key(
        providerId, x_provider_key if x_provider_key else x_api_key
    )
    return provider_file_cleanup.list_provider_documents(
        db, user["id"], project_id, providerId, model, api_key
    )


@router.get("/chat/grants")
def list_ai_grants(user=Depends(get_current_user), db=Depends(get_db)):
    rows = db.execute(
        """
        SELECT g.id, g.document_id, g.purpose, g.granted_at, d.file_name, d.file_type
        FROM ai_document_grants g
        JOIN documents d ON d.id = g.document_id
        WHERE g.user_id = ? AND g.revoked_at IS NULL
        ORDER BY g.granted_at DESC
        """,
        (user["id"],),
    ).fetchall()
    return {"grants": [dict(r) for r in rows]}
