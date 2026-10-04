"""Document storage backends.

Local disk remains the default for development. Production deployments use
Supabase Storage through its native REST API — no AWS S3 signing layer, no
boto3, no gateway compatibility quirks.

Objects are addressed by an opaque key like "documents/<doc-id>/<name>".
Database rows store "s3://<key>"; the prefix is historical and acts purely as
a marker that the file lives in object storage.
"""
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

from ..config import cfg


class StorageError(RuntimeError):
    """Raised when object storage is misconfigured or rejects a request."""


def enabled() -> bool:
    return cfg.OBJECT_STORAGE_ENABLED


def _base_url() -> str:
    """Normalize the configured endpoint to the storage REST base.

    Accepts the project URL (https://<ref>.supabase.co), the storage base
    (https://<ref>.supabase.co/storage/v1), or a pasted S3 gateway URL
    (https://<ref>.supabase.co/storage/v1/s3) — the /s3 suffix is stripped.
    """
    base = cfg.OBJECT_STORAGE_ENDPOINT.strip().rstrip("/")
    if base.endswith("/s3"):
        base = base[: -len("/s3")]
    if not base:
        raise StorageError("OBJECT_STORAGE_ENDPOINT is not configured")
    if "/storage/v1" not in base:
        base = f"{base}/storage/v1"
    return base


def _open(method: str, path: str, body=None, content_type: str | None = None,
          length: int | None = None):
    key = cfg.OBJECT_STORAGE_API_KEY
    if not key:
        raise StorageError("OBJECT_STORAGE_API_KEY is not configured")
    url = f"{_base_url()}/{quote(path, safe='/')}"
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
    }
    if content_type:
        headers["Content-Type"] = content_type
    if length is not None:
        headers["Content-Length"] = str(length)
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        return urllib.request.urlopen(request, timeout=120)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300].strip()
        exc.close()
        raise StorageError(
            f"Supabase Storage returned HTTP {exc.code} for {method} /{path}: {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise StorageError(
            f"Could not reach Supabase Storage for {method} /{path}: {exc.reason}"
        ) from exc


def _read(method: str, path: str, body=None, content_type: str | None = None) -> bytes:
    with _open(method, path, body, content_type) as response:
        return response.read()


def object_key(document_id: str, file_name: str) -> str:
    return f"documents/{document_id}/{Path(file_name).name}"


def upload(path: Path, key: str, content_type: str | None = None) -> None:
    """Upload a file, streaming from disk so large documents never sit in RAM."""
    url_path = f"object/{cfg.OBJECT_STORAGE_BUCKET}/{key}"
    with path.open("rb") as source:
        response = _open(
            "POST",
            url_path,
            body=source,
            content_type=content_type or "application/octet-stream",
            length=path.stat().st_size,
        )
        response.read()
        response.close()


def download(key: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = _read("GET", f"object/{cfg.OBJECT_STORAGE_BUCKET}/{key}")
    destination.write_bytes(data)


def delete(key: str) -> None:
    _read("DELETE", f"object/{cfg.OBJECT_STORAGE_BUCKET}/{key}")


def stream(key: str):
    """Return an iterator of bytes chunks suitable for StreamingResponse."""
    response = _open("GET", f"object/{cfg.OBJECT_STORAGE_BUCKET}/{key}")

    def chunks():
        try:
            while True:
                block = response.read(256 * 1024)
                if not block:
                    break
                yield block
        finally:
            response.close()

    return chunks()
