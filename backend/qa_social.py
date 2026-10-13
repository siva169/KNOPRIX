"""Security-focused tests for Knoprix contacts, annotation links, and shares."""
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app import database
from app.routers import documents, social


class SocialFeatureTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.document_path = Path(self.temp_dir.name) / "notes.txt"
        self.document_path.write_text("private source text", encoding="utf-8")
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(database.SCHEMA)
        self.database_url_patch = patch.object(database, "DATABASE_URL", "")
        self.database_url_patch.start()
        self.addCleanup(self.database_url_patch.stop)
        database._create_auth_session_schema(self.db)
        database._create_contacts_sharing_schema(self.db)
        for user_id, email in (
            ("user-a", "a@example.com"),
            ("user-b", "b@example.com"),
            ("user-c", "c@example.com"),
        ):
            self.db.execute(
                """INSERT INTO users
                   (id, email, password_hash, full_name, knoprix_id)
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, email, "hash", user_id, f"KP-{user_id[-1].upper() * 10}"),
            )
        self.db.execute(
            "INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
            ("project-a", "user-a", "Private project"),
        )
        self.db.execute(
            """INSERT INTO documents
               (id, project_id, file_name, file_type, file_path, extracted_text)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                "document-a",
                "project-a",
                "notes.txt",
                "txt",
                str(self.document_path),
                "private source text",
            ),
        )
        self.users = {
            user_id: {"id": user_id}
            for user_id in ("user-a", "user-b", "user-c")
        }

    def tearDown(self):
        self.db.close()

    def request_contact(self, sender: str, recipient: str) -> str:
        result = social.send_contact_request(
            social.ContactRequestBody(knoprixId=f"KP-{recipient[-1] * 10}"),
            self.users[sender],
            self.db,
        )
        return result["requestId"]

    def accept_contact(self, recipient: str, request_id: str) -> None:
        social.accept_contact_request(request_id, self.users[recipient], self.db)

    def test_contact_requests_are_private_unique_and_do_not_authorize_resources(self):
        request_id = self.request_contact("user-a", "user-b")
        self.assertEqual(social.get_inbox(self.users["user-b"], self.db)["contactRequests"][0]["requestId"], request_id)
        with self.assertRaises(HTTPException) as duplicate:
            self.request_contact("user-b", "user-a")
        self.assertEqual(duplicate.exception.status_code, 409)

        self.accept_contact("user-b", request_id)
        self.assertEqual(len(social.list_contacts(self.users["user-a"], self.db)["contacts"]), 1)
        self.assertFalse(
            social.has_active_document_share(self.db, "user-b", "document-a")
        )
        with self.assertRaises(HTTPException) as unauthorized:
            documents.get_document("document-a", self.users["user-b"], self.db)
        self.assertEqual(unauthorized.exception.status_code, 404)

    def test_share_acceptance_is_per_recipient_read_only_and_revocable(self):
        for recipient in ("user-b", "user-c"):
            self.accept_contact(
                recipient,
                self.request_contact("user-a", recipient),
            )
        created = social.create_shares(
            social.ShareBody(
                recipientKnoprixIds=["KP-BBBBBBBBBB", "KP-CCCCCCCCCC"],
                resourceType="document",
                resourceId="document-a",
            ),
            self.users["user-a"],
            self.db,
        )["shares"]
        self.assertEqual([share["status"] for share in created], ["pending", "pending"])
        share_b, share_c = created

        with self.assertRaises(HTTPException):
            documents.get_document("document-a", self.users["user-b"], self.db)
        social.accept_share(share_b["shareId"], self.users["user-b"], self.db)
        self.assertTrue(
            social.has_active_document_share(self.db, "user-b", "document-a")
        )
        self.assertFalse(
            social.has_active_document_share(self.db, "user-c", "document-a")
        )
        shared_document = documents.get_document(
            "document-a", self.users["user-b"], self.db
        )
        self.assertTrue(shared_document["readOnly"])
        self.assertEqual(shared_document["document"]["extracted_text"], "private source text")
        self.assertEqual(
            documents.get_pages("document-a", self.users["user-b"], self.db)["pages"],
            [],
        )
        stream = documents.stream_document(
            "document-a", self.users["user-b"], self.db
        )
        self.assertEqual(stream.headers["cache-control"], "private, no-store")
        with self.assertRaises(HTTPException):
            documents.delete_document("document-a", self.users["user-b"], self.db)

        social.revoke_share(share_b["shareId"], self.users["user-a"], self.db)
        self.assertFalse(
            social.has_active_document_share(self.db, "user-b", "document-a")
        )
        with self.assertRaises(HTTPException):
            documents.get_document("document-a", self.users["user-b"], self.db)
        with self.assertRaises(HTTPException):
            documents.stream_document("document-a", self.users["user-b"], self.db)
        self.assertEqual(
            self.db.execute("SELECT status FROM shares WHERE id = ?", (share_c["shareId"],)).fetchone()["status"],
            "pending",
        )
        social.accept_share(share_c["shareId"], self.users["user-c"], self.db)
        social.leave_share(share_c["shareId"], self.users["user-c"], self.db)
        self.assertFalse(
            social.has_active_document_share(self.db, "user-c", "document-a")
        )
        pending_again = social.create_shares(
            social.ShareBody(
                recipientKnoprixIds=["KP-CCCCCCCCCC"],
                resourceType="document",
                resourceId="document-a",
            ),
            self.users["user-a"],
            self.db,
        )["shares"][0]["shareId"]
        self.db.execute("DELETE FROM documents WHERE id = 'document-a'")
        self.assertEqual(
            self.db.execute(
                "SELECT status FROM shares WHERE id = ?", (pending_again,)
            ).fetchone()["status"],
            "revoked",
        )

    def test_share_creation_batches_eligibility_lookups_for_twenty_recipients(self):
        recipient_ids = ["KP-BBBBBBBBBB", "KP-CCCCCCCCCC"]
        for number in range(1, 19):
            user_id = f"bench-user-{number:02d}"
            public_id = f"KP-{number:010d}"
            self.db.execute(
                """INSERT INTO users
                   (id, email, password_hash, full_name, knoprix_id)
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, f"{user_id}@example.test", "hash", user_id, public_id),
            )
            low, high = sorted(("user-a", user_id))
            self.db.execute(
                """INSERT INTO contacts (id, user_low, user_high, created_at)
                   VALUES (?, ?, ?, ?)""",
                (str(uuid.uuid4()), low, high, "2026-01-01T00:00:00+00:00"),
            )
            recipient_ids.append(public_id)

        for user_id in ("user-b", "user-c"):
            low, high = sorted(("user-a", user_id))
            self.db.execute(
                """INSERT INTO contacts (id, user_low, user_high, created_at)
                   VALUES (?, ?, ?, ?)""",
                (str(uuid.uuid4()), low, high, "2026-01-01T00:00:00+00:00"),
            )

        statements = []
        self.db.set_trace_callback(statements.append)
        try:
            result = social.create_shares(
                social.ShareBody(
                    recipientKnoprixIds=recipient_ids,
                    resourceType="document",
                    resourceId="document-a",
                ),
                self.users["user-a"],
                self.db,
            )
        finally:
            self.db.set_trace_callback(None)

        self.assertEqual(len(result["shares"]), 20)
        self.assertTrue(all(share["status"] == "pending" for share in result["shares"]))
        self.assertLessEqual(
            len(statements),
            46,
            "recipient eligibility reads should be batched rather than repeated per recipient",
        )

    def test_share_creation_preserves_contact_block_and_self_checks(self):
        self.db.execute(
            """INSERT INTO users
               (id, email, password_hash, full_name, knoprix_id)
               VALUES (?, ?, ?, ?, ?)""",
            ("user-d", "d@example.com", "hash", "user-d", "KP-DDDDDDDDDD"),
        )
        for user_id in ("user-b", "user-c"):
            low, high = sorted(("user-a", user_id))
            self.db.execute(
                """INSERT INTO contacts (id, user_low, user_high, created_at)
                   VALUES (?, ?, ?, ?)""",
                (str(uuid.uuid4()), low, high, "2026-01-01T00:00:00+00:00"),
            )
        self.db.execute(
            """INSERT INTO user_blocks (id, blocker_id, blocked_id, created_at)
               VALUES (?, ?, ?, ?)""",
            (str(uuid.uuid4()), "user-c", "user-a", "2026-01-01T00:00:00+00:00"),
        )

        result = social.create_shares(
            social.ShareBody(
                recipientKnoprixIds=[
                    "KP-BBBBBBBBBB",
                    "KP-CCCCCCCCCC",
                    "KP-AAAAAAAAAA",
                    "KP-DDDDDDDDDD",
                    "KP-EEEEEEEEEE",
                ],
                resourceType="document",
                resourceId="document-a",
            ),
            self.users["user-a"],
            self.db,
        )

        self.assertEqual(
            [share["status"] for share in result["shares"]],
            ["pending", "not_eligible", "not_eligible", "not_eligible", "unavailable"],
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM shares").fetchone()[0],
            1,
        )

    def test_document_share_exposes_only_safe_metadata_and_authorized_content(self):
        self.accept_contact(
            "user-b",
            self.request_contact("user-a", "user-b"),
        )
        share_id = social.create_shares(
            social.ShareBody(
                recipientKnoprixIds=["KP-BBBBBBBBBB"],
                resourceType="document",
                resourceId="document-a",
            ),
            self.users["user-a"],
            self.db,
        )["shares"][0]["shareId"]
        social.accept_share(share_id, self.users["user-b"], self.db)

        shared = social.get_shared_resource(
            share_id, self.users["user-b"], self.db
        )
        self.assertEqual(
            set(shared["resource"]),
            {"id", "file_name", "file_type", "page_count"},
        )
        self.assertNotIn("project_id", shared["resource"])
        self.assertNotIn("extracted_text", shared["resource"])

        detail = documents.get_document(
            "document-a", self.users["user-b"], self.db
        )
        self.assertTrue(detail["readOnly"])
        self.assertEqual(
            detail["document"]["extracted_text"],
            "private source text",
        )
        self.assertEqual(
            set(detail["document"]),
            {"id", "file_name", "file_type", "file_size", "page_count", "extracted_text"},
        )

    def test_annotation_share_omits_internal_owner_and_project_ids(self):
        self.accept_contact(
            "user-b",
            self.request_contact("user-a", "user-b"),
        )
        self.db.execute(
            """INSERT INTO bookmarks
               (id, user_id, project_id, document_id, page_number, name,
                highlighted_text, notes, anchor_start, anchor_end)
               VALUES ('bookmark-a', 'user-a', 'project-a', 'document-a', 1,
                       'Key point', 'important sentence', 'Review this', 2, 19)"""
        )
        self.db.execute(
            """INSERT INTO highlights
               (id, user_id, project_id, document_id, page_number, text, color)
               VALUES ('highlight-a', 'user-a', 'project-a', 'document-a', 1,
                       'important sentence', 'yellow')"""
        )

        for resource_type, resource_id, expected_fields in (
            (
                "bookmark",
                "bookmark-a",
                {"name", "highlighted_text", "notes", "document_id", "page_number",
                 "anchor_start", "anchor_end"},
            ),
            (
                "highlight",
                "highlight-a",
                {"text", "color", "document_id", "page_number"},
            ),
        ):
            with self.subTest(resource_type=resource_type):
                share_id = social.create_shares(
                    social.ShareBody(
                        recipientKnoprixIds=["KP-BBBBBBBBBB"],
                        resourceType=resource_type,
                        resourceId=resource_id,
                    ),
                    self.users["user-a"],
                    self.db,
                )["shares"][0]["shareId"]
                social.accept_share(share_id, self.users["user-b"], self.db)
                shared = social.get_shared_resource(
                    share_id, self.users["user-b"], self.db
                )

                self.assertTrue(expected_fields.issubset(shared["resource"]))
                self.assertNotIn("user_id", shared["resource"])
                self.assertNotIn("project_id", shared["resource"])
                with self.assertRaises(HTTPException) as no_document_access:
                    documents.get_document(
                        "document-a", self.users["user-b"], self.db
                    )
                self.assertEqual(no_document_access.exception.status_code, 404)

    def test_block_removes_contact_cancels_requests_and_revokes_shares(self):
        request_id = self.request_contact("user-a", "user-b")
        self.accept_contact("user-b", request_id)
        share_id = social.create_shares(
            social.ShareBody(
                recipientKnoprixIds=["KP-BBBBBBBBBB"],
                resourceType="document",
                resourceId="document-a",
            ),
            self.users["user-a"],
            self.db,
        )["shares"][0]["shareId"]
        social.accept_share(share_id, self.users["user-b"], self.db)

        social.block_user(
            social.ContactRequestBody(knoprixId="KP-BBBBBBBBBB"),
            self.users["user-a"],
            self.db,
        )
        self.assertFalse(social._is_contact(self.db, "user-a", "user-b"))
        self.assertEqual(
            self.db.execute(
                "SELECT status FROM contact_requests WHERE id = ?", (request_id,)
            ).fetchone()["status"],
            "canceled",
        )
        self.assertFalse(
            social.has_active_document_share(self.db, "user-b", "document-a")
        )
        self.assertEqual(
            self.db.execute(
                "SELECT status FROM shares WHERE id = ?", (share_id,)
            ).fetchone()["status"],
            "revoked",
        )
        with self.assertRaises(HTTPException):
            social.send_contact_request(
                social.ContactRequestBody(knoprixId="KP-AAAAAAAAAA"),
                self.users["user-b"],
                self.db,
            )
        social.unblock_user("KP-BBBBBBBBBB", self.users["user-a"], self.db)
        self.assertFalse(social._is_contact(self.db, "user-a", "user-b"))

    def test_bookmark_highlight_links_are_same_owner_and_page_only(self):
        self.db.execute(
            """INSERT INTO bookmarks
               (id, user_id, project_id, document_id, page_number, name)
               VALUES ('bookmark-a', 'user-a', 'project-a', 'document-a', 1, 'Note')"""
        )
        self.db.execute(
            """INSERT INTO highlights
               (id, user_id, project_id, document_id, page_number, text)
               VALUES ('highlight-a', 'user-a', 'project-a', 'document-a', 1, 'Quote')"""
        )
        self.db.execute(
            """INSERT INTO highlights
               (id, user_id, project_id, document_id, page_number, text)
               VALUES ('highlight-b', 'user-a', 'project-a', 'document-a', 2, 'Other page')"""
        )
        linked = social.link_highlight(
            "bookmark-a",
            social.LinkHighlightBody(highlightId="highlight-a"),
            self.users["user-a"],
            self.db,
        )
        self.assertEqual(linked["highlightId"], "highlight-a")
        with self.assertRaises(HTTPException) as wrong_page:
            social.link_highlight(
                "bookmark-a",
                social.LinkHighlightBody(highlightId="highlight-b"),
                self.users["user-a"],
                self.db,
            )
        self.assertEqual(wrong_page.exception.status_code, 422)
        social.unlink_highlight("bookmark-a", self.users["user-a"], self.db)
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM highlights").fetchone()[0], 2
        )

    def test_lookup_privacy_disablement_prevents_request_creation(self):
        self.db.execute(
            "UPDATE users SET allow_id_lookup = 0 WHERE id = 'user-b'"
        )
        with self.assertRaises(HTTPException) as lookup:
            social.lookup_contact("KP-BBBBBBBBBB", self.users["user-a"], self.db)
        self.assertEqual(lookup.exception.status_code, 404)
        with self.assertRaises(HTTPException) as request:
            self.request_contact("user-a", "user-b")
        self.assertEqual(request.exception.status_code, 404)

    def test_decline_remove_and_unblock_follow_the_expected_lifecycle(self):
        with self.assertRaises(HTTPException) as self_request:
            self.request_contact("user-a", "user-a")
        self.assertEqual(self_request.exception.status_code, 400)
        declined_id = self.request_contact("user-a", "user-c")
        declined = social.decline_contact_request(
            declined_id, self.users["user-c"], self.db
        )
        self.assertEqual(declined["status"], "declined")
        self.assertFalse(social._is_contact(self.db, "user-a", "user-c"))
        retry_id = self.request_contact("user-a", "user-c")
        social.cancel_contact_request(retry_id, self.users["user-a"], self.db)
        self.assertEqual(
            self.db.execute(
                "SELECT status FROM contact_requests WHERE id = ?", (retry_id,)
            ).fetchone()["status"],
            "canceled",
        )
        expired_id = self.request_contact("user-a", "user-c")
        self.db.execute(
            "UPDATE contact_requests SET expires_at = ? WHERE id = ?",
            ("2000-01-01T00:00:00+00:00", expired_id),
        )
        replacement_id = self.request_contact("user-a", "user-c")
        self.assertEqual(
            self.db.execute(
                "SELECT status FROM contact_requests WHERE id = ?", (expired_id,)
            ).fetchone()["status"],
            "expired",
        )
        self.assertNotEqual(expired_id, replacement_id)

        accepted_id = self.request_contact("user-a", "user-b")
        self.accept_contact("user-b", accepted_id)
        social.remove_contact("KP-BBBBBBBBBB", self.users["user-a"], self.db)
        self.assertFalse(social._is_contact(self.db, "user-a", "user-b"))

        social.block_user(
            social.ContactRequestBody(knoprixId="KP-CCCCCCCCCC"),
            self.users["user-a"],
            self.db,
        )
        self.assertEqual(
            social.list_blocks(self.users["user-a"], self.db)["blockedKnoprixIds"],
            ["KP-CCCCCCCCCC"],
        )
        social.unblock_user("KP-CCCCCCCCCC", self.users["user-a"], self.db)
        self.assertEqual(
            social.list_blocks(self.users["user-a"], self.db)["blockedKnoprixIds"],
            [],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
