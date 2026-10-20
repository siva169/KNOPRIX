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
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.datastructures import UploadFile
from starlette.datastructures import Headers

from app import database
from app.config import _load_provider_api_keys
from app.routers import artifacts, chat, documents
from app.services import provider_file_cleanup, rag

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

    def test_nvidia_provider_uses_the_published_nim_model_and_endpoint(self):
        provider = chat._lookup("nvidia-nim")

        self.assertEqual(
            provider["baseUrl"], "https://integrate.api.nvidia.com/v1"
        )
        self.assertEqual(
            [model["id"] for model in provider["models"]],
            [
                "nvidia/nemotron-3.5-lightning-30b-a3b",
                "nvidia/nemotron-nano-12b-v2-vl",
            ],
        )
        self.assertEqual(provider["models"][0]["id"], rag.NVIDIA_MODEL_ID)

    def test_nvidia_credentials_load_from_backend_environment(self):
        keys = _load_provider_api_keys({"NVIDIA_API_KEY": "server-test-key"})

        self.assertEqual(keys["nvidia-nim"], "server-test-key")

    def test_nvidia_allowlist_reports_only_server_key_presence(self):
        with patch.dict(chat.cfg.PROVIDER_API_KEYS, {"nvidia-nim": "server-test-key"}):
            result = chat.providers_allowlist(user=USER)

        provider = next(item for item in result["providers"] if item["id"] == "nvidia-nim")
        self.assertTrue(provider["hasServerKey"])
        self.assertTrue(provider["browserAvailable"])
        self.assertNotIn("server-test-key", json.dumps(result))

    def test_openai_compatible_streams_send_bearer_key_to_provider_endpoint(self):
        endpoints = {
            "groq-free": "https://api.groq.com/openai/v1/chat/completions",
            "openrouter-free": "https://openrouter.ai/api/v1/chat/completions",
            "zai-glm-free": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            "openai": "https://api.openai.com/v1/chat/completions",
            "nvidia-nim": "https://integrate.api.nvidia.com/v1/chat/completions",
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
                            rag.NVIDIA_MODEL_ID if provider_id == "nvidia-nim" else "test-model",
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
                self.assertEqual(
                    open_url.call_args.kwargs["timeout"],
                    120 if provider_id == "nvidia-nim" else 30,
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
            "https://integrate.api.nvidia.com/v1/chat/completions",
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
                            "https://integrate.api.nvidia.com/v1/chat/completions": "nvidia-nim",
                        }[endpoint],
                        rag.NVIDIA_MODEL_ID if endpoint == "https://integrate.api.nvidia.com/v1/chat/completions" else "test-model",
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
        database._create_provider_document_files_schema(self.db)

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

        body["mode"] = "document-context"
        body["confirmed"] = True
        with self.assertRaises(HTTPException) as context:
            chat.chat_ask(body, user=USER, db=self.db)
        self.assertEqual(context.exception.status_code, 403)

    def test_document_context_requires_explicit_confirmation(self):
        doc_res = self.upload_doc("supernova.txt", b"A supernova is a stellar explosion.")
        body = {
            "mode": "document-context",
            "providerId": "zai-glm-free",
            "model": "glm-4.5-flash",
            "documentIds": [doc_res["document"]["id"]],
            "question": "What is a supernova?",
        }

        with patch("app.routers.chat.stream_llm_response") as stream:
            with self.assertRaises(HTTPException) as ctx:
                chat.chat_ask(
                    body, user=USER, db=self.db, x_provider_key="test-provider-key"
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("confirm", ctx.exception.detail.lower())
        stream.assert_not_called()

    def test_document_context_sends_all_authorized_page_text_without_rag(self):
        doc_res = self.upload_doc(
            "supernova.txt", b"A supernova is a powerful and luminous explosion of a star."
        )
        doc_id = doc_res["document"]["id"]
        self.db.execute(
            "UPDATE documents SET page_count = 2 WHERE id = ?",
            (doc_id,),
        )
        self.db.execute(
            "INSERT INTO document_pages (id, document_id, page_number, page_text) "
            "VALUES (?, ?, 2, ?)",
            ("page-two", doc_id, "A type Ia supernova occurs in a binary system."),
        )
        self.db.commit()
        body = {
            "mode": "document-context",
            "confirmed": True,
            "providerId": "zai-glm-free",
            "model": "glm-4.5-flash",
            "documentIds": [doc_id],
            "question": "What is a supernova?",
        }

        with patch(
            "app.routers.chat.retrieve_hybrid_passages"
        ) as retrieve, patch(
            "app.routers.chat.stream_llm_response",
            return_value=iter(["A stellar explosion."]),
        ) as stream:
            result = chat.chat_ask(
                body,
                user=USER,
                db=self.db,
                x_provider_key="test-provider-key",
            )

        self.assertEqual(result["mode"], "document-context")
        self.assertEqual(result["answer"], "A stellar explosion.")
        self.assertIn("powerful and luminous explosion", stream.call_args.args[4])
        self.assertIn("type Ia supernova occurs in a binary system", stream.call_args.args[4])
        retrieve.assert_not_called()

    def test_document_context_rejects_missing_or_noncontiguous_page_text(self):
        doc_res = self.upload_doc("supernova.txt", b"Page one text.")
        doc_id = doc_res["document"]["id"]
        self.db.execute("UPDATE documents SET page_count = 2 WHERE id = ?", (doc_id,))
        self.db.execute(
            "UPDATE document_pages SET page_number = 3 WHERE document_id = ?",
            (doc_id,),
        )
        self.db.execute(
            "INSERT INTO document_pages (id, document_id, page_number, page_text) "
            "VALUES (?, ?, 4, ?)",
            ("page-four", doc_id, "Page four text."),
        )
        self.db.commit()

        with patch("app.routers.chat.stream_llm_response") as stream:
            with self.assertRaises(HTTPException) as ctx:
                chat.chat_ask(
                    {
                        "mode": "document-context",
                        "confirmed": True,
                        "providerId": "zai-glm-free",
                        "model": "glm-4.5-flash",
                        "documentIds": [doc_id],
                        "question": "Summarize this document.",
                    },
                    user=USER,
                    db=self.db,
                    x_provider_key="test-provider-key",
                )
        stream.assert_not_called()

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Complete extracted page text", ctx.exception.detail)

    def test_document_context_rejects_aggregate_text_when_pages_are_missing(self):
        doc_res = self.upload_doc("multi-page.txt", b"Aggregate text.")
        doc_id = doc_res["document"]["id"]
        self.db.execute("UPDATE documents SET page_count = 2 WHERE id = ?", (doc_id,))
        self.db.execute("DELETE FROM document_pages WHERE document_id = ?", (doc_id,))
        self.db.commit()

        with patch("app.routers.chat.stream_llm_response") as stream:
            with self.assertRaises(HTTPException) as ctx:
                chat.chat_ask(
                    {
                        "mode": "document-context",
                        "confirmed": True,
                        "providerId": "zai-glm-free",
                        "model": "glm-4.5-flash",
                        "documentIds": [doc_id],
                        "question": "Summarize this document.",
                    },
                    user=USER,
                    db=self.db,
                    x_provider_key="test-provider-key",
                )
        stream.assert_not_called()

        self.assertEqual(ctx.exception.status_code, 422)

    def test_document_context_streams_live_answer_without_rag(self):
        doc_res = self.upload_doc(
            "supernova.txt", b"A supernova is a powerful and luminous explosion of a star."
        )
        body = {
            "mode": "document-context",
            "confirmed": True,
            "providerId": "zai-glm-free",
            "model": "glm-4.5-flash",
            "documentIds": [doc_res["document"]["id"]],
            "question": "What is a supernova?",
        }

        async def read_stream(response):
            return "".join([chunk async for chunk in response.body_iterator])

        with patch("app.routers.chat.retrieve_hybrid_passages") as retrieve, patch(
            "app.routers.chat.stream_llm_response",
            return_value=iter(["A stellar explosion."]),
        ):
            response = chat.chat_stream(
                body,
                user=USER,
                db=self.db,
                x_provider_key="test-provider-key",
            )
            events = asyncio.run(read_stream(response))

        self.assertEqual(response.media_type, "text/event-stream")
        self.assertIn('"mode": "document-context"', events)
        self.assertIn('"text": "A stellar explosion."', events)
        self.assertIn('"done": true', events)
        retrieve.assert_not_called()

    def test_document_context_rejects_text_over_the_limit_without_truncation(self):
        doc_res = self.upload_doc("large.txt", b"small starter text")
        doc_id = doc_res["document"]["id"]
        oversized_text = "x" * (chat.MAX_DOCUMENT_CONTEXT_CHARS + 1)
        self.db.execute(
            "UPDATE documents SET extracted_text = ? WHERE id = ?",
            (oversized_text, doc_id),
        )
        self.db.execute(
            "UPDATE document_pages SET page_text = ? WHERE document_id = ?",
            (oversized_text, doc_id),
        )
        self.db.commit()
        body = {
            "mode": "document-context",
            "confirmed": True,
            "providerId": "zai-glm-free",
            "model": "glm-4.5-flash",
            "documentIds": [doc_id],
            "question": "Summarize this document.",
        }

        with patch("app.routers.chat.stream_llm_response") as stream:
            with self.assertRaises(HTTPException) as ctx:
                chat.chat_ask(
                    body, user=USER, db=self.db, x_provider_key="test-provider-key"
                )

        self.assertEqual(ctx.exception.status_code, 413)
        self.assertIn("limit", ctx.exception.detail.lower())
        stream.assert_not_called()

    def test_retired_full_document_chat_mode_is_rejected(self):
        doc_res = self.upload_doc("supernova.txt", b"A supernova is a stellar explosion.")
        with self.assertRaises(HTTPException) as ctx:
            chat.chat_ask(
                {
                    "mode": "full-document",
                    "providerId": "openai",
                    "model": "gpt-4o-mini",
                    "documentIds": [doc_res["document"]["id"]],
                    "question": "What is a supernova?",
                },
                user=USER,
                db=self.db,
                x_provider_key="test-openai-key",
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("document-context", ctx.exception.detail)

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

    def test_provider_file_deletion_failure_remains_retryable(self):
        api_key = "test-openai-key"
        document = self.upload_doc("notes.txt", b"Retry provider deletion.")["document"]
        self.db.execute(
            """INSERT INTO provider_document_files (
                   id, user_id, project_id, document_id, provider_id, model_id,
                   credential_fingerprint, provider_file_id, source_hash,
                   page_start, page_end, status
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'ready')""",
            (
                "provider-file",
                USER["id"],
                PROJECT_ID,
                document["id"],
                "openai",
                "gpt-4o-mini",
                provider_file_cleanup.credential_fingerprint("openai", api_key),
                "file-revoke",
                "source-sha256",
            ),
        )
        self.db.commit()
        with patch(
            "app.services.provider_file_cleanup.delete_provider_file",
            side_effect=provider_file_cleanup.ProviderFileError("Provider unavailable."),
        ):
            result = provider_file_cleanup.revoke_document(
                self.db, USER["id"], document["id"], "openai", "gpt-4o-mini", api_key
            )
        self.assertTrue(result["deletePending"])
        self.assertEqual(
            self.db.execute(
                "SELECT status FROM provider_document_files WHERE document_id = ?",
                (document["id"],),
            ).fetchone()["status"],
            "delete_pending",
        )

        with patch("app.services.provider_file_cleanup.delete_provider_file"):
            retried = provider_file_cleanup.retry_pending_deletions(
                self.db,
                USER["id"],
                "openai",
                api_key,
                document["id"],
                "gpt-4o-mini",
            )
        self.assertEqual(retried, {"deleted": 1, "deletePending": 0})
        status = provider_file_cleanup.list_provider_documents(
            self.db,
            USER["id"],
            PROJECT_ID,
            "openai",
            "gpt-4o-mini",
            api_key,
        )
        self.assertEqual(status["documents"][0]["status"], "revoked")

    def test_openai_provider_file_cleanup_uses_the_supplied_bearer_key(self):
        with patch("app.services.provider_file_cleanup._json_request") as request:
            provider_file_cleanup.delete_provider_file(
                "openai", "test-openai-key", "file-to-delete"
            )

        self.assertEqual(
            request.call_args.args[1]["Authorization"],
            "Bearer test-openai-key",
        )

    def test_nvidia_chat_routes_reject_client_keys_and_use_server_key(self):
        doc_res = self.upload_doc("nvidia.txt", b"NVIDIA test passage for chat.")
        body = {
            "providerId": "nvidia-nim",
            "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
            "documentIds": [doc_res["document"]["id"]],
            "question": "What does the passage say?",
        }

        with self.assertRaises(HTTPException) as ctx:
            chat.chat_ask(
                body, user=USER, db=self.db, x_provider_key="must-not-reach-backend"
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("backend-managed key", ctx.exception.detail)

        with self.assertRaises(HTTPException) as stream_ctx:
            chat.chat_stream(
                body, user=USER, db=self.db, x_provider_key="must-not-reach-backend"
            )
        self.assertEqual(stream_ctx.exception.status_code, 400)

        with patch.dict(chat.cfg.PROVIDER_API_KEYS, {"nvidia-nim": "server-test-key"}), \
             patch("app.routers.chat.stream_llm_response", return_value=["NVIDIA grounded"] ) as stream:
            result = chat.chat_ask(
                body,
                user=USER,
                db=self.db,
                x_provider_key=None,
                x_api_key=None,
            )

        self.assertFalse(result["mocked"])
        self.assertEqual(result["answer"], "NVIDIA grounded")
        self.assertNotIn("server-test-key", json.dumps(result))
        self.assertEqual(stream.call_args.args[:3], (
            "nvidia-nim",
            rag.NVIDIA_MODEL_ID,
            "server-test-key",
        ))

        async def read_stream(response):
            return "".join([chunk async for chunk in response.body_iterator])

        with patch.dict(chat.cfg.PROVIDER_API_KEYS, {"nvidia-nim": "server-test-key"}), \
             patch("app.routers.chat.stream_llm_response", return_value=iter(["NVIDIA streamed"] )) as stream:
            response = chat.chat_stream(
                body,
                user=USER,
                db=self.db,
                x_provider_key=None,
                x_api_key=None,
            )
            event_text = asyncio.run(read_stream(response))

        self.assertIn("NVIDIA streamed", event_text)
        self.assertEqual(stream.call_args.args[:3], (
            "nvidia-nim",
            rag.NVIDIA_MODEL_ID,
            "server-test-key",
        ))

    def test_nvidia_chat_without_server_key_returns_503(self):
        doc_res = self.upload_doc(
            "nvidia.txt",
            b"Nemotron is NVIDIA's family of open models.",
        )
        doc_id = doc_res["document"]["id"]
        with patch.dict(chat.cfg.PROVIDER_API_KEYS, {}, clear=True):
            with self.assertRaises(HTTPException) as ctx:
                chat.chat_ask(
                    {
                        "providerId": "nvidia-nim",
                        "model": rag.NVIDIA_MODEL_ID,
                        "documentIds": [doc_id],
                        "question": "What is Nemotron?",
                    },
                    user=USER,
                    db=self.db,
                    x_provider_key=None,
                    x_api_key=None,
                )
            with self.assertRaises(HTTPException) as stream_ctx:
                chat.chat_stream(
                    {
                        "providerId": "nvidia-nim",
                        "model": rag.NVIDIA_MODEL_ID,
                        "documentIds": [doc_id],
                        "question": "What is Nemotron?",
                    },
                    user=USER,
                    db=self.db,
                    x_provider_key=None,
                    x_api_key=None,
                )
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(stream_ctx.exception.status_code, 503)

    def test_nvidia_generated_flashcards_are_saved_with_verified_citations(self):
        doc_res = self.upload_doc(
            "nvidia.txt",
            b"A supernova is a powerful and luminous explosion of a star.",
        )
        doc_id = doc_res["document"]["id"]
        generated = {
            "cards": [
                {"question": "What is a supernova?", "answer": "A stellar explosion."}
            ]
        }

        with patch.dict(artifacts.cfg.PROVIDER_API_KEYS, {"nvidia-nim": "server-test-key"}), \
             patch(
            "app.routers.artifacts.retrieve_hybrid_passages",
            return_value=[{
                "documentId": doc_id,
                "fileName": "nvidia.txt",
                "pageNumber": 1,
                "content": "A supernova is a powerful and luminous explosion of a star.",
            }],
        ), \
             patch("app.routers.artifacts.complete_llm", return_value=json.dumps(generated)) as complete:
            result = artifacts.generate_flashcards(
                {
                    "documentIds": [doc_id],
                    "topic": "supernova",
                    "providerId": "nvidia-nim",
                    "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
                    "generatedContent": {
                        "cards": [{
                            "question": "client-supplied content",
                            "answer": "must be ignored",
                        }]
                    },
                },
                user=USER,
                db=self.db,
                x_provider_key=None,
                x_api_key=None,
            )

        self.assertEqual(result["generatedBy"], "llm")
        self.assertEqual(result["provider"], "nvidia-nim")
        self.assertEqual(result["cards"][0]["source"]["documentId"], doc_id)
        self.assertNotIn("server-test-key", json.dumps(result))
        self.assertEqual(complete.call_args.args[:3], (
            "nvidia-nim",
            rag.NVIDIA_MODEL_ID,
            "server-test-key",
        ))

    def test_nvidia_artifact_without_server_key_returns_503(self):
        doc_res = self.upload_doc("nvidia.txt", b"NVIDIA test passage.")
        with patch.dict(artifacts.cfg.PROVIDER_API_KEYS, {}, clear=True):
            with self.assertRaises(HTTPException) as ctx:
                artifacts.generate_flashcards(
                    {
                        "documentIds": [doc_res["document"]["id"]],
                        "topic": "NVIDIA",
                        "providerId": "nvidia-nim",
                        "model": rag.NVIDIA_MODEL_ID,
                    },
                    user=USER,
                    db=self.db,
                    x_provider_key=None,
                    x_api_key=None,
                )
        self.assertEqual(ctx.exception.status_code, 503)

    def test_nvidia_artifact_route_rejects_a_backend_key(self):
        doc_res = self.upload_doc("nvidia.txt", b"NVIDIA test passage.")
        request_body = {
            "documentIds": [doc_res["document"]["id"]],
            "topic": "NVIDIA",
            "providerId": "nvidia-nim",
            "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
            "generatedContent": {"cards": []},
        }

        with self.assertRaises(HTTPException) as ctx:
            artifacts.generate_flashcards(
                request_body,
                user=USER,
                db=self.db,
                x_provider_key="must-not-reach-backend",
            )

        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException) as body_ctx:
            artifacts.generate_flashcards(
                {**request_body, "api_key": "must-not-reach-backend"},
                user=USER,
                db=self.db,
                x_provider_key=None,
                x_api_key=None,
            )

        self.assertEqual(body_ctx.exception.status_code, 400)

    def test_nvidia_artifact_route_rejects_unlisted_model(self):
        doc_res = self.upload_doc("nvidia.txt", b"NVIDIA test passage.")

        with self.assertRaises(HTTPException) as ctx:
            artifacts.generate_flashcards(
                {
                    "documentIds": [doc_res["document"]["id"]],
                    "topic": "NVIDIA",
                    "providerId": "nvidia-nim",
                    "model": "unlisted-model",
                    "generatedContent": {"cards": []},
                },
                user=USER,
                db=self.db,
                x_provider_key=None,
                x_api_key=None,
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not allowlisted", ctx.exception.detail)

    def test_nvidia_generated_quiz_and_analogy_are_saved(self):
        doc_res = self.upload_doc(
            "nvidia.txt",
            b"Nemotron is a family of open NVIDIA models for AI applications.",
        )
        doc_id = doc_res["document"]["id"]
        passage = {
            "documentId": doc_id,
            "fileName": "nvidia.txt",
            "pageNumber": 1,
            "content": "Nemotron is a family of open NVIDIA models for AI applications.",
        }
        base = {
            "documentIds": [doc_id],
            "providerId": "nvidia-nim",
            "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
        }

        with patch.dict(artifacts.cfg.PROVIDER_API_KEYS, {"nvidia-nim": "server-test-key"}), \
             patch("app.routers.artifacts.retrieve_hybrid_passages", return_value=[passage]), \
             patch("app.routers.artifacts.complete_llm", side_effect=[
                 json.dumps({
                     "questions": [{
                         "question": "What is Nemotron?",
                         "options": ["A model family", "A database"],
                         "correctIndex": 0,
                         "explanation": "The source calls it an open model family.",
                     }]
                 }),
                 json.dumps({
                     "analogy": "A toolkit of specialized machines.",
                     "explanation": "The source describes a family of models.",
                 }),
             ]):
            quiz = artifacts.generate_quiz(
                {
                    **base,
                    "topic": "Nemotron",
                },
                user=USER,
                db=self.db,
                x_provider_key=None,
                x_api_key=None,
            )
            analogy = artifacts.generate_analogy(
                {
                    **base,
                    "concept": "Nemotron",
                },
                user=USER,
                db=self.db,
                x_provider_key=None,
                x_api_key=None,
            )

        self.assertEqual(quiz["generatedBy"], "llm")
        self.assertEqual(quiz["questions"][0]["source"]["documentId"], doc_id)
        self.assertEqual(analogy["generatedBy"], "llm")
        self.assertEqual(analogy["source"]["documentId"], doc_id)

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
