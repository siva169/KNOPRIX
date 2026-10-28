"""Focused tests for versioned, data-preserving database migrations."""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from app import database


class DatabaseMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.database_path = Path(self.temp_dir.name) / "knoprix.db"
        self.database_config = patch.multiple(
            database, DATABASE_URL="", DB_PATH=self.database_path
        )
        self.database_config.start()
        self.addCleanup(self.database_config.stop)

    def connect(self):
        conn = sqlite3.connect(self.database_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def test_fresh_database_records_version_and_startup_is_idempotent(self):
        database.init_db()
        database.init_db()

        with closing(self.connect()) as conn:
            versions = conn.execute(
                "SELECT version, name FROM schema_migrations ORDER BY version"
            ).fetchall()
            tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }

        self.assertEqual(
            [(row["version"], row["name"]) for row in versions],
            [
                (1, "baseline-schema"),
                (2, "legacy-schema-compatibility"),
                (3, "auth-session-and-rate-limit-state"),
                (4, "contacts-sharing-and-annotation-links"),
                (5, "production-backlog-foundations"),
                (6, "precise-highlight-anchors"),
                (7, "provider-specific-document-files"),
                (8, "account-scoped-chat-history"),
                (9, "region-annotations"),
                (10, "document-share-annotation-options"),
                (11, "ai-response-favorites"),
            ],
        )
        self.assertTrue({
            "users",
            "projects",
            "documents",
            "dsa_indices",
            "auth_sessions",
            "auth_refresh_tokens",
            "auth_rate_limits",
            "contacts",
            "contact_requests",
            "user_blocks",
            "shares",
            "inbox_items",
            "bookmark_highlight_links",
            "password_reset_tokens",
            "ai_document_grants",
            "ingestion_jobs",
            "document_chunks",
            "study_artifacts",
            "data_export_jobs",
            "conversations",
            "messages",
        } <= tables)
        with closing(self.connect()) as conn:
            self.assertTrue(
                {
                    "bookmark_type",
                    "region_x",
                    "region_y",
                    "region_width",
                    "region_height",
                }.issubset(database._table_columns(conn, "bookmarks"))
            )
            self.assertTrue(
                {
                    "highlight_type",
                    "region_x",
                    "region_y",
                    "region_width",
                    "region_height",
                }.issubset(database._table_columns(conn, "highlights"))
            )
            self.assertTrue(
                {
                    "user_id",
                    "project_id",
                    "title",
                    "created_at",
                    "updated_at",
                }.issubset(database._table_columns(conn, "conversations"))
            )
            self.assertTrue(
                {
                    "conversation_id",
                    "sequence",
                    "role",
                    "content",
                    "provider_id",
                    "model_id",
                    "citations_json",
                    "created_at",
                }.issubset(database._table_columns(conn, "messages"))
            )
            self.assertTrue(
                {
                    "include_bookmarks",
                    "include_highlights",
                    "bookmark_ids_json",
                    "highlight_ids_json",
                }.issubset(database._table_columns(conn, "shares"))
            )
            self.assertTrue(
                {
                    "user_id",
                    "project_id",
                    "question",
                    "answer",
                    "citations_json",
                    "provider_id",
                    "model_id",
                }.issubset(database._table_columns(conn, "ai_favorites"))
            )
        with closing(self.connect()) as conn:
            self.assertTrue(
                {
                    "knoprix_id",
                    "allow_id_lookup",
                    "allow_contact_requests",
                    "email_notifications_enabled",
                    "google_id",
                    "avatar_url",
                }.issubset(database._table_columns(conn, "users"))
            )
            self.assertTrue(
                {
                    "ocr_text",
                    "ocr_status",
                    "tables_json",
                    "reading_order_json",
                }.issubset(database._table_columns(conn, "documents"))
            )

    def test_legacy_upgrade_preserves_records_and_cleans_old_filename_once(self):
        conn = self.connect()
        conn.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE users (
                id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL, full_name TEXT NOT NULL,
                created_at TEXT
            );
            CREATE TABLE projects (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                name TEXT NOT NULL, description TEXT DEFAULT '',
                file_count INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT,
                UNIQUE(user_id, name)
            );
            CREATE TABLE documents (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
                file_name TEXT NOT NULL, file_type TEXT NOT NULL, file_path TEXT NOT NULL,
                file_size INTEGER DEFAULT 0, page_count INTEGER DEFAULT 1,
                extracted_text TEXT DEFAULT '', extraction_method TEXT DEFAULT 'none',
                is_scanned INTEGER DEFAULT 0, is_indexed INTEGER DEFAULT 0,
                created_at TEXT
            );
            CREATE TABLE bookmarks (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                project_id TEXT NOT NULL REFERENCES projects(id),
                document_id TEXT NOT NULL REFERENCES documents(id),
                page_number INTEGER DEFAULT 1, highlighted_text TEXT DEFAULT '',
                notes TEXT DEFAULT '', color_tag TEXT DEFAULT 'yellow',
                bookmark_type TEXT DEFAULT 'text', tags_json TEXT DEFAULT '[]',
                created_at TEXT
            );
            CREATE TABLE dsa_indices (
                project_id TEXT PRIMARY KEY REFERENCES projects(id),
                trie_json TEXT, inverted_index_json TEXT,
                total_keywords INTEGER DEFAULT 0, updated_at TEXT
            );
            CREATE TABLE highlights (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                project_id TEXT NOT NULL REFERENCES projects(id),
                document_id TEXT NOT NULL REFERENCES documents(id),
                page_number INTEGER DEFAULT 1, text TEXT NOT NULL,
                color TEXT DEFAULT 'yellow', created_at TEXT
            );
            INSERT INTO users VALUES (
                'user-1', 'reader@example.com', 'hash-1', 'Reader', '2026-01-01'
            );
            INSERT INTO projects VALUES (
                'project-1', 'user-1', 'Research', '', 1, '2026-01-01', '2026-01-01'
            );
            INSERT INTO documents VALUES (
                'document-1', 'project-1', '1691234567890-a1b2c3d4-paper.pdf',
                'pdf', '/uploads/paper.pdf', 42, 2, 'source text', 'pdf',
                0, 1, '2026-01-01'
            );
            INSERT INTO bookmarks VALUES (
                'bookmark-1', 'user-1', 'project-1', 'document-1', 1, 'passage',
                'note', 'yellow', 'text', '[]', '2026-01-01'
            );
            INSERT INTO dsa_indices VALUES (
                'project-1', '{"paper": 1}', '{"paper": [1]}', 1, '2026-01-01'
            );
            INSERT INTO highlights VALUES (
                'highlight-1', 'user-1', 'project-1', 'document-1', 1,
                'passage', 'yellow', '2026-01-01'
            );
            """
        )
        conn.commit()
        conn.close()

        database.init_db()
        database.init_db()

        with closing(self.connect()) as upgraded:
            self.assertEqual(
                tuple(
                    upgraded.execute(
                        "SELECT id, email, password_hash, firebase_uid FROM users"
                    ).fetchone()
                ),
                ("user-1", "reader@example.com", "hash-1", None),
            )
            self.assertEqual(
                tuple(
                    upgraded.execute(
                        "SELECT id, user_id, name FROM projects"
                    ).fetchone()
                ),
                ("project-1", "user-1", "Research"),
            )
            self.assertEqual(
                tuple(
                    upgraded.execute(
                        "SELECT id, file_name, extracted_text FROM documents"
                    ).fetchone()
                ),
                ("document-1", "paper.pdf", "source text"),
            )
            self.assertEqual(
                tuple(
                    upgraded.execute(
                        "SELECT id, highlighted_text, name, anchor_start, bookmark_type, "
                        "region_x, region_y, region_width, region_height FROM bookmarks"
                    ).fetchone()
                ),
                ("bookmark-1", "passage", "", None, "text", None, None, None, None),
            )
            self.assertEqual(
                tuple(
                    upgraded.execute(
                        "SELECT id, text, match_all, anchor_start, anchor_end, "
                        "highlight_type, region_x, region_y, region_width, region_height "
                        "FROM highlights"
                    ).fetchone()
                ),
                ("highlight-1", "passage", 0, None, None, "text", None, None, None, None),
            )
            self.assertEqual(
                tuple(
                    upgraded.execute(
                        "SELECT project_id, trie_json, inverted_index_json FROM dsa_indices"
                    ).fetchone()
                ),
                ("project-1", '{"paper": 1}', '{"paper": [1]}'),
            )
            self.assertEqual(
                upgraded.execute(
                    "SELECT COUNT(*) FROM schema_migrations WHERE version = 2"
                ).fetchone()[0],
                1,
            )
            migrated_user = upgraded.execute(
                "SELECT knoprix_id, allow_id_lookup, allow_contact_requests, "
                "email_notifications_enabled FROM users WHERE id = ?",
                ("user-1",),
            ).fetchone()
            self.assertRegex(migrated_user["knoprix_id"], r"^KP-[0-9A-HJKMNP-TV-Z]{10}$")
            self.assertEqual(
                tuple(migrated_user[1:]),
                (1, 1, 0),
            )
            with self.assertRaises(sqlite3.IntegrityError):
                upgraded.execute(
                    """INSERT INTO users
                       (id, email, password_hash, full_name, knoprix_id)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        "user-2",
                        "second@example.com",
                        "hash-2",
                        "Reader Two",
                        migrated_user["knoprix_id"],
                    ),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                upgraded.execute(
                    "UPDATE users SET knoprix_id = NULL WHERE id = ?", ("user-1",)
                )
            upgraded.execute(
                """
                INSERT INTO bookmark_highlight_links
                    (bookmark_id, highlight_id, user_id, document_id, page_number)
                VALUES (?, ?, ?, ?, ?)
                """,
                ("bookmark-1", "highlight-1", "user-1", "document-1", 1),
            )
            upgraded.execute(
                "DELETE FROM highlights WHERE id = ?", ("highlight-1",)
            )
            self.assertEqual(
                upgraded.execute(
                    "SELECT COUNT(*) FROM bookmarks WHERE id = ?", ("bookmark-1",)
                ).fetchone()[0],
                1,
            )
            self.assertEqual(
                upgraded.execute(
                    "SELECT COUNT(*) FROM bookmark_highlight_links"
                ).fetchone()[0],
                0,
            )

    def test_failed_migration_rolls_back_changes_and_is_not_recorded(self):
        def fail_after_schema_change(conn):
            conn.execute("CREATE TABLE migration_partial (id TEXT PRIMARY KEY)")
            raise RuntimeError("simulated migration failure")

        with patch.object(
            database,
            "MIGRATIONS",
            ((2, "failing-test-migration", fail_after_schema_change),),
            create=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "simulated migration failure"):
                database.init_db()

        with closing(self.connect()) as conn:
            tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            recorded = conn.execute(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 2"
            ).fetchone()[0]

        self.assertNotIn("migration_partial", tables)
        self.assertEqual(recorded, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
