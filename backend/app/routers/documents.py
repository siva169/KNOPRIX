"""Document routes — upload / list / stream / get / delete (owner-scoped)."""
import codecs
import logging
import os
import re
import shutil
import tempfile
import uuid
import warnings
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from pathlib import PurePosixPath
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from docx.opc.exceptions import PackageNotFoundError as DocxPackageNotFoundError
from lxml.etree import XMLSyntaxError
from pptx.exc import PackageNotFoundError as PptxPackageNotFoundError
from pypdf.errors import PdfReadError, PdfStreamError

from ..config import UPLOAD_DIR, cfg
from ..database import get_db
from ..security import get_current_user, get_owned_document, get_owned_project
from ..services import storage
from ..services.indexer import rebuild_project_indices
from ..services.pdf_parser import extract_document, extract_pptx_slides

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
OBJECT_URI_PREFIXES = ("s3://", "r2://")


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
        try:
            storage.download(object_key_value, temp)
        except Exception:
            temp.unlink(missing_ok=True)
            raise
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
        return {"document": dict(row)}
    finally:
        if not keep_local_file:
            dest.unlink(missing_ok=True)
        await file.close()


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
    file_type = (doc["file_type"] or "").lower()
    media_type = CONTENT_TYPES.get(f".{file_type}", "application/octet-stream")
    download_name = quote(str(doc["file_name"]), safe="")
    disposition = "attachment" if file_type == "svg" else "inline"
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{download_name}",
        "X-Content-Type-Options": "nosniff",
    }
    object_key_value = _object_key(str(doc["file_path"]))
    if storage.enabled() and object_key_value:
        body = storage.stream(object_key_value)
        return StreamingResponse(
            body,
            media_type=media_type,
            headers=headers,
        )
    path = _resolve_path(doc)
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
    file_path = str(doc["file_path"])
    object_key_value = _object_key(file_path)
    if storage.enabled() and object_key_value:
        storage.delete(object_key_value)
    else:
        Path(file_path).unlink(missing_ok=True)
    db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    rebuild_project_indices(db, doc["project_id"])
    return None
