"""Seed — demo account + import the user's copied documents into an MSA project.

Idempotent: re-runs on every server start but skips docs already imported.
"""
import re
import uuid

from .config import UPLOAD_DIR
from .database import connect
from .security import hash_password
from .services.indexer import rebuild_project_indices
from .services.pdf_parser import extract_document

PREFIX_RE = re.compile(r"^\d+-\d+-")


def _original_name(fname: str) -> str:
    return PREFIX_RE.sub("", fname)


def seed() -> None:
    conn = connect()
    try:
        demo = conn.execute(
            "SELECT id FROM users WHERE email = 'demo@knoprix.io'"
        ).fetchone()
        if demo is None:
            demo_id = "user-demo-1"
            conn.execute(
                "INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)",
                (demo_id, "demo@knoprix.io", hash_password("Password123!"), "Alex Mercer"),
            )
        else:
            demo_id = demo["id"]

        proj = conn.execute(
            "SELECT id FROM projects WHERE user_id = ? AND name = 'MSA'",
            (demo_id,),
        ).fetchone()
        if proj is None:
            project_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO projects (id, user_id, name, description) VALUES (?, ?, ?, ?)",
                (project_id, demo_id, "MSA", "My study documents"),
            )
        else:
            project_id = proj["id"]

        # Group uploads by original filename, keep the latest upload of each
        groups: dict[str, tuple[int, object]] = {}
        if UPLOAD_DIR.exists():
            for f in UPLOAD_DIR.iterdir():
                if not f.is_file() or f.name.startswith("."):
                    continue
                name = f.name
                ts = int(name.split("-")[0]) if name.split("-")[0].isdigit() else 0
                orig = _original_name(name)
                if orig not in groups or ts > groups[orig][0]:
                    groups[orig] = (ts, f)

        existing = {
            r["file_name"]
            for r in conn.execute(
                "SELECT file_name FROM documents WHERE project_id = ?", (project_id,)
            )
        }

        for orig, (_ts, path) in groups.items():
            if orig in existing:
                continue
            ext = path.suffix.lower().lstrip(".")
            parsed = extract_document(path, ext)
            doc_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO documents (id, project_id, file_name, file_type, file_path,
                                       file_size, page_count, extracted_text,
                                       extraction_method, is_scanned)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (doc_id, project_id, orig, ext, str(path),
                 path.stat().st_size, parsed["page_count"], parsed["text"],
                 parsed["method"], 1 if parsed["is_scanned"] else 0),
            )
            for i, page_text in enumerate(parsed["pages"], start=1):
                conn.execute(
                    "INSERT INTO document_pages (id, document_id, page_number, page_text) VALUES (?, ?, ?, ?)",
                    (str(uuid.uuid4()), doc_id, i, page_text),
                )

        rebuild_project_indices(conn, project_id)
        conn.commit()
    finally:
        conn.close()
