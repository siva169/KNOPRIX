"""Unit tests for Backlog A: Google OAuth, Password Recovery, and CAPTCHA defense."""
import base64
import json
import sqlite3
import time
import unittest
from unittest.mock import patch

from app import config, database, security
from app.routers import auth
from app.services import email as email_service


class BacklogAuthTests(unittest.TestCase):
    def setUp(self):
        self.db_url_patch = patch.object(database, "DATABASE_URL", "")
        self.db_url_patch.start()
        self.addCleanup(self.db_url_patch.stop)

        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        database._create_base_schema(self.db)
        database._migrate_legacy_schema(self.db)
        database._create_auth_session_schema(self.db)
        database._create_contacts_sharing_schema(self.db)
        database._create_production_backlog_schema(self.db)
        self.addCleanup(self.db.close)

    def _create_google_jwt(self, sub="g12345", email="googleuser@knoprix.io", name="Google User", verified=True, expired=False):
        header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).decode().rstrip("=")
        now = int(time.time())
        payload_data = {
            "iss": "https://accounts.google.com",
            "sub": sub,
            "email": email,
            "email_verified": verified,
            "name": name,
            "picture": "https://example.com/photo.jpg",
            "aud": "test-client-id",
            "exp": now - 3600 if expired else now + 3600,
        }
        payload = base64.urlsafe_b64encode(json.dumps(payload_data).encode()).decode().rstrip("=")
        sig = "fakesig"
        return f"{header}.{payload}.{sig}"

    def test_google_auth_new_user_and_existing_user(self):
        class DummyResp:
            def __init__(self):
                self.headers = {}
            def set_cookie(self, *a, **k):
                pass

        # 1. New user registration via Google
        jwt = self._create_google_jwt(sub="sub_1001", email="newuser@google.com", name="New Google User")
        res = auth.google_auth(auth.GoogleAuthBody(credential=jwt), DummyResp(), self.db)
        self.assertIn("tokens", res)
        self.assertEqual(res["user"]["email"], "newuser@google.com")

        # Verify record in database has google_id
        row = self.db.execute("SELECT * FROM users WHERE email = 'newuser@google.com'").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["google_id"], "sub_1001")
        self.assertTrue(row["knoprix_id"].startswith("KP-"))

        # 2. Login again with same Google account
        res2 = auth.google_auth(auth.GoogleAuthBody(credential=jwt), DummyResp(), self.db)
        self.assertEqual(res2["user"]["id"], row["id"])

    def test_google_auth_unverified_and_expired(self):
        class DummyResp:
            def set_cookie(self, *a, **k):
                pass

        # Expired token
        jwt_expired = self._create_google_jwt(expired=True)
        with self.assertRaises(auth.HTTPException) as ctx:
            auth.google_auth(auth.GoogleAuthBody(credential=jwt_expired), DummyResp(), self.db)
        self.assertEqual(ctx.exception.status_code, 401)

        # Unverified email
        jwt_unverified = self._create_google_jwt(verified=False)
        with self.assertRaises(auth.HTTPException) as ctx:
            auth.google_auth(auth.GoogleAuthBody(credential=jwt_unverified), DummyResp(), self.db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_password_recovery_and_reset_lifecycle(self):
        email_service.OUTBOX.clear()

        # Seed user
        user_id = "user-recovery-test"
        hashed = security.hash_password("OldPassword123!")
        self.db.execute(
            "INSERT INTO users (id, email, password_hash, full_name, knoprix_id) VALUES (?, ?, ?, ?, ?)",
            (user_id, "recoverme@knoprix.io", hashed, "Recovery User", "KP-TEST01"),
        )
        self.db.commit()

        # 1. Forgot password request
        class DummyRequest:
            client = type("Client", (), {"host": "127.0.0.1"})

        res = auth.forgot_password(auth.ForgotPasswordBody(email="recoverme@knoprix.io"), DummyRequest(), self.db)
        self.assertTrue(res["success"])
        self.assertEqual(len(email_service.OUTBOX), 1)
        self.assertIn("Password Reset Request", email_service.OUTBOX[0]["subject"])

        # Check token stored in database
        tok_row = self.db.execute("SELECT * FROM password_reset_tokens WHERE user_id = ?", (user_id,)).fetchone()
        self.assertIsNotNone(tok_row)
        self.assertIsNone(tok_row["used_at"])

        # Extract token link from outbox
        email_text = email_service.OUTBOX[0]["text"]
        token = email_text.split("token=")[1].split()[0]

        # 2. Reset password with invalid token (fails lookup)
        with self.assertRaises(auth.HTTPException) as ctx:
            auth.reset_password(auth.ResetPasswordBody(token="nonexistent_token_12345", newPassword="ValidPassword123!"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

        # 3. Reset password successfully
        res_reset = auth.reset_password(auth.ResetPasswordBody(token=token, newPassword="NewSecurePassword123!"), self.db)
        self.assertTrue(res_reset["success"])

        # Verify password updated
        updated_user = self.db.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
        self.assertTrue(security.verify_password("NewSecurePassword123!", updated_user["password_hash"]))

        # 4. Token cannot be reused
        with self.assertRaises(auth.HTTPException) as ctx:
            auth.reset_password(auth.ResetPasswordBody(token=token, newPassword="AnotherPassword123!"), self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_captcha_verification_logic(self):
        with patch.object(config.cfg, "TURNSTILE_SECRET_KEY", ""):
            # When unconfigured, passes safely
            self.assertTrue(auth.verify_captcha(None, "127.0.0.1"))
            self.assertTrue(auth.verify_captcha("any-token", "127.0.0.1"))

        with patch.object(config.cfg, "TURNSTILE_SECRET_KEY", "test-secret-key"):
            # When configured, requires token
            self.assertFalse(auth.verify_captcha(None, "127.0.0.1"))
            self.assertFalse(auth.verify_captcha("", "127.0.0.1"))


if __name__ == "__main__":
    unittest.main()
