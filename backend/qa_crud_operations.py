"""Focused regression checks for Document rename, Project cascade file cleanup, and Conversation search."""
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import database
from app.routers.conversations import list_conversations
from app.routers.documents import DocumentUpdateBody, update_document
from app.routers.projects import delete_project
from app.security import hash_password


class CrudOperationsTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test.db"
        self.database_url_patch = patch.object(database, "DATABASE_URL", "")
        self.database_path_patch = patch.object(database, "DB_PATH", self.db_path)
        self.database_url_patch.start()
        self.database_path_patch.start()
        self.addCleanup(self.database_url_patch.stop)
        self.addCleanup(self.database_path_patch.stop)

        database.init_db()
        self.conn = database.connect()

        # Seed test user
        self.user_id = "user-123"
        self.user = {"id": self.user_id, "email": "test@example.com"}
        self.conn.execute(
            "INSERT INTO users (id, email, password_hash, full_name, knoprix_id) VALUES (?, ?, ?, ?, ?)",
            (self.user_id, "test@example.com", hash_password("pass123"), "Test User", "KP-CRUD12345"),
        )

        # Seed test project
        self.project_id = "proj-123"
        self.conn.execute(
            "INSERT INTO projects (id, user_id, name, description) VALUES (?, ?, ?, ?)",
            (self.project_id, self.user_id, "Initial Project", "Desc"),
        )

    def tearDown(self):
        self.conn.close()
        self.tmp_dir.cleanup()

    def test_document_rename_updates_file_name_and_returns_payload(self):
        doc_id = "doc-999"
        self.conn.execute(
            """INSERT INTO documents (id, project_id, file_name, file_type, file_path, file_size, page_count, extracted_text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (doc_id, self.project_id, "Old Name.pdf", "pdf", "/tmp/old.pdf", 100, 1, "Some extracted content"),
        )

        res = update_document(
            document_id=doc_id,
            body=DocumentUpdateBody(fileName="Brand New Renamed.pdf"),
            user=self.user,
            db=self.conn,
        )
        self.assertIn("document", res)
        self.assertEqual(res["document"]["file_name"], "Brand New Renamed.pdf")
        self.assertEqual(res["document"]["title"], "Brand New Renamed.pdf")

        # Verify DB updated
        row = self.conn.execute("SELECT file_name FROM documents WHERE id = ?", (doc_id,)).fetchone()
        self.assertEqual(row["file_name"], "Brand New Renamed.pdf")

    def test_project_delete_unlinks_disk_files(self):
        dummy_file = Path(self.tmp_dir.name) / "uploaded_doc.pdf"
        dummy_file.write_text("dummy content")
        self.assertTrue(dummy_file.exists())

        doc_id = "doc-file-test"
        self.conn.execute(
            """INSERT INTO documents (id, project_id, file_name, file_type, file_path, file_size, page_count, extracted_text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (doc_id, self.project_id, "File Test.pdf", "pdf", str(dummy_file), 100, 1, "Content"),
        )

        delete_project(project_id=self.project_id, user=self.user, db=self.conn)

        # File should be deleted on disk
        self.assertFalse(dummy_file.exists())

        # Project should be removed from DB
        row = self.conn.execute("SELECT * FROM projects WHERE id = ?", (self.project_id,)).fetchone()
        self.assertIsNone(row)

    def test_conversations_filter_by_project_and_search_message_content(self):
        conv1_id = "conv-1"
        conv2_id = "conv-2"
        self.conn.execute(
            "INSERT INTO projects (id, user_id, name, description) VALUES (?, ?, ?, ?)",
            ("other-proj", self.user_id, "Other Project", "Other Desc"),
        )
        self.conn.execute(
            "INSERT INTO conversations (id, user_id, project_id, title) VALUES (?, ?, ?, ?)",
            (conv1_id, self.user_id, self.project_id, "General Discussion"),
        )
        self.conn.execute(
            "INSERT INTO conversations (id, user_id, project_id, title) VALUES (?, ?, ?, ?)",
            (conv2_id, self.user_id, "other-proj", "Math Questions"),
        )

        self.conn.execute(
            """INSERT INTO messages (id, conversation_id, sequence, role, content, citations_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("msg-1", conv1_id, 1, "user", "How does AVL tree balancing work?", "[]"),
        )

        # Test project filter
        res1 = list_conversations(
            search="",
            projectId=self.project_id,
            limit=20,
            offset=0,
            user=self.user,
            db=self.conn,
        )
        self.assertEqual(len(res1["conversations"]), 1)
        self.assertEqual(res1["conversations"][0]["id"], conv1_id)

        # Test full-text message content search
        res2 = list_conversations(
            search="balancing",
            projectId=None,
            limit=20,
            offset=0,
            user=self.user,
            db=self.conn,
        )
        self.assertEqual(len(res2["conversations"]), 1)
        self.assertEqual(res2["conversations"][0]["id"], conv1_id)


if __name__ == "__main__":
    unittest.main()
