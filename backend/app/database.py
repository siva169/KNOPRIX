"""Persistence for Knoprix.

Two backends, same API:

- SQLite (local dev): when `DATABASE_URL` is not set, uses `knoprix.db`.
- PostgreSQL (deployed): when `DATABASE_URL` is set (Neon / Render Postgres),
  uses psycopg2 with RealDictCursor. The routers keep calling
  `db.execute(sql, params).fetchall()` etc. exactly as with sqlite3 — this
  module translates the tiny dialect differences (`?` → `%s`, `datetime('now')`
  → `now()`, drops `PRAGMA`).

Why: hosts like Render's free tier use an ephemeral disk that wipes a local
SQLite file on every restart, silently deleting user accounts and documents.
A persistent Postgres database survives restarts.
"""
import sqlite3

from .config import DATABASE_URL, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    file_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    page_count INTEGER DEFAULT 1,
    extracted_text TEXT DEFAULT '',
    extraction_method TEXT DEFAULT 'none',
    is_scanned INTEGER DEFAULT 0,
    is_indexed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_pages (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    page_text TEXT DEFAULT '',
    UNIQUE(document_id, page_number)
);

-- bookmarks are ordered by the bookmark collection. bookmark_type: 'text'
-- (highlighted passage) or 'page' (whole page bookmarked).
CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER DEFAULT 1,
    highlighted_text TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    color_tag TEXT DEFAULT 'yellow',
    bookmark_type TEXT DEFAULT 'text',
    tags_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dsa_indices (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    trie_json TEXT,
    inverted_index_json TEXT,
    total_keywords INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- highlights = saved color markers on document text (a SEPARATE feature from
-- bookmarks — highlights never touch the bookmark collection). color: one of
-- yellow | green | blue | pink | orange | purple (marker palette).
CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER DEFAULT 1,
    text TEXT NOT NULL,
    color TEXT DEFAULT 'yellow',
    match_all INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
"""


# ── Postgres glue ────────────────────────────────────────────────────────────
def _translate_sql(sql: str) -> str | None:
    """Convert sqlite-flavoured SQL to Postgres. Returns None for no-op PRAGMAs.

    - `?` placeholders become psycopg2's `%s`
    - literal `%` (e.g. inside LIKE patterns) is escaped to `%%` so psycopg2
      doesn't mistake it for a placeholder
    - `datetime('now')` becomes Postgres `now()`
    """
    stripped = sql.strip()
    if stripped.upper().startswith("PRAGMA"):
        return None
    out = []
    in_str = False
    for ch in sql:
        if ch == "'":
            in_str = not in_str
            out.append(ch)
        elif not in_str and ch == "?":
            out.append("%s")  # placeholder — not re-scanned below
        elif ch == "%":
            # psycopg2 treats % as a placeholder even inside string literals,
            # so escape every literal % (e.g. LIKE 'foo%') to %%.
            out.append("%%")
        else:
            out.append(ch)
    return "".join(out).replace("datetime('now')", "now()")


class _EmptyResult:
    def fetchone(self):
        return None

    def fetchall(self):
        return []


class PgConnection:
    """psycopg2 connection exposing the sqlite3-style API the app uses."""

    def __init__(self, conn):
        self._conn = conn
        self._cur = None

    def execute(self, sql: str, params: tuple | None = None):
        translated = _translate_sql(sql)
        if translated is None:
            return _EmptyResult()
        if self._cur is not None:
            try:
                self._cur.close()
            except Exception:
                pass
        cur = self._conn.cursor()
        cur.execute(translated, params if params is not None else ())
        self._cur = cur
        return cur

    def executescript(self, script: str):
        for stmt in script.split(";"):
            stmt = stmt.strip()
            if stmt:
                self.execute(stmt)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        try:
            if self._cur is not None:
                self._cur.close()
        except Exception:
            pass
        self._conn.close()


def connect():
    if DATABASE_URL:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        return PgConnection(conn)

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        if DATABASE_URL:
            rows = conn.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'highlights'"
            ).fetchall()
            cols = [r["column_name"] for r in rows]
        else:
            cols = [c[1] for c in conn.execute("PRAGMA table_info(highlights)").fetchall()]
        # Migration for DBs created before the match_all column existed.
        if "match_all" not in cols:
            conn.execute("ALTER TABLE highlights ADD COLUMN match_all INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    finally:
        conn.close()


def get_db():
    """FastAPI dependency — one connection per request."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
