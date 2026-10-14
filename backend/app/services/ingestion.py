"""Ingestion pipeline coordinator for Knoprix.

Tracks asynchronous ingestion lifecycle stages:
queued -> extracting -> chunking -> indexing -> ready (or failed)
and persists tables, reading order, and document chunks.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from .chunking import store_document_chunks
from .indexer import rebuild_project_indices

logger = logging.getLogger(__name__)


def create_ingestion_job(db, user_id: str, document_id: str) -> dict[str, Any]:
    """Initialize a queued ingestion job in the database."""
    job_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO ingestion_jobs (id, document_id, user_id, status, progress,
                                    step_detail, error_message, ocr_engine,
                                    ocr_status, ocr_confidence)
        VALUES (?, ?, ?, 'queued', 0, 'Job queued', '', 'none', 'none', 0.0)
        """,
        (job_id, document_id, user_id),
    )
    return {
        "id": job_id,
        "document_id": document_id,
        "user_id": user_id,
        "status": "queued",
        "progress": 0,
        "step_detail": "Job queued",
    }


def update_job_status(
    db,
    job_id: str,
    status: str,
    progress: int,
    step_detail: str = "",
    error_message: str = "",
    ocr_engine: str = "none",
    ocr_status: str = "none",
    ocr_confidence: float = 0.0,
) -> None:
    db.execute(
        """
        UPDATE ingestion_jobs
        SET status = ?, progress = ?, step_detail = ?, error_message = ?,
            ocr_engine = ?, ocr_status = ?, ocr_confidence = ?,
            updated_at = datetime('now')
        WHERE id = ?
        """,
        (
            status,
            progress,
            step_detail,
            error_message,
            ocr_engine,
            ocr_status,
            ocr_confidence,
            job_id,
        ),
    )


def process_document_ingestion(
    db,
    job_id: str,
    document_id: str,
    project_id: str,
    parsed_data: dict[str, Any],
    index_fn=None,
) -> dict[str, Any]:
    """Execute stages: extracting -> chunking -> indexing -> ready."""
    try:
        # Stage 1: Extracting text, tables, reading order
        update_job_status(
            db,
            job_id,
            status="extracting",
            progress=25,
            step_detail="Extracting document structures, tables, and reading order",
            ocr_status=parsed_data.get("ocr_status", "none"),
        )
        tables_json = json.dumps(parsed_data.get("tables", []))
        reading_order_json = json.dumps(parsed_data.get("reading_order", []))
        ocr_status = parsed_data.get("ocr_status", "none")
        ocr_text = parsed_data.get("ocr_text", "")

        db.execute(
            """
            UPDATE documents
            SET tables_json = ?, reading_order_json = ?, ocr_status = ?, ocr_text = ?
            WHERE id = ?
            """,
            (tables_json, reading_order_json, ocr_status, ocr_text, document_id),
        )

        # Stage 2: Chunking into semantic passages
        update_job_status(
            db,
            job_id,
            status="extracting",
            progress=50,
            step_detail="Generating passage chunks with page citations",
        )
        chunks = store_document_chunks(db, document_id, parsed_data.get("pages", []))

        # Stage 3: Indexing into Trie and Inverted Index
        update_job_status(
            db,
            job_id,
            status="indexing",
            progress=75,
            step_detail="Building DSA search indexes (Trie and Inverted Index)",
        )
        if index_fn is not None:
            index_fn(db, project_id)
        else:
            rebuild_project_indices(db, project_id)

        # Stage 4: Ready
        update_job_status(
            db,
            job_id,
            status="ready",
            progress=100,
            step_detail="Document ingestion and indexing ready",
            ocr_status=ocr_status,
        )

        return {
            "job_id": job_id,
            "status": "ready",
            "progress": 100,
            "chunks_count": len(chunks),
            "tables_count": len(parsed_data.get("tables", [])),
            "ocr_status": ocr_status,
        }
    except Exception as exc:
        logger.exception("Ingestion failed for document %s", document_id)
        update_job_status(
            db,
            job_id,
            status="failed",
            progress=0,
            step_detail="Ingestion processing error",
            error_message=str(exc),
        )
        raise
