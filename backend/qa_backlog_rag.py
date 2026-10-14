"""QA verification for Backlog C:
Document-Grounded RAG Engine, Server-Side Document Grants Enforcement,
Hybrid Retrieval, and Real SSE Streaming Adapter.
"""
import asyncio
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.datastructures import UploadFile
from starlette.datastructures import Headers

from app import database
from app.routers import chat, documents
from app.services import rag

USER = {"id": "user-rag-test"}
PROJECT_ID = "proj-rag-test"


class BacklogRAGTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.upload_dir = Path(self.temp_dir.name) / "uploads"

        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(database.SCHEMA)

        self.database_url_patch = patch.object(database, "DATABASE_URL", "")
        self.database_url_patch.start()
        self.addCleanup(self.database_url_patch.stop)

        database._create_contacts_sharing_schema(self.db)
        database._create_production_backlog_schema(self.db)

        self.db.execute(
            "INSERT INTO users (id, email, password_hash, full_name, knoprix_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (USER["id"], "researcher@knoprix.org", "hash", "Researcher", "KP-RAG001"),
        )
        self.db.execute(
            "INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
            (PROJECT_ID, USER["id"], "Astrophysics"),
        )
        self.db.commit()
        self.addCleanup(self.db.close)

        self.upload_dir_patch = patch.object(documents, "UPLOAD_DIR", self.upload_dir)
        self.storage_patch = patch.object(documents.storage, "enabled", return_value=False)
        self.upload_dir_patch.start()
        self.storage_patch.start()
        self.addCleanup(self.upload_dir_patch.stop)
        self.addCleanup(self.storage_patch.stop)

    def upload_doc(self, filename: str, content: bytes):
        upload = UploadFile(
            file=io.BytesIO(content),
            filename=filename,
            headers=Headers({"content-type": "text/plain"}),
        )
        return asyncio.run(
            documents.upload_document(PROJECT_ID, upload, USER, self.db)
        )

    def test_document_grants_enforcement_blocks_unauthorized_documents(self):
        doc_res = self.upload_doc(
            "supernova.txt",
            b"A supernova is a powerful and luminous explosion of a star. Type Ia supernovae occur in binary systems.",
        )
        doc_id = doc_res["document"]["id"]

        # 1. Document has grant initially -> query succeeds
        body = {
            "providerId": "gemini-free",
            "model": "gemini-2.0-flash",
            "documentIds": [doc_id],
            "question": "What is a supernova?",
        }
        res = chat.chat_ask(body, user=USER, db=self.db)
        self.assertIn("citations", res)
        self.assertEqual(len(res["citations"]), 1)
        self.assertEqual(res["citations"][0]["documentId"], doc_id)

        # 2. Revoke AI grant
        documents.revoke_ai_access(doc_id, "all", USER, self.db)

        # 3. Request now fails server-side with 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            chat.chat_ask(body, user=USER, db=self.db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("not been authorized", ctx.exception.detail)

    def test_key_in_body_is_rejected(self):
        doc_res = self.upload_doc("relativity.txt", b"General relativity describes gravity.")
        doc_id = doc_res["document"]["id"]

        body = {
            "providerId": "gemini-free",
            "model": "gemini-2.0-flash",
            "documentIds": [doc_id],
            "question": "Explain relativity",
            "api_key": "secret-key-that-must-not-be-in-body",
        }
        with self.assertRaises(HTTPException) as ctx:
            chat.chat_ask(body, user=USER, db=self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_sse_streaming_endpoint(self):
        doc_res = self.upload_doc(
            "cosmology.txt",
            b"Cosmic microwave background radiation is electromagnetic radiation left over from the Big Bang.",
        )
        doc_id = doc_res["document"]["id"]

        body = {
            "providerId": "gemini-free",
            "model": "gemini-2.0-flash",
            "documentIds": [doc_id],
            "question": "What is cosmic microwave background?",
        }

        # Mock stream_llm_response to test SSE framing
        def fake_stream(*args, **kwargs):
            yield "Cosmic "
            yield "microwave "
            yield "background."

        with patch("app.routers.chat.stream_llm_response", side_effect=fake_stream):
            response = chat.chat_stream(body, user=USER, db=self.db, x_provider_key="fake-test-key")
            self.assertEqual(response.media_type, "text/event-stream")

            async def collect():
                chunks = []
                async for chunk in response.body_iterator:
                    chunks.append(chunk)
                return "".join(chunks)

            full_sse = asyncio.run(collect())
            self.assertIn('data: {"token": "Cosmic "}', full_sse)
            self.assertIn('data: {"token": "microwave "}', full_sse)
            self.assertIn('"done": true', full_sse)
            self.assertIn(doc_id, full_sse)


if __name__ == "__main__":
    unittest.main(verbosity=2)
