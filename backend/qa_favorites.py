"""Focused ownership and persistence checks for AI response favorites."""
import sqlite3
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app import database
from app.routers import favorites


class FavoritesTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(database.SCHEMA)
        with patch.object(database, "DATABASE_URL", ""):
            database._create_auth_session_schema(self.db)
            database._create_contacts_sharing_schema(self.db)
            database._create_production_backlog_schema(self.db)
            database._add_region_annotation_columns(self.db)
            database._create_chat_history_schema(self.db)
            database._create_ai_favorites_schema(self.db)
        self.db.execute(
            "INSERT INTO users (id, email, password_hash, full_name, knoprix_id) VALUES (?, ?, ?, ?, ?)",
            ("user-a", "a@example.com", "hash", "Reader", "KP-AAAAAAAAAA"),
        )
        self.db.execute(
            "INSERT INTO users (id, email, password_hash, full_name, knoprix_id) VALUES (?, ?, ?, ?, ?)",
            ("user-b", "b@example.com", "hash", "Other", "KP-BBBBBBBBBB"),
        )
        self.db.execute(
            "INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
            ("project-a", "user-a", "Research"),
        )
        self.users = {"user-a": {"id": "user-a"}, "user-b": {"id": "user-b"}}

    def tearDown(self):
        self.db.close()

    def test_favorite_round_trip_and_owner_delete(self):
        created = favorites.create_favorite(
            favorites.FavoriteCreateBody(
                projectId="project-a",
                question="What is the key idea?",
                answer="The key idea is evidence.",
                citations=[{"documentId": "doc-a", "pageNumber": 2}],
                providerId="zai-glm-free",
                modelId="glm-4.5-flash",
            ),
            self.users["user-a"],
            self.db,
        )["favorite"]
        listed = favorites.list_favorites(
            projectId="project-a", user=self.users["user-a"], db=self.db
        )["favorites"]
        self.assertEqual(listed[0]["id"], created["id"])
        self.assertEqual(listed[0]["citations"][0]["pageNumber"], 2)
        with self.assertRaises(HTTPException) as wrong_owner:
            favorites.delete_favorite(created["id"], self.users["user-b"], self.db)
        self.assertEqual(wrong_owner.exception.status_code, 404)
        favorites.delete_favorite(created["id"], self.users["user-a"], self.db)
        self.assertEqual(
            favorites.list_favorites(user=self.users["user-a"], db=self.db)["favorites"],
            [],
        )

    def test_favorite_requires_owned_project_and_bounded_answer(self):
        with self.assertRaises(HTTPException) as missing_project:
            favorites.create_favorite(
                favorites.FavoriteCreateBody(
                    projectId="missing",
                    question="Question",
                    answer="Answer",
                ),
                self.users["user-a"],
                self.db,
            )
        self.assertEqual(missing_project.exception.status_code, 404)
        with self.assertRaises(ValueError):
            favorites.FavoriteCreateBody(
                question="Question",
                answer="x" * 30_001,
            )

    def test_account_delete_cascade_removes_favorites(self):
        favorites.create_favorite(
            favorites.FavoriteCreateBody(
                question="Question",
                answer="Answer",
            ),
            self.users["user-a"],
            self.db,
        )
        self.db.execute("DELETE FROM users WHERE id = ?", ("user-a",))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ai_favorites").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
