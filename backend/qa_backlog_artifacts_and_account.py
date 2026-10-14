"""QA verification for Backlogs D, E, and G:
AI Study Artifacts (Flashcards, Quizzes, Analogies),
Hierarchical Evidence Mind Map, and
Account Export (GDPR) / Cascading Deletion.
"""
import asyncio
import io
import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.datastructures import UploadFile
from starlette.datastructures import Headers

from app import database
from app.routers import account, artifacts, documents, graph

USER = {"id": "user-study-test", "knoprix_id": "KP-STUDY001"}
PROJECT_ID = "proj-study-test"


class BacklogArtifactsAndAccountTests(unittest.TestCase):
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
            (USER["id"], "scholar@knoprix.org", "hash", "Scholar", USER["knoprix_id"]),
        )
        self.db.execute(
            "INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
            (PROJECT_ID, USER["id"], "Neural Networks Research"),
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

    def test_study_artifacts_lifecycle_and_citations(self):
        sample_text = (
            "Transformers utilize self-attention mechanisms to weigh the significance of different tokens. "
            "Positional encodings provide information about the sequence order of words. "
            "Multi-head attention enables the model to jointly attend to information at different positions."
        )
        doc_res = self.upload_doc("transformers.txt", sample_text.encode("utf-8"))
        doc_id = doc_res["document"]["id"]

        # 1. Generate Flashcards
        fc_res = artifacts.generate_flashcards(
            {"documentIds": [doc_id], "topic": "Attention Mechanism"},
            user=USER,
            db=self.db,
        )
        self.assertEqual(fc_res["artifactType"], "flashcards")
        self.assertGreater(len(fc_res["cards"]), 0)
        self.assertEqual(fc_res["cards"][0]["source"]["documentId"], doc_id)
        fc_id = fc_res["id"]

        # 2. Generate Quiz
        quiz_res = artifacts.generate_quiz(
            {"documentIds": [doc_id], "topic": "Positional Encodings"},
            user=USER,
            db=self.db,
        )
        self.assertEqual(quiz_res["artifactType"], "quiz")
        self.assertGreater(len(quiz_res["questions"]), 0)
        self.assertEqual(quiz_res["questions"][0]["source"]["documentId"], doc_id)

        # 3. Generate Analogy
        analogy_res = artifacts.generate_analogy(
            {"documentIds": [doc_id], "concept": "Self-Attention"},
            user=USER,
            db=self.db,
        )
        self.assertEqual(analogy_res["artifactType"], "analogy")
        self.assertIn("Self-Attention", analogy_res["title"])
        self.assertEqual(analogy_res["citations"][0]["documentId"], doc_id)

        # 4. List artifacts
        list_res = artifacts.list_artifacts(project_id=PROJECT_ID, user=USER, db=self.db)
        self.assertEqual(len(list_res["artifacts"]), 3)

        # 5. Get single artifact
        get_res = artifacts.get_artifact(fc_id, user=USER, db=self.db)
        self.assertEqual(get_res["artifact"]["id"], fc_id)

        # 6. Delete artifact
        del_res = artifacts.delete_artifact(fc_id, user=USER, db=self.db)
        self.assertIsNone(del_res)
        list_after = artifacts.list_artifacts(project_id=PROJECT_ID, user=USER, db=self.db)
        self.assertEqual(len(list_after["artifacts"]), 2)

    def test_hierarchical_mindmap_endpoint(self):
        doc_text = "Backpropagation calculates gradients of the loss function with respect to weights."
        self.upload_doc("backprop.txt", doc_text.encode("utf-8"))

        mm_res = graph.get_hierarchical_mindmap(PROJECT_ID, user=USER, db=self.db)
        self.assertIn("mindmap", mm_res)
        mindmap = mm_res["mindmap"]
        self.assertEqual(mindmap["type"], "project")
        self.assertGreater(len(mindmap["documents"]), 0)

        first_doc = mindmap["documents"][0]
        self.assertEqual(first_doc["type"], "document")
        self.assertIn("topics", first_doc)
        if first_doc["topics"]:
            first_topic = first_doc["topics"][0]
            self.assertEqual(first_topic["type"], "topic")
            self.assertIn("passages", first_topic)

    def test_account_export_and_cascading_deletion(self):
        self.upload_doc("notes.txt", b"Private research notes for account export.")

        # 1. Test Export ZIP
        stream_res = account.export_account_data(user=USER, db=self.db)

        async def collect_bytes():
            chunks = []
            async for chunk in stream_res.body_iterator:
                chunks.append(chunk)
            return b"".join(chunks)

        archive_bytes = asyncio.run(collect_bytes())
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
            namelist = zf.namelist()
            self.assertIn("profile.json", namelist)
            self.assertIn("projects.json", namelist)
            self.assertIn("documents_metadata.json", namelist)

            profile_data = json.loads(zf.read("profile.json"))
            self.assertEqual(profile_data["id"], USER["id"])

        # 2. Test Account Cascading Deletion
        del_res = account.delete_account(user=USER, db=self.db)
        self.assertIsNone(del_res)

        # Verify user is completely removed
        user_check = self.db.execute("SELECT id FROM users WHERE id = ?", (USER["id"],)).fetchone()
        self.assertIsNone(user_check)

        # Verify documents are wiped
        doc_check = self.db.execute("SELECT id FROM documents WHERE project_id = ?", (PROJECT_ID,)).fetchall()
        self.assertEqual(len(doc_check), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
