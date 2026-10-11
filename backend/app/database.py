"""Persistence for Knoprix.


Two backends, same API:

- SQLite (local dev): when `DATABASE_URL` is not set, uses `knoprix.db`.
- PostgreSQL (deployed): when `DATABASE_URL` is set (Supabase / Render Postgres),
  uses psycopg2 with RealDictCursor. The routers keep calling
  `db.execute(sql, params).fetchall()` etc. exactly as with sqlite3 — this
  module translates the tiny dialect differences (`?` → `%s`, `datetime('now')`
  → `now()`, drops `PRAGMA`).

Why: hosts like Render's free tier use an ephemeral disk that wipes a local
SQLite file on every restart, silently deleting user accounts and documents.
A persistent Postgres database survives restarts.
"""
import re
import sqlite3

from .config import DATABASE_URL, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    firebase_uid TEXT,
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
    name TEXT NOT NULL DEFAULT '',
    highlighted_text TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    color_tag TEXT DEFAULT 'yellow',
    bookmark_type TEXT DEFAULT 'text',
    tags_json TEXT DEFAULT '[]',
    anchor_start INTEGER,
    anchor_end INTEGER,
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


def _scrub_params(params):
    """Postgres TEXT cannot contain NUL (0x00) — psycopg2 raises
    'ValueError: A string literal cannot contain NUL (0x00) characters.'
    pypdf extraction can emit NULs from malformed font/encoding tables in
    real-world PDFs, so scrub them from every string parameter before it
    reaches the driver. SQLite tolerates NULs, which is why this only
    bites in production.
    """
    if isinstance(params, (tuple, list)):
        return tuple(p.replace("\x00", "") if isinstance(p, str) else p for p in params)
    return params


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
        cur.execute(translated, _scrub_params(params) if params is not None else ())
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


_PREFIX_RE = re.compile(r"^\d+-[0-9a-f]{8}-(.+)$")


def _clean_legacy_file_names(conn) -> None:
    rows = conn.execute("SELECT id, file_name FROM documents").fetchall()
    for r in rows:
        m = _PREFIX_RE.match(r["file_name"] or "")
        if m:
            conn.execute(
                "UPDATE documents SET file_name = ? WHERE id = ?",
                (m.group(1), r["id"]),
            )


def _create_base_schema(conn) -> None:
    for statement in SCHEMA.split(";"):
        if statement.strip():
            conn.execute(statement)


def _table_columns(conn, table_name: str) -> set[str]:
    if DATABASE_URL:
        rows = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = ?",
            (table_name,),
        ).fetchall()
        return {row["column_name"] for row in rows}
    return {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }


def _migrate_legacy_schema(conn) -> None:
    user_columns = _table_columns(conn, "users")
    highlight_columns = _table_columns(conn, "highlights")
    bookmark_columns = _table_columns(conn, "bookmarks")

    if "firebase_uid" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN firebase_uid TEXT")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid "
        "ON users(firebase_uid)"
    )
    if "match_all" not in highlight_columns:
        conn.execute(
            "ALTER TABLE highlights ADD COLUMN match_all INTEGER NOT NULL DEFAULT 0"
        )
    if "name" not in bookmark_columns:
        conn.execute(
            "ALTER TABLE bookmarks ADD COLUMN name TEXT NOT NULL DEFAULT ''"
        )
    if "anchor_start" not in bookmark_columns:
        conn.execute("ALTER TABLE bookmarks ADD COLUMN anchor_start INTEGER")
    if "anchor_end" not in bookmark_columns:
        conn.execute("ALTER TABLE bookmarks ADD COLUMN anchor_end INTEGER")
    # Preserve the existing cleanup for timestamp-prefixed legacy filenames.
    _clean_legacy_file_names(conn)


def _create_auth_session_schema(conn) -> None:
    for statement in (
        """CREATE TABLE IF NOT EXISTS auth_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            revoked_at INTEGER
        )""",
        """CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
            ON auth_sessions(user_id, revoked_at, expires_at)""",
        """CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
            token_hash TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            used_at INTEGER
        )""",
        """CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_session
            ON auth_refresh_tokens(session_id)""",
        """CREATE TABLE IF NOT EXISTS auth_rate_limits (
            bucket_key TEXT PRIMARY KEY,
            window_start INTEGER NOT NULL,
            attempts INTEGER NOT NULL
        )""",
        """CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window
            ON auth_rate_limits(window_start)""",
    ):
        conn.execute(statement)


# Migration versions are append-only; never edit a migration after it is released.
MIGRATIONS = (
    (1, "baseline-schema", _create_base_schema),
    (2, "legacy-schema-compatibility", _migrate_legacy_schema),
    (3, "auth-session-and-rate-limit-state", _create_auth_session_schema),
)


def _apply_migrations(conn) -> None:
    for version, name, migrate in MIGRATIONS:
        try:
            if DATABASE_URL:
                conn.execute("LOCK TABLE schema_migrations IN EXCLUSIVE MODE")
            else:
                conn.execute("BEGIN IMMEDIATE")

            applied = conn.execute(
                "SELECT version FROM schema_migrations WHERE version = ?",
                (version,),
            ).fetchone()
            if applied is not None:
                conn.commit()
                continue

            migrate(conn)
            conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                (version, name),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def init_db():
    conn = connect()
    try:
        if DATABASE_URL:
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtext(?))",
                ("knoprix.schema_migrations",),
            )
        else:
            conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        _apply_migrations(conn)
    except Exception:
        conn.rollback()
        raise
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
