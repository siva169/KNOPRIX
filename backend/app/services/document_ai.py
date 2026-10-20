"""Provider-specific full-document consent, conversion, and file lifecycle."""
from __future__ import annotations

import hashlib
import hmac
import http.client
import json
import logging
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter

from ..config import UPLOAD_DIR, cfg
from .document_io import materialize_document

logger = logging.getLogger(__name__)

NVIDIA_VISION_MODEL_ID = "nvidia/nemotron-nano-12b-v2-vl"
PROVIDER_PAGE_BATCH_SIZE = 20
NVIDIA_PAGE_BATCH_SIZE = 4
MAX_PROVIDER_PART_BYTES = 50_000_000
_PROVIDER_UPLOADS = {
    "openai": "https://api.openai.com/v1/files",
    "anthropic": "https://api.anthropic.com/v1/files",
    "gemini-free": "https://generativelanguage.googleapis.com/upload/v1beta/files",
}
_PROVIDER_FILE_ID_PATTERNS = {
    "openai": re.compile(r"file-[A-Za-z0-9_-]{1,196}\Z"),
    "anthropic": re.compile(r"file_[A-Za-z0-9_-]{1,196}\Z"),
}
class ProviderFileError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 502,
        provider_status: int | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.provider_status = provider_status


def credential_fingerprint(provider_id: str, api_key: str) -> str:
    message = f"{provider_id}\0{api_key}".encode("utf-8")
    return hmac.new(
        cfg.JWT_SECRET.encode("utf-8"), message, hashlib.sha256
    ).hexdigest()


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _run_office_conversion(source: Path, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    profile = output_dir / f"lo-profile-{uuid.uuid4().hex}"
    try:
        result = subprocess.run(
            [
                "soffice",
                "--headless",
                f"-env:UserInstallation={profile.as_uri()}",
                "--convert-to",
                "pdf",
                "--outdir",
                str(output_dir),
                str(source),
            ],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ProviderFileError(
            "Document conversion is unavailable on this server.", 503
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise ProviderFileError(
            "Document conversion exceeded the server time limit.", 422
        ) from exc
    output = output_dir / f"{source.stem}.pdf"
    if result.returncode != 0 or not output.is_file():
        logger.warning("Document-to-PDF conversion failed with exit %s", result.returncode)
        raise ProviderFileError(
            "Could not convert this document to a provider-readable PDF.", 422
        )
    return output


def prepare_pdf(source: Path, file_type: str, work_dir: Path) -> Path:
    """Create a PDF preserving the uploaded document's pages and visuals."""
    ext = f".{file_type.lower().lstrip('.')}"
    if ext == ".pdf":
        pdf_path = source
    elif ext in {".png", ".jpg", ".jpeg"}:
        from PIL import Image

        work_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = work_dir / "prepared.pdf"
        with Image.open(source) as image:
            if image.mode not in ("RGB", "L"):
                background = Image.new("RGB", image.size, "white")
                if "A" in image.getbands():
                    background.paste(image, mask=image.getchannel("A"))
                else:
                    background.paste(image)
                image = background
            elif image.mode == "L":
                image = image.convert("RGB")
            image.save(pdf_path, "PDF", resolution=150.0)
    else:
        work_dir.mkdir(parents=True, exist_ok=True)
        source_for_conversion = work_dir / f"source{ext}"
        if ext in {".txt", ".md"}:
            source_for_conversion = work_dir / "source.txt"
        shutil.copyfile(source, source_for_conversion)
        converted = _run_office_conversion(source_for_conversion, work_dir)
        pdf_path = work_dir / "prepared.pdf"
        if converted != pdf_path:
            converted.replace(pdf_path)

    try:
        reader = PdfReader(str(pdf_path), strict=True)
        if reader.is_encrypted or not reader.pages:
            raise ProviderFileError("The converted document contains no readable pages.", 422)
    except ProviderFileError:
        raise
    except Exception as exc:
        raise ProviderFileError(
            "The converted document is not a valid, readable PDF.", 422
        ) from exc
    return pdf_path


def split_pdf(pdf_path: Path, output_dir: Path) -> list[dict[str, Any]]:
    """Split a document into complete, ordered page groups for provider limits."""
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        reader = PdfReader(str(pdf_path), strict=True)
        if reader.is_encrypted:
            raise ProviderFileError("Encrypted PDFs are not supported for full-document chat.", 422)
        page_count = len(reader.pages)
        if page_count == 0:
            raise ProviderFileError("The document contains no readable pages.", 422)
        parts = []
        for first in range(0, page_count, PROVIDER_PAGE_BATCH_SIZE):
            start = first + 1
            end = min(first + PROVIDER_PAGE_BATCH_SIZE, page_count)
            writer = PdfWriter()
            for page_index in range(first, end):
                writer.add_page(reader.pages[page_index])
            part_path = output_dir / f"pages-{start:06d}-{end:06d}.pdf"
            with part_path.open("wb") as output:
                writer.write(output)
            if part_path.stat().st_size > MAX_PROVIDER_PART_BYTES:
                part_path.unlink(missing_ok=True)
                raise ProviderFileError(
                    f"Pages {start}-{end} exceed the provider's 50 MB per-file limit. "
                    "Reduce the source file size or split it into smaller documents.",
                    413,
                )
            parts.append(
                {
                    "path": part_path,
                    "page_start": start,
                    "page_end": end,
                    "page_count": page_count,
                }
            )
        return parts
    except ProviderFileError:
        raise
    except Exception as exc:
        raise ProviderFileError("Could not read every page in this document.", 422) from exc


def _json_request(
    url: str,
    api_key: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict | None = None,
) -> dict:
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers=request_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read()
        return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        raise ProviderFileError(
            f"Provider file operation failed with HTTP {exc.code}.",
            502,
            provider_status=exc.code,
        ) from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ProviderFileError("Could not reach the provider file service.", 502) from exc


def _streaming_multipart_upload(
    provider_id: str, api_key: str, path: Path, filename: str
) -> dict:
    endpoint = urllib.parse.urlsplit(_PROVIDER_UPLOADS[provider_id])
    boundary = uuid.uuid4().hex
    if provider_id == "openai":
        fields = [(b"purpose", b"user_data")]
        headers = {"Authorization": f"Bearer {api_key}"}
    else:
        fields = []
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "files-api-2025-04-14",
        }
    prefix = bytearray()
    for name, value in fields:
        prefix.extend(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name.decode()}\"\r\n\r\n".encode()
        )
        prefix.extend(value + b"\r\n")
    safe_name = Path(filename).name.replace('"', "_").replace("\r", "_").replace("\n", "_")
    prefix.extend(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{safe_name}\"\r\n"
        "Content-Type: application/pdf\r\n\r\n".encode("utf-8")
    )
    suffix = f"\r\n--{boundary}--\r\n".encode("ascii")
    length = len(prefix) + path.stat().st_size + len(suffix)
    connection = http.client.HTTPSConnection(endpoint.hostname, timeout=120)
    try:
        connection.putrequest("POST", f"{endpoint.path}?{endpoint.query}" if endpoint.query else endpoint.path)
        connection.putheader("Content-Type", f"multipart/form-data; boundary={boundary}")
        connection.putheader("Content-Length", str(length))
        for key, value in headers.items():
            connection.putheader(key, value)
        connection.endheaders()
        connection.send(prefix)
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                connection.send(chunk)
        connection.send(suffix)
        response = connection.getresponse()
        raw = response.read()
        if response.status >= 400:
            raise ProviderFileError(
                f"Provider file upload failed with HTTP {response.status}.", 502
            )
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ProviderFileError("Provider returned an invalid file response.", 502) from exc
    except ProviderFileError:
        raise
    except (OSError, http.client.HTTPException, TimeoutError) as exc:
        raise ProviderFileError("Could not upload the document to the provider.", 502) from exc
    finally:
        connection.close()


def _upload_gemini_file(api_key: str, path: Path, filename: str) -> dict:
    mime_type = "application/pdf"
    start_url = _PROVIDER_UPLOADS["gemini-free"]
    request = urllib.request.Request(
        start_url,
        data=json.dumps({"file": {"display_name": Path(filename).name}}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(path.stat().st_size),
            "X-Goog-Upload-Header-Content-Type": mime_type,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            upload_url = response.headers.get("X-Goog-Upload-URL")
        parsed = urllib.parse.urlsplit(upload_url or "")
        if parsed.scheme != "https" or parsed.hostname != "generativelanguage.googleapis.com":
            raise ProviderFileError("Google returned an invalid upload location.", 502)
        connection = http.client.HTTPSConnection(parsed.hostname, timeout=120)
        try:
            connection.putrequest("POST", f"{parsed.path}?{parsed.query}" if parsed.query else parsed.path)
            connection.putheader("Content-Type", mime_type)
            connection.putheader("Content-Length", str(path.stat().st_size))
            connection.putheader("X-Goog-Upload-Offset", "0")
            connection.putheader("X-Goog-Upload-Command", "upload, finalize")
            connection.endheaders()
            with path.open("rb") as source:
                while chunk := source.read(1024 * 1024):
                    connection.send(chunk)
            response = connection.getresponse()
            raw = response.read()
            if response.status >= 400:
                raise ProviderFileError(
                    f"Google file upload failed with HTTP {response.status}.", 502
                )
            try:
                return json.loads(raw.decode("utf-8")).get("file", {})
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ProviderFileError("Google returned an invalid file response.", 502) from exc
        finally:
            connection.close()
    except ProviderFileError:
        raise
    except urllib.error.HTTPError as exc:
        raise ProviderFileError(
            f"Google file upload failed with HTTP {exc.code}.", 502
        ) from exc
    except (urllib.error.URLError, OSError, http.client.HTTPException, TimeoutError) as exc:
        raise ProviderFileError("Could not upload the document to Google.", 502) from exc


def upload_provider_file(
    provider_id: str, api_key: str, path: Path, filename: str
) -> dict[str, str | None]:
    if provider_id == "nvidia-nim":
        return {"file_id": None, "file_uri": None, "expires_at": None}
    if provider_id == "gemini-free":
        result = _upload_gemini_file(api_key, path, filename)
        name = result.get("name")
        uri = result.get("uri")
        if (
            not isinstance(name, str)
            or not re.fullmatch(r"files/[a-z0-9-]{1,40}", name)
            or not isinstance(uri, str)
            or urllib.parse.urlsplit(uri).scheme != "https"
            or urllib.parse.urlsplit(uri).hostname
            != "generativelanguage.googleapis.com"
        ):
            raise ProviderFileError("Google returned invalid file metadata.", 502)
        return {
            "file_id": name,
            "file_uri": uri,
            "expires_at": result.get("expirationTime"),
        }

    result = _streaming_multipart_upload(provider_id, api_key, path, filename)
    file_id = result.get("id")
    if (
        not isinstance(file_id, str)
        or not _PROVIDER_FILE_ID_PATTERNS[provider_id].fullmatch(file_id)
    ):
        raise ProviderFileError("Provider returned invalid file metadata.", 502)
    return {"file_id": file_id, "file_uri": None, "expires_at": result.get("expires_at")}


def delete_provider_file(
    provider_id: str, api_key: str, file_id: str, file_uri: str | None = None
) -> None:
    encoded_id = urllib.parse.quote(file_id, safe="/")
    if provider_id == "openai":
        url = f"https://api.openai.com/v1/files/{encoded_id}"
        headers = {"Authorization": f"Bearer {api_key}"}
    elif provider_id == "anthropic":
        url = f"https://api.anthropic.com/v1/files/{encoded_id}"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "files-api-2025-04-14",
        }
    elif provider_id == "gemini-free":
        url = (
            "https://generativelanguage.googleapis.com/v1beta/"
            f"{encoded_id}"
        )
        headers = {"x-goog-api-key": api_key}
    else:
        raise ProviderFileError("This provider does not support remote file deletion.", 400)
    try:
        _json_request(url, api_key, method="DELETE", headers=headers)
    except ProviderFileError as exc:
        if exc.provider_status != 404:
            raise


def _store_part(
    db,
    user_id: str,
    project_id: str,
    document_id: str,
    provider_id: str,
    model_id: str,
    fingerprint: str,
    source_hash: str,
    page_start: int,
    page_end: int,
    status: str,
    file_id: str | None = None,
    file_uri: str | None = None,
    expires_at: str | None = None,
    error_message: str = "",
) -> None:
    db.execute(
        """INSERT INTO provider_document_files (
               id, user_id, project_id, document_id, provider_id, model_id,
               credential_fingerprint, provider_file_id, provider_file_uri,
               source_hash, page_start, page_end, status, expires_at,
               error_message
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (
               user_id, document_id, provider_id, model_id,
               credential_fingerprint, page_start
           ) DO UPDATE SET
               provider_file_id = excluded.provider_file_id,
               provider_file_uri = excluded.provider_file_uri,
               source_hash = excluded.source_hash,
               page_end = excluded.page_end,
               status = excluded.status,
               expires_at = excluded.expires_at,
               error_message = excluded.error_message,
               consented_at = datetime('now'),
               updated_at = datetime('now')""",
        (
            str(uuid.uuid4()),
            user_id,
            project_id,
            document_id,
            provider_id,
            model_id,
            fingerprint,
            file_id,
            file_uri,
            source_hash,
            page_start,
            page_end,
            status,
            expires_at,
            error_message,
        ),
    )


def _rows_for_credential(
    db,
    user_id: str,
    document_id: str,
    provider_id: str,
    model_id: str,
    fingerprint: str,
) -> list[dict]:
    rows = db.execute(
        """SELECT * FROM provider_document_files
           WHERE user_id = ? AND document_id = ? AND provider_id = ?
             AND model_id = ? AND credential_fingerprint = ?
           ORDER BY page_start""",
        (user_id, document_id, provider_id, model_id, fingerprint),
    ).fetchall()
    return [dict(row) for row in rows]


def _complete_page_coverage(rows: list[dict]) -> bool:
    if not rows or any(row["status"] != "ready" for row in rows):
        return False
    next_page = 1
    for row in rows:
        if row["page_start"] != next_page or row["page_end"] < row["page_start"]:
            return False
        next_page = row["page_end"] + 1
    return True


def _gemini_file_expired(row: dict) -> bool:
    value = row.get("expires_at")
    if not value:
        return False
    try:
        expires_at = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= datetime.now(timezone.utc)


def authorize_document(
    db,
    user_id: str,
    document: dict,
    provider_id: str,
    model_id: str,
    api_key: str,
) -> dict:
    fingerprint = credential_fingerprint(provider_id, api_key)
    rows = _rows_for_credential(
        db, user_id, document["id"], provider_id, model_id, fingerprint
    )
    if any(row["status"] == "delete_pending" for row in rows):
        raise ProviderFileError(
            "Retry the pending provider deletion before authorizing this document again.",
            409,
        )

    source_path, source_temporary = materialize_document(document)
    try:
        source_hash = hash_file(source_path)
        if (
            rows
            and _complete_page_coverage(rows)
            and all(row["source_hash"] == source_hash for row in rows)
            and not (
                provider_id == "gemini-free"
                and any(_gemini_file_expired(row) for row in rows)
            )
        ):
            return {
                "status": "ready",
                "pageCount": rows[-1]["page_end"],
                "reused": True,
            }
        if any(
            row["status"] == "ready" and row["source_hash"] != source_hash
            for row in rows
        ):
            raise ProviderFileError(
                "The source document changed. Revoke its provider copy before uploading it again.",
                409,
            )

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix="knoprix-provider-", dir=UPLOAD_DIR
        ) as temp_name:
            work_dir = Path(temp_name)
            pdf_path = prepare_pdf(
                source_path, str(document["file_type"]), work_dir / "convert"
            )
            if provider_id == "nvidia-nim":
                page_count = len(PdfReader(str(pdf_path), strict=True).pages)
                _store_part(
                    db,
                    user_id,
                    document["project_id"],
                    document["id"],
                    provider_id,
                    model_id,
                    fingerprint,
                    source_hash,
                    1,
                    page_count,
                    "ready",
                )
                return {"status": "ready", "pageCount": page_count, "reused": False}

            parts = split_pdf(pdf_path, work_dir / "parts")
            existing_by_start = {row["page_start"]: row for row in rows}
            for part in parts:
                existing = existing_by_start.get(part["page_start"])
                if not (
                    existing
                    and existing["status"] == "ready"
                    and existing["source_hash"] == source_hash
                    and existing["page_end"] == part["page_end"]
                    and not (
                        provider_id == "gemini-free"
                        and _gemini_file_expired(existing)
                    )
                ):
                    _store_part(
                        db,
                        user_id,
                        document["project_id"],
                        document["id"],
                        provider_id,
                        model_id,
                        fingerprint,
                        source_hash,
                        part["page_start"],
                        part["page_end"],
                        "uploading",
                    )
            db.commit()
            for part in parts:
                existing = existing_by_start.get(part["page_start"])
                if (
                    existing
                    and existing["status"] == "ready"
                    and existing["source_hash"] == source_hash
                    and existing["page_end"] == part["page_end"]
                    and not (
                        provider_id == "gemini-free"
                        and _gemini_file_expired(existing)
                    )
                ):
                    continue
                name = (
                    f"{Path(document['file_name']).stem}-"
                    f"pages-{part['page_start']}-{part['page_end']}.pdf"
                )
                try:
                    uploaded = upload_provider_file(
                        provider_id, api_key, part["path"], name
                    )
                except ProviderFileError as exc:
                    _store_part(
                        db,
                        user_id,
                        document["project_id"],
                        document["id"],
                        provider_id,
                        model_id,
                        fingerprint,
                        source_hash,
                        part["page_start"],
                        part["page_end"],
                        "failed",
                        error_message=str(exc),
                    )
                    db.commit()
                    raise
                if provider_id == "gemini-free" and not uploaded["expires_at"]:
                    uploaded["expires_at"] = (
                        datetime.now(timezone.utc) + timedelta(hours=48)
                    ).isoformat()
                _store_part(
                    db,
                    user_id,
                    document["project_id"],
                    document["id"],
                    provider_id,
                    model_id,
                    fingerprint,
                    source_hash,
                    part["page_start"],
                    part["page_end"],
                    "ready",
                    file_id=uploaded["file_id"],
                    file_uri=uploaded["file_uri"],
                    expires_at=uploaded["expires_at"],
                )
                db.commit()
            return {
                "status": "ready",
                "pageCount": parts[-1]["page_end"],
                "reused": False,
            }
    finally:
        if source_temporary:
            source_path.unlink(missing_ok=True)


def authorized_provider_files(
    db,
    user_id: str,
    documents: list[dict],
    provider_id: str,
    model_id: str,
    api_key: str,
) -> dict[str, list[dict]]:
    """Require prior provider consent; refresh only expired, consented Gemini files."""
    fingerprint = credential_fingerprint(provider_id, api_key)
    result = {}
    for document in documents:
        rows = _rows_for_credential(
            db, user_id, document["id"], provider_id, model_id, fingerprint
        )
        if not _complete_page_coverage(rows):
            raise ProviderFileError(
                f"Give separate provider-specific consent for "
                f"'{document['file_name']}' and authorize it for this model first.",
                403,
            )
        source_path, source_temporary = materialize_document(document)
        try:
            source_hash = hash_file(source_path)
        finally:
            if source_temporary:
                source_path.unlink(missing_ok=True)
        if any(row["source_hash"] != source_hash for row in rows):
            raise ProviderFileError(
                f"'{document['file_name']}' changed after provider authorization. "
                "Revoke its provider copy and authorize it again.",
                409,
            )
        if provider_id == "gemini-free" and any(
            _gemini_file_expired(row) for row in rows
        ):
            authorize_document(
                db, user_id, document, provider_id, model_id, api_key
            )
            rows = _rows_for_credential(
                db, user_id, document["id"], provider_id, model_id, fingerprint
            )
            if not _complete_page_coverage(rows):
                raise ProviderFileError(
                    f"Could not refresh '{document['file_name']}' for Gemini.",
                    502,
                )
        result[document["id"]] = rows
    return result


def list_provider_documents(
    db,
    user_id: str,
    project_id: str,
    provider_id: str,
    model_id: str,
    api_key: str | None,
) -> dict:
    fingerprint = (
        credential_fingerprint(provider_id, api_key) if api_key else None
    )
    rows = db.execute(
        """SELECT f.document_id, f.page_start, f.page_end, f.status,
                  f.expires_at, f.error_message, f.credential_fingerprint,
                  d.file_name
           FROM provider_document_files f
           LEFT JOIN documents d ON d.id = f.document_id
           WHERE f.user_id = ? AND f.project_id = ? AND f.provider_id = ?
             AND f.model_id = ?
           ORDER BY f.updated_at DESC, f.page_start""",
        (user_id, project_id, provider_id, model_id),
    ).fetchall()
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for row in rows:
        item = dict(row)
        if (
            fingerprint
            and item["credential_fingerprint"] != fingerprint
            and item["status"] != "delete_pending"
        ):
            continue
        groups.setdefault(
            (
                item["document_id"],
                item["credential_fingerprint"],
                item["status"] if item["status"] == "delete_pending" else "",
            ), []
        ).append(item)

    documents = []
    pending_deletions = []
    for (document_id, _fingerprint, group_status), parts in groups.items():
        parts.sort(key=lambda part: part["page_start"])
        statuses = {part["status"] for part in parts}
        status = (
            "delete_pending"
            if "delete_pending" in statuses
            else "ready"
            if _complete_page_coverage(parts)
            else "failed"
        )
        document_status = {
            "documentId": document_id,
            "fileName": parts[0]["file_name"] or "Deleted document",
            "deletedDocument": parts[0]["file_name"] is None,
            "status": status,
            "pageCount": max(part["page_end"] for part in parts),
            "expiresAt": next(
                (part["expires_at"] for part in parts if part["expires_at"]),
                None,
            ),
            "error": next(
                (part["error_message"] for part in parts if part["error_message"]),
                "",
            ),
        }
        if group_status == "delete_pending":
            pending_deletions.append(document_status)
        elif not document_status["deletedDocument"]:
            documents.append(document_status)
    return {"documents": documents, "pendingDeletions": pending_deletions}


def revoke_document(
    db,
    user_id: str,
    document_id: str,
    provider_id: str,
    model_id: str,
    api_key: str | None,
) -> dict:
    rows = db.execute(
        """SELECT * FROM provider_document_files
           WHERE user_id = ? AND document_id = ? AND provider_id = ?
             AND model_id = ? AND status != 'revoked'""",
        (user_id, document_id, provider_id, model_id),
    ).fetchall()
    rows = [dict(row) for row in rows]
    for row in rows:
        db.execute(
            "UPDATE provider_document_files SET status = 'delete_pending', "
            "error_message = '', updated_at = datetime('now') WHERE id = ?",
            (row["id"],),
        )

    pending = 0
    for row in rows:
        if provider_id == "nvidia-nim" or not row["provider_file_id"]:
            db.execute(
                "UPDATE provider_document_files SET status = 'revoked', "
                "updated_at = datetime('now') WHERE id = ?",
                (row["id"],),
            )
            continue
        if (
            not api_key
            or credential_fingerprint(provider_id, api_key)
            != row["credential_fingerprint"]
        ):
            pending += 1
            continue
        try:
            delete_provider_file(
                provider_id,
                api_key,
                row["provider_file_id"],
                row["provider_file_uri"],
            )
        except ProviderFileError as exc:
            db.execute(
                "UPDATE provider_document_files SET error_message = ?, "
                "updated_at = datetime('now') WHERE id = ?",
                (str(exc), row["id"]),
            )
            pending += 1
        else:
            db.execute(
                "UPDATE provider_document_files SET status = 'revoked', "
                "provider_file_id = NULL, provider_file_uri = NULL, "
                "error_message = '', updated_at = datetime('now') WHERE id = ?",
                (row["id"],),
            )
    return {"revoked": pending == 0, "deletePending": pending > 0}


def retry_pending_deletions(
    db,
    user_id: str,
    provider_id: str,
    api_key: str | None,
    document_id: str | None = None,
    model_id: str | None = None,
) -> dict:
    conditions = ["user_id = ?", "provider_id = ?", "status = 'delete_pending'"]
    params: list[Any] = [user_id, provider_id]
    if document_id:
        conditions.append("document_id = ?")
        params.append(document_id)
    if model_id:
        conditions.append("model_id = ?")
        params.append(model_id)
    rows = db.execute(
        f"SELECT * FROM provider_document_files WHERE {' AND '.join(conditions)}",
        params,
    ).fetchall()

    pending = 0
    for source_row in rows:
        row = dict(source_row)
        if provider_id == "nvidia-nim" or not row["provider_file_id"]:
            db.execute(
                "UPDATE provider_document_files SET status = 'revoked', "
                "updated_at = datetime('now') WHERE id = ?",
                (row["id"],),
            )
        elif (
            not api_key
            or credential_fingerprint(provider_id, api_key)
            != row["credential_fingerprint"]
        ):
            pending += 1
        else:
            try:
                delete_provider_file(
                    provider_id,
                    api_key,
                    row["provider_file_id"],
                    row["provider_file_uri"],
                )
            except ProviderFileError as exc:
                db.execute(
                    "UPDATE provider_document_files SET error_message = ?, "
                    "updated_at = datetime('now') WHERE id = ?",
                    (str(exc), row["id"]),
                )
                pending += 1
            else:
                db.execute(
                    "UPDATE provider_document_files SET status = 'revoked', "
                    "provider_file_id = NULL, provider_file_uri = NULL, "
                    "error_message = '', updated_at = datetime('now') WHERE id = ?",
                    (row["id"],),
                )
    return {"deleted": len(rows) - pending, "deletePending": pending}
