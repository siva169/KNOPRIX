"""Focused QA for source-aware chat with mocked provider streams."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app import database
from app.routers import chat, conversations


class SourceAwareChatTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.database_patch = patch.multiple(
            database,
            DATABASE_URL="",
            DB_PATH=Path(self.temp_dir.name) / "chat.db",
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
            ("project-a", "user-a", "Research"),
        )
        self.conversation_id = self.create_conversation("user-a")

    def create_conversation(self, user_id):
        return conversations.create_conversation(
            conversations.ConversationCreateBody(),
            self.users[user_id],
            self.db,
        )["conversation"]["id"]

    def request(self, **overrides):
        body = {
            "conversationId": self.conversation_id,
            "providerId": "groq-free",
            "model": "openai/gpt-oss-20b",
            "question": "Explain black holes.",
        }
        body.update(overrides)
        return body

    def read_stream(self, response):
        async def collect():
            return "".join([chunk async for chunk in response.body_iterator])

        return asyncio.run(collect())

    def messages(self, conversation_id=None):
        return self.db.execute(
            "SELECT role, content, citations_json FROM messages "
            "WHERE conversation_id = ? ORDER BY sequence",
            (conversation_id or self.conversation_id,),
        ).fetchall()

    def test_general_question_without_documents_streams_and_persists(self):
        with patch(
            "app.routers.chat.stream_llm_response",
            return_value=iter(["A black hole ", "warps spacetime."]),
        ) as stream:
            response = chat.chat_stream(
                self.request(),
                user=self.users["user-a"],
                db=self.db,
                x_provider_key="mock-provider-key",
            )
            events = self.read_stream(response)

        self.assertIn('"searchAvailable": false', events)
        self.assertIn('"documents": 0', events)
        self.assertIn("A black hole ", events)
        self.assertIn('"done": true', events)
        self.assertIn("general-purpose assistant", stream.call_args.args[3])
        self.assertNotIn("using ONLY", stream.call_args.args[3])
        rows = self.messages()
        self.assertEqual([row["role"] for row in rows], ["user", "assistant"])
        self.assertEqual(json.loads(rows[1]["citations_json"]), [])

    def test_authorized_document_passage_is_optional_evidence_and_is_saved_as_citation(self):
        self.db.execute(
            """INSERT INTO documents
               (id, project_id, file_name, file_type, file_path, extracted_text)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("document-a", "project-a", "notes.txt", "txt", "/notes.txt", "source"),
        )
        self.db.execute(
            """INSERT INTO ai_document_grants
               (id, user_id, document_id, purpose)
               VALUES (?, ?, ?, 'all')""",
            ("grant-a", "user-a", "document-a"),
        )
        passage = {
            "documentId": "document-a",
            "fileName": "notes.txt",
            "pageNumber": 2,
            "chunkIndex": 1,
            "content": "A black hole has an event horizon.",
        }
        body = self.request(
            projectId="project-a",
            documentIds=["document-a"],
            confirmed=True,
        )
        with patch(
            "app.routers.chat.retrieve_hybrid_passages",
            return_value=[passage],
        ), patch(
            "app.routers.chat.stream_llm_response",
            return_value=iter(["The passage describes an event horizon."]),
        ) as stream:
            response = chat.chat_stream(
                body,
                user=self.users["user-a"],
                db=self.db,
                x_provider_key="mock-provider-key",
            )
            events = self.read_stream(response)

        self.assertIn("A black hole has an event horizon.", stream.call_args.args[4])
        self.assertIn("event: citation\n", events)
        stored = self.messages()
        self.assertEqual(
            json.loads(stored[1]["citations_json"]),
            [{
                "documentId": "document-a",
                "fileName": "notes.txt",
                "pageNumber": 2,
                "chunkIndex": 1,
                "excerpt": "A black hole has an event horizon.",
            }],
        )

    def test_saved_chat_context_is_relevant_and_never_crosses_accounts(self):
        own_prior = self.create_conversation("user-a")
        foreign_prior = self.create_conversation("user-b")
        for message_id, conversation_id, text in (
            ("own-message", own_prior, "Basalt forms when lava cools."),
            ("foreign-message", foreign_prior, "Basalt is confidential to user B."),
        ):
            self.db.execute(
                """INSERT INTO messages
                   (id, conversation_id, sequence, role, content)
                   VALUES (?, ?, 1, 'user', ?)""",
                (message_id, conversation_id, text),
            )
        with patch(
            "app.routers.chat.stream_llm_response",
            return_value=iter(["Basalt is volcanic rock."]),
        ) as stream:
            response = chat.chat_stream(
                self.request(question="How does basalt form?"),
                user=self.users["user-a"],
                db=self.db,
                x_provider_key="mock-provider-key",
            )
            events = self.read_stream(response)

        prompt = stream.call_args.args[4]
        self.assertIn("Basalt forms when lava cools.", prompt)
        self.assertNotIn("confidential to user B", prompt)
        self.assertIn('"savedChatMessages": 1', events)

    def test_unowned_conversation_or_document_and_unconfirmed_docs_are_rejected(self):
        foreign_conversation = self.create_conversation("user-b")
        with self.assertRaises(HTTPException) as foreign_chat:
            chat.chat_stream(
                self.request(conversationId=foreign_conversation),
                user=self.users["user-a"],
                db=self.db,
            )
        self.assertEqual(foreign_chat.exception.status_code, 404)

        self.db.execute(
            """INSERT INTO documents
               (id, project_id, file_name, file_type, file_path)
               VALUES (?, ?, ?, ?, ?)""",
            ("document-a", "project-a", "notes.txt", "txt", "/notes.txt"),
        )
        with self.assertRaises(HTTPException) as no_consent:
            chat.chat_stream(
                self.request(
                    projectId="project-a",
                    documentIds=["document-a"],
                ),
                user=self.users["user-a"],
                db=self.db,
            )
        self.assertEqual(no_consent.exception.status_code, 400)

        with self.assertRaises(HTTPException) as no_grant:
            chat.chat_stream(
                self.request(
                    projectId="project-a",
                    documentIds=["document-a"],
                    confirmed=True,
                ),
                user=self.users["user-a"],
                db=self.db,
            )
        self.assertEqual(no_grant.exception.status_code, 403)
        self.assertEqual(self.messages(), [])

    def test_provider_error_and_mode_field_do_not_persist_messages(self):
        with patch(
            "app.routers.chat.stream_llm_response",
            return_value=iter(["[Provider error: rejected]"]),
        ):
            response = chat.chat_stream(
                self.request(),
                user=self.users["user-a"],
                db=self.db,
                x_provider_key="mock-provider-key",
            )
            events = self.read_stream(response)
        self.assertIn("event: error\n", events)
        self.assertEqual(self.messages(), [])

        with self.assertRaises(HTTPException) as mode_error:
            chat.chat_stream(
                self.request(mode="retrieval"),
                user=self.users["user-a"],
                db=self.db,
            )
        self.assertEqual(mode_error.exception.status_code, 400)

    def test_non_streaming_general_chat_also_persists(self):
        with patch(
            "app.routers.chat.stream_llm_response",
            return_value=iter(["A concise answer."]),
        ):
            result = chat.chat_ask(
                self.request(),
                user=self.users["user-a"],
                db=self.db,
                x_provider_key="mock-provider-key",
            )
        self.assertEqual(result["answer"], "A concise answer.")
        self.assertEqual([row["role"] for row in self.messages()], ["user", "assistant"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
