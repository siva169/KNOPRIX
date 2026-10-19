"""Focused regression checks for precise persisted text highlights."""
import sqlite3
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app import database
from app.routers.highlights import HighlightBody, create_highlight, list_highlights


USER = {"id": "user-1"}
PROJECT_ID = "project-1"
DOCUMENT_ID = "document-1"


class HighlightApiTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(database.SCHEMA)
        self.database_url_patch = patch.object(database, "DATABASE_URL", "")
        self.database_url_patch.start()
        self.addCleanup(self.database_url_patch.stop)
        database._create_contacts_sharing_schema(self.db)
        database._add_precise_highlight_anchors(self.db)
        self.db.execute(
            "INSERT INTO users (id, email, password_hash, full_name, knoprix_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (USER["id"], "user@example.com", "hash", "Test User", "KP-AAAAAAAAAA"),
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

    def test_precise_highlight_offsets_survive_create_and_list(self):
        created = create_highlight(
            HighlightBody(
                projectId=PROJECT_ID,
                documentId=DOCUMENT_ID,
                pageNumber=1,
                text="duplicate anchor",
                color="blue",
                selectionStart=31,
                selectionEnd=47,
            ),
            USER,
            self.db,
        )

        saved = list_highlights(DOCUMENT_ID, USER, self.db)["highlights"]
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["id"], created["id"])
        self.assertEqual(saved[0]["anchor_start"], 31)
        self.assertEqual(saved[0]["anchor_end"], 47)

    def test_rejects_incomplete_or_reversed_precise_ranges(self):
        common = {
            "projectId": PROJECT_ID,
            "documentId": DOCUMENT_ID,
            "pageNumber": 1,
            "text": "selection",
        }
        with self.assertRaisesRegex(HTTPException, "supplied together"):
            create_highlight(HighlightBody(**common, selectionStart=2), USER, self.db)
        with self.assertRaisesRegex(HTTPException, "greater than"):
            create_highlight(
                HighlightBody(**common, selectionStart=8, selectionEnd=8), USER, self.db
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
