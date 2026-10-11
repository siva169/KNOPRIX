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
            [(1, "baseline-schema"), (2, "legacy-schema-compatibility")],
        )
        self.assertTrue({"users", "projects", "documents", "dsa_indices"} <= tables)

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
                        "SELECT id, highlighted_text, name, anchor_start FROM bookmarks"
                    ).fetchone()
                ),
                ("bookmark-1", "passage", "", None),
            )
            self.assertEqual(
                tuple(
                    upgraded.execute(
                        "SELECT id, text, match_all FROM highlights"
                    ).fetchone()
                ),
                ("highlight-1", "passage", 0),
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
