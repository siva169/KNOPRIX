"""Focused QA for Google Search grounding through Gemini Interactions."""
import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from app.services import rag


class GeminiSearchTests(unittest.TestCase):
    def interaction_response(self, steps):
        return io.BytesIO(
            json.dumps({"status": "completed", "steps": steps}).encode("utf-8")
        )

    def test_supported_models_are_explicit_and_provider_scoped(self):
        self.assertTrue(
            rag.provider_supports_native_search(
                "gemini-free", "gemini-2.5-flash"
            )
        )
        self.assertTrue(
            rag.provider_supports_native_search(
                "gemini-free", "gemini-2.5-flash-lite"
            )
        )
        self.assertFalse(
            rag.provider_supports_native_search("openai", "gemini-2.5-flash")
        )
        self.assertFalse(
            rag.provider_supports_native_search("gemini-free", "gemini-2.0-flash")
        )

    def test_search_request_is_stateless_and_citations_are_normalized(self):
        response = self.interaction_response(
            [
                {"type": "google_search_call", "arguments": {"queries": ["topic"]}},
                {
                    "type": "model_output",
                    "content": [
                        {
                            "type": "text",
                            "text": "  π.",
                            "annotations": [],
                        },
                        {
                            "type": "text",
                            "text": "Second answer.",
                            "annotations": [
                                {
                                    "type": "url_citation",
                                    "url": "https://example.com/source",
                                    "title": "Example source",
                                    "start_index": 0,
                                    "end_index": 6,
                                },
                                {
                                    "type": "url_citation",
                                    "url": "javascript:alert(1)",
                                    "title": "Unsafe",
                                },
                                {
                                    "type": "url_citation",
                                    "url": "http://example.com/insecure",
                                    "title": "Insecure",
                                },
                            ],
                        },
                    ],
                },
            ]
        )
        with patch(
            "app.services.rag.urllib.request.urlopen",
            return_value=response,
        ) as open_url:
            answer, citations, search_used = rag.complete_gemini_search_response(
                "gemini-2.5-flash",
                "mock-api-key",
                "System rules",
                "Question",
            )

        request = open_url.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(
            request.full_url,
            "https://generativelanguage.googleapis.com/v1beta/interactions",
        )
        headers = {key.lower(): value for key, value in request.header_items()}
        self.assertEqual(headers["x-goog-api-key"], "mock-api-key")
        self.assertEqual(payload["tools"], [{"type": "google_search"}])
        self.assertIs(payload["store"], False)
        self.assertEqual(payload["input"], "Question")
        self.assertEqual(answer, "π.Second answer.")
        self.assertTrue(search_used)
        self.assertEqual(
            citations,
            [{
                "sourceType": "web",
                "url": "https://example.com/source",
                "title": "Example source",
                "startIndex": 3,
                "endIndex": 9,
            }],
        )
        self.assertEqual(open_url.call_args.kwargs["timeout"], 120)

    def test_unsearched_answer_and_invalid_response_are_handled(self):
        with patch(
            "app.services.rag.urllib.request.urlopen",
            return_value=self.interaction_response([
                {"type": "model_output", "content": [{"type": "text", "text": "Answer."}]}
            ]),
        ):
            answer, citations, search_used = rag.complete_gemini_search_response(
                "gemini-2.5-flash-lite", "key", "system", "question"
            )
        self.assertEqual((answer, citations, search_used), ("Answer.", [], False))

        with patch(
            "app.services.rag.urllib.request.urlopen",
            return_value=io.BytesIO(b'{"steps": {}}'),
        ), self.assertRaises(rag.ProviderSearchError):
            rag.complete_gemini_search_response(
                "gemini-2.5-flash", "key", "system", "question"
            )

    def test_provider_http_errors_are_surfaceable(self):
        response_error = HTTPError(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            429,
            "Too Many Requests",
            None,
            io.BytesIO(),
        )
        self.addCleanup(response_error.close)
        with patch(
            "app.services.rag.urllib.request.urlopen",
            side_effect=response_error,
        ), self.assertRaisesRegex(rag.ProviderSearchError, "HTTP 429"):
            rag.complete_gemini_search_response(
                "gemini-2.5-flash", "key", "system", "question"
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
