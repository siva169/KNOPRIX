"""QA verification for Backlog B & C foundations:
Document Ingestion Pipeline, Chunking, Table Extraction, Reading Order,
OCR Status, and AI Document Grants.
"""
import asyncio
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from docx import Document
from fastapi.datastructures import UploadFile
from starlette.datastructures import Headers

from app import database
from app.routers import documents
from app.services import chunking, pdf_parser

USER = {"id": "user-test-ingest"}
PROJECT_ID = "proj-test-ingest"


class BacklogIngestionTests(unittest.TestCase):
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
            (USER["id"], "researcher@example.com", "hash", "Researcher", "KP-INGEST001"),
        )
        self.db.execute(
            "INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
            (PROJECT_ID, USER["id"], "Quantum Mechanics"),
        )
        self.db.commit()
        self.addCleanup(self.db.close)

        self.upload_dir_patch = patch.object(documents, "UPLOAD_DIR", self.upload_dir)
        self.storage_patch = patch.object(documents.storage, "enabled", return_value=False)
        self.upload_dir_patch.start()
        self.storage_patch.start()
        self.addCleanup(self.upload_dir_patch.stop)
        self.addCleanup(self.storage_patch.stop)

    def upload_doc(self, filename: str, content: bytes, content_type: str = "text/plain"):
        upload = UploadFile(
            file=io.BytesIO(content),
            filename=filename,
            headers=Headers({"content-type": content_type}),
        )
        return asyncio.run(
            documents.upload_document(PROJECT_ID, upload, USER, self.db)
        )

    def test_text_document_ingestion_and_chunking(self):
        # Multi-paragraph text with table and heading
        sample_text = (
            "# Introduction to Quantum Entanglement\n\n"
            "Quantum entanglement is a physical phenomenon that occurs when a group of particles "
            "interact in ways such that the quantum state of each particle cannot be described "
            "independently of the state of the others.\n\n"
            "| Particle | Spin | Entangled |\n"
            "| A | +1/2 | Yes |\n"
            "| B | -1/2 | Yes |\n\n"
            "Bell tests are randomized experiments designed to test whether the real world satisfies "
            "local realism."
        )
        res = self.upload_doc("quantum.txt", sample_text.encode("utf-8"))
        doc = res["document"]
        doc_id = doc["id"]
        job_id = res["jobId"]
        self.assertIsNotNone(job_id)

        # 1. Verify ingestion job status
        status_res = documents.get_document_status(doc_id, USER, self.db)
        job = status_res["job"]
        self.assertEqual(job["status"], "ready")
        self.assertEqual(job["progress"], 100)
        self.assertEqual(job["id"], job_id)

        # 2. Verify chunks endpoint
        chunks_res = documents.get_document_chunks(doc_id, USER, self.db)
        chunks = chunks_res["chunks"]
        self.assertGreater(len(chunks), 0)
        self.assertEqual(chunks[0]["page_number"], 1)
        self.assertIn("Quantum entanglement", chunks[0]["content"])

        # 3. Verify tables extraction endpoint
        tables_res = documents.get_document_tables(doc_id, USER, self.db)
        tables = tables_res["tables"]
        self.assertGreater(len(tables), 0)
        rows = tables[0]["rows"]
        self.assertEqual(rows[0], ["Particle", "Spin", "Entangled"])

        # 4. Verify reading order endpoint
        ro_res = documents.get_document_reading_order(doc_id, USER, self.db)
        reading_order = ro_res["readingOrder"]
        self.assertGreater(len(reading_order), 0)
        self.assertEqual(reading_order[0]["type"], "heading")
        self.assertIn("Introduction to Quantum Entanglement", reading_order[0]["text"])

    def test_ai_document_grants_grant_and_revoke(self):
        res = self.upload_doc("test.txt", b"Short content for grants test")
        doc_id = res["document"]["id"]

        # 1. By default, owner has an active grant
        grants_res = documents.list_ai_grants(USER, self.db)
        granted_docs = [g["document_id"] for g in grants_res["grants"]]
        self.assertIn(doc_id, granted_docs)

        # 2. Revoke grant
        revoke_res = documents.revoke_ai_access(doc_id, purpose="all", user=USER, db=self.db)
        self.assertTrue(revoke_res["revoked"])

        # 3. Verify revoked grant no longer in active grants list
        grants_after = documents.list_ai_grants(USER, self.db)
        active_ids = [g["document_id"] for g in grants_after["grants"]]
        self.assertNotIn(doc_id, active_ids)

        # 4. Re-grant
        regrant_res = documents.grant_ai_access(doc_id, {"purpose": "all"}, USER, self.db)
        self.assertTrue(regrant_res["granted"])

        # 5. Verify restored in active grants
        grants_final = documents.list_ai_grants(USER, self.db)
        final_ids = [g["document_id"] for g in grants_final["grants"]]
        self.assertIn(doc_id, final_ids)

    def test_truth_first_ocr_status_detection(self):
        # Empty scanned image representation
        scanned_res = pdf_parser.extract_document(Path("fake.png"), "png")
        self.assertTrue(scanned_res["is_scanned"])
        # In this environment without tesseract, ocr_status must accurately be 'unavailable'
        self.assertEqual(scanned_res["ocr_status"], "unavailable")
        self.assertEqual(scanned_res["ocr_text"], "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
