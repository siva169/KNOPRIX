"""Focused QA for account-scoped conversation history."""
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app import database
from app.routers import conversations


class ChatHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "history.db"
        self.database_patch = patch.multiple(
            database, DATABASE_URL="", DB_PATH=self.db_path
        )
        self.database_patch.start()
        self.addCleanup(self.database_patch.stop)
        database.init_db()
        self.db = database.connect()
        self.addCleanup(self.db.close)
        self.users = {
            "user-a": {"id": "user-a"},
            "user-b": {"id": "user-b"},
        }
        self.db.executemany(
            """INSERT INTO users (id, email, password_hash, full_name, knoprix_id)
               VALUES (?, ?, ?, ?, ?)""",
            [
                ("user-a", "a@example.com", "hash", "A", "KP-AAAAAAAAAA"),
                ("user-b", "b@example.com", "hash", "B", "KP-BBBBBBBBBB"),
            ],
        )
        self.db.execute(
            "INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
            ("project-a", "user-a", "A's project"),
        )

    def create(self, user="user-a", project_id=None):
        result = conversations.create_conversation(
            conversations.ConversationCreateBody(projectId=project_id),
            self.users[user],
            self.db,
        )
        return result["conversation"]["id"]

    def test_create_list_literal_title_search_and_pagination(self):
        first_id = self.create(project_id="project-a")
        second_id = self.create()
        conversations.rename_conversation(
            first_id,
            conversations.ConversationRenameBody(title="  NOTES 100%_safe "),
            self.users["user-a"],
            self.db,
        )
        conversations.rename_conversation(
            second_id,
            conversations.ConversationRenameBody(title="Another notes chat"),
            self.users["user-a"],
            self.db,
        )

        result = conversations.list_conversations(
            search="notes 100%_",
            limit=1,
            offset=0,
            user=self.users["user-a"],
            db=self.db,
        )
        self.assertEqual([item["id"] for item in result["conversations"]], [first_id])
        self.assertEqual(result["pagination"], {"limit": 1, "offset": 0, "total": 1})
        self.assertIn("T", result["conversations"][0]["createdAt"])
        all_chats = conversations.list_conversations(
            search="", limit=1, offset=1, user=self.users["user-a"], db=self.db
        )
        self.assertEqual(len(all_chats["conversations"]), 1)
        self.assertEqual(all_chats["pagination"]["total"], 2)
        self.assertEqual(
            conversations.get_conversation(
                first_id, self.users["user-a"], self.db
            )["conversation"]["projectId"],
            "project-a",
        )

    def test_new_conversation_can_start_with_a_trimmed_title(self):
        result = conversations.create_conversation(
            conversations.ConversationCreateBody(title="  Explain black holes  "),
            self.users["user-a"],
            self.db,
        )
        self.assertEqual(
            result["conversation"]["title"],
            "Explain black holes",
        )
        with self.assertRaises(HTTPException) as blank_title:
            conversations.create_conversation(
                conversations.ConversationCreateBody(title="   "),
                self.users["user-a"],
                self.db,
            )
        self.assertEqual(blank_title.exception.status_code, 422)

    def test_foreign_and_unknown_conversations_are_indistinguishable(self):
        conversation_id = self.create()
        another_user_id = self.create(user="user-b")

        for inaccessible_id in (another_user_id, "unknown"):
            with self.subTest(conversation_id=inaccessible_id):
                with self.assertRaises(HTTPException) as get_error:
                    conversations.get_conversation(
                        inaccessible_id, self.users["user-a"], self.db
                    )
                self.assertEqual(get_error.exception.status_code, 404)
                with self.assertRaises(HTTPException) as rename_error:
                    conversations.rename_conversation(
                        inaccessible_id,
                        conversations.ConversationRenameBody(title="Changed"),
                        self.users["user-a"],
                        self.db,
                    )
                self.assertEqual(rename_error.exception.status_code, 404)
                with self.assertRaises(HTTPException) as delete_error:
                    conversations.delete_conversation(
                        inaccessible_id, self.users["user-a"], self.db
                    )
                self.assertEqual(delete_error.exception.status_code, 404)

        owner_list = conversations.list_conversations(
            search="", limit=20, offset=0, user=self.users["user-a"], db=self.db
        )
        self.assertEqual(
            {item["id"] for item in owner_list["conversations"]},
            {conversation_id},
        )

    def test_rename_validation_project_ownership_and_delete_cascade(self):
        conversation_id = self.create(project_id="project-a")
        with self.assertRaises(ValidationError):
            conversations.ConversationRenameBody(title="x" * 121)
        with self.assertRaises(HTTPException) as blank_title:
            conversations.rename_conversation(
                conversation_id,
                conversations.ConversationRenameBody(title="   "),
                self.users["user-a"],
                self.db,
            )
        self.assertEqual(blank_title.exception.status_code, 422)
        with self.assertRaises(HTTPException) as foreign_project:
            self.create(user="user-b", project_id="project-a")
        self.assertEqual(foreign_project.exception.status_code, 404)

        self.db.execute(
            """INSERT INTO messages
               (id, conversation_id, sequence, role, content, citations_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("message-a", conversation_id, 1, "assistant", "Answer", json.dumps([])),
        )
        conversations.delete_conversation(
            conversation_id, self.users["user-a"], self.db
        )
        self.assertEqual(
            self.db.execute(
                "SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()["total"],
            0,
        )

    def test_messages_are_returned_in_sequence_without_system_roles(self):
        conversation_id = self.create()
        for message_id, sequence, role, content in (
            ("message-2", 2, "assistant", "Second"),
            ("message-1", 1, "user", "First"),
        ):
            self.db.execute(
                """INSERT INTO messages
                   (id, conversation_id, sequence, role, content,
                    provider_id, model_id, citations_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    message_id,
                    conversation_id,
                    sequence,
                    role,
                    content,
                    "provider" if role == "assistant" else None,
                    "model" if role == "assistant" else None,
                    json.dumps([{"title": "Source"}]) if role == "assistant" else "[]",
                ),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO messages
                   (id, conversation_id, sequence, role, content)
                   VALUES (?, ?, ?, ?, ?)""",
                ("message-system", conversation_id, 3, "system", "hidden prompt"),
            )

        result = conversations.get_conversation(
            conversation_id, self.users["user-a"], self.db
        )
        self.assertEqual([message["sequence"] for message in result["messages"]], [1, 2])
        self.assertEqual(result["messages"][1]["providerId"], "provider")
        self.assertEqual(result["messages"][1]["citations"], [{"title": "Source"}])

    def test_account_delete_cascades_history_and_project_delete_unlinks_chat(self):
        conversation_id = self.create(project_id="project-a")
        self.db.execute(
            "DELETE FROM projects WHERE id = ?", ("project-a",)
        )
        row = self.db.execute(
            "SELECT project_id FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        self.assertIsNone(row["project_id"])

        self.db.execute("DELETE FROM users WHERE id = ?", ("user-a",))
        self.assertIsNone(
            self.db.execute(
                "SELECT id FROM conversations WHERE id = ?", (conversation_id,)
            ).fetchone()
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
