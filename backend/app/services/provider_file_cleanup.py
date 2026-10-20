"""Cleanup of provider files created by the retired full-document feature."""
from __future__ import annotations

import hashlib
import hmac
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from ..config import cfg

_PROVIDER_FILE_DELETE_URLS = {
    "openai": "https://api.openai.com/v1/files",
    "anthropic": "https://api.anthropic.com/v1/files",
    "gemini-free": "https://generativelanguage.googleapis.com/v1beta",
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


def _json_request(url: str, headers: dict[str, str]) -> None:
    request = urllib.request.Request(
        url,
        headers={"Content-Type": "application/json", **headers},
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(request, timeout=120):
            return
    except urllib.error.HTTPError as exc:
        raise ProviderFileError(
            f"Provider file deletion failed with HTTP {exc.code}.",
            502,
            provider_status=exc.code,
        ) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ProviderFileError("Could not reach the provider file service.", 502) from exc


def delete_provider_file(
    provider_id: str, api_key: str, file_id: str
) -> None:
    base_url = _PROVIDER_FILE_DELETE_URLS.get(provider_id)
    if base_url is None:
        raise ProviderFileError("This provider does not support remote file deletion.", 400)
    encoded_id = urllib.parse.quote(file_id, safe="/")
    if provider_id == "openai":
        headers = {"Authorization": f"Bearer {api_key}"}
    elif provider_id == "anthropic":
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "files-api-2025-04-14",
        }
    else:
        headers = {"x-goog-api-key": api_key}
    try:
        _json_request(f"{base_url}/{encoded_id}", headers)
    except ProviderFileError as exc:
        if exc.provider_status != 404:
            raise


def _complete_page_coverage(rows: list[dict]) -> bool:
    if not rows or any(row["status"] != "ready" for row in rows):
        return False
    next_page = 1
    for row in rows:
        if row["page_start"] != next_page or row["page_end"] < row["page_start"]:
            return False
        next_page = row["page_end"] + 1
    return True


def list_provider_documents(
    db,
    user_id: str,
    project_id: str,
    provider_id: str,
    model_id: str,
    api_key: str | None,
) -> dict:
    fingerprint = credential_fingerprint(provider_id, api_key) if api_key else None
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
            ),
            [],
        ).append(item)

    documents = []
    pending_deletions = []
    for (document_id, _fingerprint, group_status), parts in groups.items():
        parts.sort(key=lambda part: part["page_start"])
        statuses = {part["status"] for part in parts}
        status = (
            "delete_pending"
            if "delete_pending" in statuses
            else "revoked"
            if statuses == {"revoked"}
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
            delete_provider_file(provider_id, api_key, row["provider_file_id"])
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
                delete_provider_file(provider_id, api_key, row["provider_file_id"])
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
