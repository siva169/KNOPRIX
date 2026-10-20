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
from pypdf import PdfReader, PdfWriter
from starlette.datastructures import Headers

from app import database
from app.config import _load_provider_api_keys
from app.routers import artifacts, chat, documents
from app.services import document_ai, full_document_chat, rag

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
    def test_openai_file_upload_and_deletion_use_supplied_key(self):
        response = Mock()
        response.status = 200
        response.read.return_value = b'{"id":"file-test"}'
        connection = Mock()
        connection.getresponse.return_value = response

        with tempfile.TemporaryDirectory() as temp_name:
            pdf_path = Path(temp_name) / "part.pdf"
            pdf_path.write_bytes(b"%PDF-1.4")
            with patch(
                "app.services.document_ai.http.client.HTTPSConnection",
                return_value=connection,
            ):
                result = document_ai._streaming_multipart_upload(
                    "openai", "test-openai-key", pdf_path, "part.pdf"
                )

        headers = {
            call.args[0]: call.args[1]
            for call in connection.putheader.call_args_list
        }
        self.assertEqual(result["id"], "file-test")
        self.assertEqual(headers["Authorization"], "Bearer test-openai-key")

        with patch.object(document_ai, "_json_request") as request:
            document_ai.delete_provider_file(
                "openai", "test-openai-key", "file-test"
            )

        self.assertEqual(
            request.call_args.kwargs["headers"]["Authorization"],
            "Bearer test-openai-key",
        )

    def test_image_conversion_creates_work_directory(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            source = root / "source.png"
            Image.new("RGB", (32, 32), "white").save(source)

            output = document_ai.prepare_pdf(source, "png", root / "conversion")

            self.assertTrue(output.is_file())
            self.assertEqual(len(PdfReader(str(output)).pages), 1)

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
                document_ai.NVIDIA_VISION_MODEL_ID,
            ],
        )
        self.assertEqual(provider["models"][0]["id"], rag.NVIDIA_MODEL_ID)

    def test_full_document_chat_is_limited_to_verified_visual_models(self):
        nvidia_models = {
            model["id"]: model
            for model in chat._lookup("nvidia-nim")["models"]
        }
        openai_models = chat._lookup("openai")["models"]
        text_only_models = chat._lookup("groq-free")["models"]

        self.assertTrue(
            nvidia_models[document_ai.NVIDIA_VISION_MODEL_ID]["fullDocumentChat"]
        )
        self.assertFalse(nvidia_models[rag.NVIDIA_MODEL_ID]["fullDocumentChat"])
        self.assertTrue(all(model["fullDocumentChat"] for model in openai_models))
        self.assertTrue(all(not model["fullDocumentChat"] for model in text_only_models))

    def test_openai_full_document_stream_references_uploaded_pdf_files(self):
        response = FakeHTTPResponse(
            b'data: {"type":"response.output_text.delta","delta":"answer"}\n\n'
            b'data: {"type":"response.completed"}\n\n'
        )
        with patch(
            "app.services.full_document_chat.urllib.request.urlopen",
            return_value=response,
        ) as open_url:
            tokens = list(
                full_document_chat._stream_openai(
                    "openai-test-key",
                    "gpt-4o-mini",
                    "Use only the uploaded files.",
                    "Compare both documents.",
                    [{"provider_file_id": "file-authorized"}],
                )
            )

        request = open_url.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, "https://api.openai.com/v1/responses")
        self.assertEqual(
            request.get_header("Authorization"), "Bearer openai-test-key"
        )
        self.assertIn(
            {"type": "input_file", "file_id": "file-authorized", "detail": "high"},
            payload["input"][1]["content"],
        )
        self.assertEqual(tokens, ["answer"])

    def test_anthropic_full_document_stream_uses_file_blocks(self):
        response = FakeHTTPResponse(
            b'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}\n\n'
        )
        with patch(
            "app.services.full_document_chat.urllib.request.urlopen",
            return_value=response,
        ) as open_url:
            tokens = list(
                full_document_chat._stream_anthropic(
                    "anthropic-test-key",
                    "claude-sonnet-5-5",
                    "Use only the uploaded files.",
                    "Compare both documents.",
                    [{"provider_file_id": "file_anthropic"}],
                )
            )

        request = open_url.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, "https://api.anthropic.com/v1/messages")
        self.assertEqual(
            request.get_header("Anthropic-beta"), "files-api-2025-04-14"
        )
        self.assertIn(
            {
                "type": "document",
                "source": {"type": "file", "file_id": "file_anthropic"},
            },
            payload["messages"][0]["content"],
        )
        self.assertEqual(tokens, ["answer"])

    def test_gemini_full_document_stream_uses_uploaded_file_uri(self):
        response = FakeHTTPResponse(
            b'data: {"candidates":[{"content":{"parts":[{"text":"answer"}]}}]}\n\n'
        )
        with patch(
            "app.services.full_document_chat.urllib.request.urlopen",
            return_value=response,
        ) as open_url:
            tokens = list(
                full_document_chat._stream_gemini(
                    "gemini-test-key",
                    "gemini-2.5-flash",
                    "Use only the uploaded files.",
                    "Compare both documents.",
                    [{
                        "provider_file_uri":
                            "https://generativelanguage.googleapis.com/file/abc"
                    }],
                )
            )

        request = open_url.call_args.args[0]
        payload = json.loads(request.data)
        self.assertIn(":streamGenerateContent?alt=sse", request.full_url)
        self.assertEqual(request.get_header("X-goog-api-key"), "gemini-test-key")
        self.assertIn(
            {
                "fileData": {
                    "mimeType": "application/pdf",
                    "fileUri":
                        "https://generativelanguage.googleapis.com/file/abc",
                }
            },
            payload["contents"][0]["parts"],
        )
        self.assertEqual(tokens, ["answer"])

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

    def test_full_document_chat_requires_separate_provider_consent(self):
        doc_res = self.upload_doc("supernova.txt", b"A supernova is a stellar explosion.")
        body = {
            "mode": "full-document",
            "providerId": "openai",
            "model": "gpt-4o-mini",
            "documentIds": [doc_res["document"]["id"]],
            "question": "What is a supernova?",
        }

        with patch("app.routers.chat.stream_full_document_response") as stream:
            with self.assertRaises(HTTPException) as ctx:
                chat.chat_ask(
                    body,
                    user=USER,
                    db=self.db,
                    x_provider_key="test-openai-key",
                )

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("provider-specific", ctx.exception.detail)
        stream.assert_not_called()

    def test_full_document_chat_uses_authorized_provider_files_not_rag(self):
        doc_res = self.upload_doc("supernova.txt", b"A supernova is a stellar explosion.")
        document = doc_res["document"]
        api_key = "test-openai-key"
        document_ai._store_part(
            self.db,
            USER["id"],
            PROJECT_ID,
            document["id"],
            "openai",
            "gpt-4o-mini",
            document_ai.credential_fingerprint("openai", api_key),
            document_ai.hash_file(Path(document["file_path"])),
            1,
            1,
            "ready",
            file_id="file-authorized",
        )
        body = {
            "mode": "full-document",
            "providerId": "openai",
            "model": "gpt-4o-mini",
            "documentIds": [document["id"]],
            "question": "What is a supernova?",
        }

        with patch("app.routers.chat.retrieve_hybrid_passages") as retrieve, \
             patch(
                 "app.routers.chat.stream_full_document_response",
                 return_value=[("token", {"text": "A stellar explosion."})],
             ) as stream:
            result = chat.chat_ask(
                body, user=USER, db=self.db, x_provider_key=api_key
            )

        self.assertEqual(result["answer"], "A stellar explosion.")
        self.assertEqual(result["mode"], "full-document")
        retrieve.assert_not_called()
        self.assertEqual(stream.call_args.args[0:3], ("openai", "gpt-4o-mini", api_key))

    def test_expired_gemini_authorization_is_refreshed_before_full_document_chat(self):
        doc_res = self.upload_doc("notes.txt", b"Gemini must reupload expired files.")
        document = doc_res["document"]
        api_key = "test-gemini-key"
        fingerprint = document_ai.credential_fingerprint("gemini-free", api_key)
        document_ai._store_part(
            self.db,
            USER["id"],
            PROJECT_ID,
            document["id"],
            "gemini-free",
            "gemini-2.5-flash",
            fingerprint,
            document_ai.hash_file(Path(document["file_path"])),
            1,
            1,
            "ready",
            file_id="files/expired",
            file_uri="https://generativelanguage.googleapis.com/file/expired",
            expires_at="2000-01-01T00:00:00+00:00",
        )
        part = {
            "path": Path(self.temp_dir.name) / "pages.pdf",
            "page_start": 1,
            "page_end": 1,
            "page_count": 1,
        }
        with patch.object(document_ai, "UPLOAD_DIR", self.upload_dir), \
             patch(
                 "app.services.document_ai.prepare_pdf",
                 return_value=Path(self.temp_dir.name) / "converted.pdf",
             ), \
             patch("app.services.document_ai.split_pdf", return_value=[part]), \
             patch(
                 "app.services.document_ai.upload_provider_file",
                 return_value={
                     "file_id": "files/refreshed",
                     "file_uri":
                         "https://generativelanguage.googleapis.com/file/refreshed",
                     "expires_at": "2099-01-01T00:00:00+00:00",
                 },
             ) as upload:
            files = document_ai.authorized_provider_files(
                self.db,
                USER["id"],
                [document],
                "gemini-free",
                "gemini-2.5-flash",
                api_key,
            )

        self.assertEqual(files[document["id"]][0]["provider_file_id"], "files/refreshed")
        upload.assert_called_once()

    def test_provider_file_deletion_failure_remains_retryable(self):
        api_key = "test-openai-key"
        document = self.upload_doc("notes.txt", b"Retry provider deletion.")["document"]
        document_ai._store_part(
            self.db,
            USER["id"],
            PROJECT_ID,
            document["id"],
            "openai",
            "gpt-4o-mini",
            document_ai.credential_fingerprint("openai", api_key),
            document_ai.hash_file(Path(document["file_path"])),
            1,
            1,
            "ready",
            file_id="file-revoke",
        )
        with patch(
            "app.services.document_ai.delete_provider_file",
            side_effect=document_ai.ProviderFileError("Provider unavailable."),
        ):
            result = document_ai.revoke_document(
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

        with patch("app.services.document_ai.delete_provider_file"):
            retried = document_ai.retry_pending_deletions(
                self.db,
                USER["id"],
                "openai",
                api_key,
                document["id"],
                "gpt-4o-mini",
            )
        self.assertEqual(retried, {"deleted": 1, "deletePending": 0})

    def test_nvidia_visual_chat_processes_all_pages_in_four_page_batches(self):
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = self.upload_dir / "visual-report.pdf"
        writer = PdfWriter()
        for _ in range(9):
            writer.add_blank_page(width=200, height=200)
        with pdf_path.open("wb") as output:
            writer.write(output)
        document = {
            "id": "nvidia-visual-report",
            "file_name": "visual-report.pdf",
            "file_type": "pdf",
            "file_path": str(pdf_path),
        }
        batches = []

        def render_batch(_pdf, first, last, output_dir):
            batches.append((first, last))
            image = output_dir / f"page-{first}.jpg"
            image.write_bytes(b"image fixture")
            return [image for _ in range(last - first + 1)]

        with patch.object(full_document_chat, "UPLOAD_DIR", self.upload_dir), \
             patch(
                 "app.services.full_document_chat._render_nvidia_batch",
                 side_effect=render_batch,
             ), \
             patch(
                 "app.services.full_document_chat._stream_nvidia_batch",
                 side_effect=lambda *_args: iter(["batch evidence"]),
             ), \
             patch(
                 "app.services.full_document_chat.rag.stream_llm_response",
                 return_value=iter(["combined answer"]),
             ):
            events = list(
                full_document_chat._stream_nvidia(
                    "server-key",
                    document_ai.NVIDIA_VISION_MODEL_ID,
                    "Use only selected pages.",
                    "Find the key idea.",
                    [document],
                )
            )

        self.assertEqual(batches, [(1, 4), (5, 8), (9, 9)])
        self.assertIn(("token", {"text": "combined answer"}), events)
        self.assertEqual(
            [payload["current"] for event, payload in events if event == "progress"],
            [0, 1, 2, 3, 3],
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
