"""Focused regression checks for precise persisted text highlights."""
import sqlite3
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app import database
from app.routers.highlights import (
    HighlightBody,
    HighlightColorBody,
    create_highlight,
    list_highlights,
    update_highlight_color,
)


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
        database._add_region_annotation_columns(self.db)
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

    def test_updates_color_without_changing_the_saved_anchor(self):
        created = create_highlight(
            HighlightBody(
                projectId=PROJECT_ID,
                documentId=DOCUMENT_ID,
                pageNumber=1,
                text="selection",
                selectionStart=4,
                selectionEnd=13,
            ),
            USER,
            self.db,
        )

        updated = update_highlight_color(
            created["id"], HighlightColorBody(color="green"), USER, self.db
        )

        saved = list_highlights(DOCUMENT_ID, USER, self.db)["highlights"][0]
        self.assertEqual(updated, {"id": created["id"], "color": "green"})
        self.assertEqual(saved["color"], "green")
        self.assertEqual(saved["anchor_start"], 4)
        self.assertEqual(saved["anchor_end"], 13)

    def test_color_update_rejects_invalid_colors_and_foreign_highlights(self):
        created = create_highlight(
            HighlightBody(
                projectId=PROJECT_ID,
                documentId=DOCUMENT_ID,
                pageNumber=1,
                text="selection",
            ),
            USER,
            self.db,
        )
        with self.assertRaisesRegex(HTTPException, "Invalid color"):
            update_highlight_color(
                created["id"], HighlightColorBody(color="ultraviolet"), USER, self.db
            )
        with self.assertRaisesRegex(HTTPException, "Highlight not found"):
            update_highlight_color(
                created["id"], HighlightColorBody(color="green"), {"id": "other-user"}, self.db
            )

    def test_region_highlight_persists_independently_of_text(self):
        created = create_highlight(
            HighlightBody(
                projectId=PROJECT_ID,
                documentId=DOCUMENT_ID,
                pageNumber=2,
                highlightType="region",
                region={"x": 0.15, "y": 0.25, "width": 0.4, "height": 0.5},
                color="purple",
            ),
            USER,
            self.db,
        )

        saved = list_highlights(DOCUMENT_ID, USER, self.db)["highlights"][0]

        self.assertEqual(saved["id"], created["id"])
        self.assertEqual(saved["highlight_type"], "region")
        self.assertEqual(saved["text"], "")
        self.assertEqual(saved["color"], "purple")
        self.assertEqual(
            tuple(saved[key] for key in (
                "region_x", "region_y", "region_width", "region_height"
            )),
            (0.15, 0.25, 0.4, 0.5),
        )

    def test_region_highlight_rejects_missing_or_out_of_bounds_geometry(self):
        common = {
            "projectId": PROJECT_ID,
            "documentId": DOCUMENT_ID,
            "pageNumber": 1,
            "highlightType": "region",
        }
        for region in (
            None,
            {"x": 0.1, "y": 0.2, "width": 0.3},
            {"x": 0.8, "y": 0.9, "width": 0.3, "height": 0.2},
            {"x": 0.1, "y": 0.2, "width": -0.1, "height": 0.2},
            {"x": 0.1, "y": float("inf"), "width": 0.3, "height": 0.2},
        ):
            with self.subTest(region=region), self.assertRaises(ValidationError):
                HighlightBody(**common, region=region)


if __name__ == "__main__":
    unittest.main(verbosity=2)
