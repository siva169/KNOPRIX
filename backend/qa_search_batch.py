"""Regression check: project search fetches matched documents in one query."""
import unittest
from unittest.mock import patch

from app.services import indexer


class FakeInvertedIndex:
    def search(self, _words):
        return [
            {"doc_id": "document-1", "score": 4},
            {"doc_id": "document-2", "score": 2},
        ]


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class FakeDatabase:
    documents = [
        {
            "id": "document-1",
            "file_name": "first.txt",
            "file_type": "txt",
            "extracted_text": "signal source",
            "page_count": 1,
        },
        {
            "id": "document-2",
            "file_name": "second.txt",
            "file_type": "txt",
            "extracted_text": "signal response",
            "page_count": 1,
        },
    ]

    def __init__(self):
        self.document_queries = 0

    def execute(self, query, params=()):
        if "FROM documents" not in query:
            raise AssertionError(f"Unexpected query: {query}")
        self.document_queries += 1
        if " IN (" in query:
            return FakeCursor(
                [doc for doc in self.documents if doc["id"] in params]
            )
        return FakeCursor(
            [doc for doc in self.documents if doc["id"] == params[0]]
        )


class SearchBatchTests(unittest.TestCase):
    def test_search_fetches_all_matched_documents_with_one_query(self):
        db = FakeDatabase()
        indices = {"inverted": FakeInvertedIndex()}

        with (
            patch.object(indexer, "_load_indices", return_value=indices),
            patch.object(indexer, "_project_page_map", return_value={}),
        ):
            results = indexer.search_project(db, "project-1", "signal")

        self.assertEqual([row["documentId"] for row in results], [
            "document-1",
            "document-2",
        ])
        self.assertEqual(db.document_queries, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
