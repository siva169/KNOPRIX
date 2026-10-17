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
from app.config import _load_provider_api_keys
from app.routers import chat, documents
from app.services import rag

USER = {"id": "user-rag-test"}
PROJECT_ID = "proj-rag-test"


class FakeHTTPResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def __iter__(self):
        return iter(self.body.splitlines(keepends=True))

    def read(self):
        return self.body


class ProviderAdapterTests(unittest.TestCase):
    def test_google_api_key_environment_alias_configures_gemini(self):
        keys = _load_provider_api_keys({"GOOGLE_API_KEY": "test-google-key"})

        self.assertEqual(keys["gemini-free"], "test-google-key")

    def test_google_api_key_takes_precedence_over_gemini_alias(self):
        keys = _load_provider_api_keys({
            "GOOGLE_API_KEY": "test-google-key",
            "GEMINI_API_KEY": "test-gemini-key",
        })

        self.assertEqual(keys["gemini-free"], "test-google-key")

    def test_gemini_allowlist_uses_documented_current_flash_models(self):
        provider = chat._lookup("gemini-free")

        self.assertEqual(
            [model["id"] for model in provider["models"]],
            ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
        )

    def test_provider_allowlists_avoid_retired_groq_and_anthropic_models(self):
        groq_models = [model["id"] for model in chat._lookup("groq-free")["models"]]
        anthropic_models = [
            model["id"] for model in chat._lookup("anthropic")["models"]
        ]

        self.assertEqual(
            groq_models, ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]
        )
        self.assertEqual(
            anthropic_models, ["claude-sonnet-5-5", "claude-haiku-5-5"]
        )

    def test_openai_compatible_streams_send_bearer_key_to_provider_endpoint(self):
        endpoints = {
            "groq-free": "https://api.groq.com/openai/v1/chat/completions",
            "openrouter-free": "https://openrouter.ai/api/v1/chat/completions",
            "zai-glm-free": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            "openai": "https://api.openai.com/v1/chat/completions",
        }
        response_body = (
            b'data: {"choices":[{"delta":{"content":"grounded"}}]}\n\n'
            b"data: [DONE]\n\n"
        )

        for provider_id, endpoint in endpoints.items():
            with self.subTest(provider=provider_id):
                response = FakeHTTPResponse(response_body)
                with patch("app.services.rag.urllib.request.urlopen", return_value=response) as open_url:
                    tokens = list(
                        rag.stream_llm_response(
                            provider_id,
                            "test-model",
                            "test-provider-key",
                            "Use only verified passages.",
                            "What does the document say?",
                        )
                    )

                request = open_url.call_args.args[0]
                self.assertEqual(request.full_url, endpoint)
                self.assertEqual(
                    request.get_header("Authorization"), "Bearer test-provider-key"
                )
                self.assertEqual(tokens, ["grounded"])

    def test_gemini_stream_sends_key_in_header_not_url(self):
        response = FakeHTTPResponse(
            b'data: {"candidates":[{"content":{"parts":[{"text":"grounded"}]}}]}\n\n'
        )
        with patch("app.services.rag.urllib.request.urlopen", return_value=response) as open_url:
            tokens = list(
                rag.stream_llm_response(
                    "gemini-free",
                    "gemini-test-model",
                    "test-google-key",
                    "Use only verified passages.",
                    "What does the document say?",
                )
            )

        request = open_url.call_args.args[0]
        self.assertIn(":streamGenerateContent?alt=sse", request.full_url)
        self.assertNotIn("test-google-key", request.full_url)
        self.assertEqual(request.get_header("X-goog-api-key"), "test-google-key")
        self.assertEqual(tokens, ["grounded"])

    def test_non_streaming_openai_compatible_calls_send_bearer_key(self):
        endpoints = (
            "https://api.groq.com/openai/v1/chat/completions",
            "https://openrouter.ai/api/v1/chat/completions",
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            "https://api.openai.com/v1/chat/completions",
        )
        response_body = b'{"choices":[{"message":{"content":"grounded"}}]}'

        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                response = FakeHTTPResponse(response_body)
                with patch("app.services.rag.urllib.request.urlopen", return_value=response) as open_url:
                    answer = rag.complete_llm(
                        {
                            "https://api.groq.com/openai/v1/chat/completions": "groq-free",
                            "https://openrouter.ai/api/v1/chat/completions": "openrouter-free",
                            "https://open.bigmodel.cn/api/paas/v4/chat/completions": "zai-glm-free",
                            "https://api.openai.com/v1/chat/completions": "openai",
                        }[endpoint],
                        "test-model",
                        "test-provider-key",
                        "Use only verified passages.",
                        "What does the document say?",
                    )

                request = open_url.call_args.args[0]
                self.assertEqual(request.full_url, endpoint)
                self.assertEqual(
                    request.get_header("Authorization"), "Bearer test-provider-key"
                )
                self.assertEqual(answer, "grounded")

    def test_gemini_completion_sends_key_in_header_not_url(self):
        response = FakeHTTPResponse(
            b'{"candidates":[{"content":{"parts":[{"text":"grounded"}]}}]}'
        )
        with patch("app.services.rag.urllib.request.urlopen", return_value=response) as open_url:
            answer = rag.complete_llm(
                "gemini-free",
                "gemini-test-model",
                "test-google-key",
                "Use only verified passages.",
                "What does the document say?",
            )

        request = open_url.call_args.args[0]
        self.assertNotIn("test-google-key", request.full_url)
        self.assertEqual(request.get_header("X-goog-api-key"), "test-google-key")
        self.assertEqual(answer, "grounded")


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
            "model": "gemini-2.5-flash",
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

    def test_authorized_document_passage_is_sent_to_live_provider_adapter(self):
        doc_res = self.upload_doc(
            "supernova.txt",
            b"A supernova is a powerful and luminous explosion of a star.",
        )
        doc_id = doc_res["document"]["id"]
        body = {
            "providerId": "zai-glm-free",
            "model": "glm-4.5-flash",
            "documentIds": [doc_id],
            "question": "What is a supernova?",
        }

        def fake_stream(*args, **kwargs):
            yield "A supernova is a powerful and luminous explosion of a star."

        with patch("app.routers.chat.stream_llm_response", side_effect=fake_stream) as stream:
            result = chat.chat_ask(
                body,
                user=USER,
                db=self.db,
                x_provider_key="test-provider-key",
            )

        self.assertFalse(result["mocked"])
        self.assertIn("supernova", result["answer"])
        self.assertEqual(result["citations"][0]["documentId"], doc_id)
        self.assertEqual(stream.call_args.args[0:3], (
            "zai-glm-free",
            "glm-4.5-flash",
            "test-provider-key",
        ))
        self.assertIn("powerful and luminous explosion", stream.call_args.args[4])

    def test_key_in_body_is_rejected(self):
        doc_res = self.upload_doc("relativity.txt", b"General relativity describes gravity.")
        doc_id = doc_res["document"]["id"]

        body = {
            "providerId": "gemini-free",
            "model": "gemini-2.5-flash",
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
            "model": "gemini-2.5-flash",
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
            # The client keys off the SSE event name, so every frame must carry
            # `event: <name>`. Bare `data:` lines (the earlier format) matched
            # zero client frames and rendered an empty answer.
            self.assertIn('event: token', full_sse)
            self.assertIn('data: {"text": "Cosmic "}', full_sse)
            self.assertIn('data: {"text": "microwave "}', full_sse)
            self.assertIn('event: citation', full_sse)
            self.assertIn('event: thought', full_sse)
            self.assertIn('"done": true', full_sse)
            self.assertIn(doc_id, full_sse)


if __name__ == "__main__":
    unittest.main(verbosity=2)
