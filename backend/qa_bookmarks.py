"""Focused regression checks for bookmark naming, search, and schema upgrades."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import database
from app.routers.bookmarks import BookmarkBody, create_bookmark, list_bookmarks


USER = {"id": "user-1"}
PROJECT_ID = "project-1"
DOCUMENT_ID = "document-1"


class BookmarkApiTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(database.SCHEMA)
        self.db.execute(
            "INSERT INTO users (id, email, password_hash, full_name) "
            "VALUES (?, ?, ?, ?)",
            (USER["id"], "user@example.com", "hash", "Test User"),
        )
        self.db.execute(
            "INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
            (PROJECT_ID, USER["id"], "Project"),
        )
        self.db.execute(
            "INSERT INTO documents (id, project_id, file_name, file_type, file_path) "
            "VALUES (?, ?, ?, ?, ?)",
            (DOCUMENT_ID, PROJECT_ID, "Notes.pdf", "pdf", "notes.pdf"),
        )

    def tearDown(self):
        self.db.close()

    def create(self, **overrides):
        values = {
            "projectId": PROJECT_ID,
            "documentId": DOCUMENT_ID,
            "pageNumber": 1,
            "highlightedText": "Selected passage",
        }
        values.update(overrides)
        return create_bookmark(BookmarkBody(**values), USER, self.db)

    def test_bookmark_name_is_optional_and_saved_when_supplied(self):
        unnamed = self.create()
        named = self.create(
            name="  Key idea  ",
            selectionStart=12,
            selectionEnd=25,
        )

        rows = self.db.execute(
            "SELECT id, name, anchor_start, anchor_end "
            "FROM bookmarks ORDER BY created_at, id"
        ).fetchall()

        self.assertEqual(rows[0]["id"], unnamed["id"])
        self.assertEqual(rows[0]["name"], "")
        self.assertIsNone(rows[0]["anchor_start"])
        self.assertIsNone(rows[0]["anchor_end"])
        self.assertEqual(rows[1]["id"], named["id"])
        self.assertEqual(rows[1]["name"], "Key idea")
        self.assertEqual(rows[1]["anchor_start"], 12)
        self.assertEqual(rows[1]["anchor_end"], 25)

    def test_search_matches_name_selected_text_and_notes_case_insensitively(self):
        named = self.create(name="Quantum Notes", highlightedText="Entanglement")
        passage = self.create(name="Architecture", highlightedText="Concurrency model")
        note = self.create(name="Review", highlightedText="Summary", notes="Quantum systems")

        self.assertEqual(
            [
                b["id"]
                for b in list_bookmarks(
                    PROJECT_ID, user=USER, db=self.db, q="QUANTUM"
                )["bookmarks"]
            ],
            [note["id"], named["id"]],
        )
        self.assertEqual(
            [
                b["id"]
                for b in list_bookmarks(
                    PROJECT_ID, user=USER, db=self.db, q="entangle"
                )["bookmarks"]
            ],
            [named["id"]],
        )
        self.assertEqual(
            [
                b["id"]
                for b in list_bookmarks(
                    PROJECT_ID, user=USER, db=self.db, q="concurrency"
                )["bookmarks"]
            ],
            [passage["id"]],
        )

    def test_search_treats_percent_and_underscore_as_literal_characters(self):
        matching = self.create(highlightedText="100%_done")
        self.create(highlightedText="100XXdone")

        results = list_bookmarks(
            PROJECT_ID, user=USER, db=self.db, q="100%_done"
        )["bookmarks"]

        self.assertEqual([b["id"] for b in results], [matching["id"]])


class BookmarkMigrationTests(unittest.TestCase):
    def test_init_db_adds_bookmark_fields_without_losing_existing_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "legacy.db"
            conn = sqlite3.connect(database_path)
            conn.execute(
                """
                CREATE TABLE bookmarks (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    page_number INTEGER DEFAULT 1,
                    highlighted_text TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    color_tag TEXT DEFAULT 'yellow',
                    bookmark_type TEXT DEFAULT 'text',
                    tags_json TEXT DEFAULT '[]',
                    created_at TEXT DEFAULT (datetime('now'))
                )
                """
            )
            conn.execute(
                "INSERT INTO bookmarks (id, user_id, project_id, document_id, "
                "page_number, highlighted_text) VALUES (?, ?, ?, ?, ?, ?)",
                ("existing", USER["id"], PROJECT_ID, DOCUMENT_ID, 4, "Keep me"),
            )
            conn.commit()
            conn.close()

            with patch.object(database, "DATABASE_URL", None), patch.object(
                database, "DB_PATH", str(database_path)
            ):
                database.init_db()

            conn = sqlite3.connect(database_path)
            columns = {
                row[1] for row in conn.execute("PRAGMA table_info(bookmarks)").fetchall()
            }
            row = conn.execute(
                "SELECT page_number, highlighted_text, name FROM bookmarks WHERE id = ?",
                ("existing",),
            ).fetchone()
            conn.close()

        self.assertTrue({"name", "anchor_start", "anchor_end"}.issubset(columns))
        self.assertEqual(row, (4, "Keep me", ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)
