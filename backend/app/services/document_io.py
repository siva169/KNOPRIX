"""Materialize owner-authorized source documents for backend processing."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from ..config import UPLOAD_DIR
from . import storage

OBJECT_URI_PREFIXES = ("s3://", "r2://")


def object_key(file_path: str) -> str | None:
    for prefix in OBJECT_URI_PREFIXES:
        if file_path.startswith(prefix):
            return file_path[len(prefix):]
    return None


def resolve_document_path(document: dict) -> Path:
    stored_path = str(document["file_path"] or "")
    path = Path(stored_path.replace("\\", "/"))
    if not path.exists():
        path = UPLOAD_DIR / path.name
    return path


def materialize_document(document: dict) -> tuple[Path, bool]:
    """Return a readable path and whether the caller owns the temporary file."""
    key = object_key(str(document["file_path"]))
    if storage.enabled() and key:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        suffix = f".{str(document['file_type']).lower().lstrip('.')}"
        fd, temp_name = tempfile.mkstemp(
            prefix="knoprix-document-", suffix=suffix, dir=UPLOAD_DIR
        )
        os.close(fd)
        temp_path = Path(temp_name)
        try:
            storage.download(key, temp_path)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise
        return temp_path, True
    return resolve_document_path(document), False
