"""Local database and route tests for legacy account sessions."""
import hashlib
import tempfile
import unittest
from contextlib import closing
from http.cookies import SimpleCookie
from pathlib import Path
from unittest.mock import patch

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request
from starlette.responses import Response

from app import database, security
from app.config import cfg, validate_security_config
from app.routers import auth


class LegacyAuthSessionTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "auth.db"
        self.database_patch = patch.multiple(
            database, DATABASE_URL="", DB_PATH=self.db_path
        )
        self.database_patch.start()
        self.addCleanup(self.database_patch.stop)
        self.config_patch = patch.multiple(
            cfg,
            FIREBASE_PROJECT_ID="",
            ENABLE_DEMO_SEED=False,
            JWT_SECRET="local-test-access-secret-" * 3,
            JWT_REFRESH_SECRET="local-test-refresh-secret-" * 3,
            APP_ENV="development",
            AUTH_COOKIE_SECURE=False,
            AUTH_COOKIE_SAMESITE="lax",
            CORS_ORIGINS=["http://localhost:5173"],
            CORS_ORIGIN_REGEX=None,
        )
        self.config_patch.start()
        self.addCleanup(self.config_patch.stop)
        database.init_db()
        self.db = database.connect()
        self.addCleanup(self.db.close)
        self.origin = "http://localhost:5173"

    def request(self, cookie=None, origin=None, authorization=None):
        headers = []
        if cookie:
            headers.append((b"cookie", f"knoprix_refresh={cookie}".encode()))
        if origin is not None:
            headers.append((b"origin", origin.encode()))
        if authorization:
            headers.append((b"authorization", authorization.encode()))
        return Request({
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/auth/test",
            "raw_path": b"/api/auth/test",
            "query_string": b"",
            "headers": headers,
            "client": ("127.0.0.1", 12345),
            "server": ("localhost", 80),
        })

    def response_cookie(self, response):
        parsed = SimpleCookie()
        parsed.load(response.headers["set-cookie"])
        return parsed["knoprix_refresh"].value

    def register(self, email="reader@example.com"):
        response = Response()
        data = auth.register(
            auth.RegisterBody(
                email=email,
                password="a-private-password",
                fullName="Reader",
            ),
            self.request(origin=self.origin),
            self.db,
            response,
        )
        self.db.commit()
        return data, response

    def login(self):
        response = Response()
        data = auth.login(
            auth.LoginBody(email="reader@example.com", password="a-private-password"),
            self.request(origin=self.origin),
            self.db,
            response,
        )
        self.db.commit()
        return data, response

    def refresh(self, cookie, origin=None):
        response = Response()
        data = auth.refresh(
            self.request(cookie=cookie, origin=origin or self.origin),
            response,
            self.db,
        )
        self.db.commit()
        return data, response

    def current_user(self, access_token):
        return security.get_current_user(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials=access_token),
            self.db,
        )

    def test_login_returns_short_access_token_and_httponly_refresh_cookie_only(self):
        data, response = self.register()
        claims = jwt.decode(data["tokens"]["accessToken"], cfg.JWT_SECRET, algorithms=["HS256"])
        refresh = jwt.decode(
            self.response_cookie(response),
            cfg.JWT_REFRESH_SECRET,
            algorithms=["HS256"],
        )

        self.assertLessEqual(claims["exp"] - claims["iat"], 15 * 60)
        self.assertLessEqual(refresh["exp"] - refresh["iat"], 7 * 24 * 60 * 60)
        self.assertNotIn("refreshToken", data["tokens"])
        self.assertEqual(
            self.db.execute(
                "SELECT token_hash FROM auth_refresh_tokens WHERE session_id = ?",
                (refresh["sid"],),
            ).fetchone()["token_hash"],
            hashlib.sha256(self.response_cookie(response).encode()).hexdigest(),
        )
        cookie = response.headers["set-cookie"].lower()
        self.assertIn("httponly", cookie)
        self.assertIn("path=/api/auth", cookie)
        self.assertEqual(data["user"]["email"], "reader@example.com")

    def test_refresh_rotates_token_and_replay_revokes_the_session(self):
        data, response = self.register()
        original = self.response_cookie(response)
        next_data, next_response = self.refresh(original)
        rotated = self.response_cookie(next_response)
        self.assertNotEqual(original, rotated)
        self.assertNotIn("refreshToken", next_data["tokens"])
        self.assertEqual(self.current_user(next_data["tokens"]["accessToken"])["id"], data["user"]["id"])

        with self.assertRaises(HTTPException) as replay:
            self.refresh(original)
        self.assertEqual(replay.exception.status_code, 401)
        self.assertIn("max-age=0", replay.exception.headers["Set-Cookie"].lower())
        with self.assertRaises(HTTPException) as revoked:
            self.refresh(rotated)
        self.assertEqual(revoked.exception.status_code, 401)

    def test_logout_revokes_current_session_but_preserves_another_device(self):
        first_data, first_response = self.register()
        first_refresh = self.response_cookie(first_response)
        second_data, second_response = self.login()
        second_refresh = self.response_cookie(second_response)
        first_user = self.current_user(first_data["tokens"]["accessToken"])
        logout_response = Response()

        result = auth.logout(
            self.request(
                cookie=first_refresh,
                origin=self.origin,
                authorization=f"Bearer {first_data['tokens']['accessToken']}",
            ),
            logout_response,
            first_user,
            self.db,
        )
        self.db.commit()
        self.assertTrue(result["success"])
        with self.assertRaises(HTTPException):
            self.current_user(first_data["tokens"]["accessToken"])
        self.assertEqual(self.refresh(second_refresh)[0]["user"]["id"], second_data["user"]["id"])

    def test_logout_all_revokes_all_sessions_for_the_same_user(self):
        first_data, _ = self.register()
        second_data, _ = self.login()
        other_data, other_response = self.register("other@example.com")
        user = self.current_user(second_data["tokens"]["accessToken"])

        result = auth.logout_all(Response(), user, self.db)
        self.db.commit()

        self.assertTrue(result["success"])
        with self.assertRaises(HTTPException):
            self.current_user(first_data["tokens"]["accessToken"])
        with self.assertRaises(HTTPException):
            self.current_user(second_data["tokens"]["accessToken"])
        self.assertEqual(
            self.refresh(self.response_cookie(other_response))[0]["user"]["id"],
            other_data["user"]["id"],
        )

    def test_access_token_cannot_use_another_users_session(self):
        user_data, _ = self.register()
        _, other_response = self.register("other@example.com")
        other_claims = jwt.decode(
            self.response_cookie(other_response),
            cfg.JWT_REFRESH_SECRET,
            algorithms=["HS256"],
        )
        forged_pair = security.create_access_token(
            user_data["user"]["id"], other_claims["sid"]
        )
        with self.assertRaises(HTTPException):
            self.current_user(forged_pair)

    def test_refresh_rejects_untrusted_browser_origin(self):
        _, response = self.register()
        with self.assertRaises(HTTPException) as raised:
            self.refresh(
                self.response_cookie(response),
                origin="https://attacker.invalid",
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_refresh_requires_an_allowed_origin(self):
        _, response = self.register()
        with self.assertRaises(HTTPException) as raised:
            auth.refresh(
                self.request(cookie=self.response_cookie(response)),
                Response(),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_login_errors_do_not_reveal_firebase_account_type(self):
        self.db.execute(
            "INSERT INTO users (id, email, password_hash, full_name, firebase_uid) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                "firebase-account",
                "firebase@example.com",
                security.hash_password("wrong-password"),
                "Firebase User",
                "firebase-uid",
            ),
        )
        self.db.commit()
        errors = []
        for email in ("missing@example.com", "firebase@example.com"):
            with self.assertRaises(HTTPException) as raised:
                auth.login(
                    auth.LoginBody(email=email, password="wrong-password"),
                    self.request(origin=self.origin),
                    self.db,
                    Response(),
                )
            errors.append((raised.exception.status_code, raised.exception.detail))
        self.assertEqual(errors[0], errors[1])
        self.assertEqual(errors[0], (401, "Invalid email or password"))

    def test_database_rate_limit_is_shared_and_resets_at_window_boundary(self):
        first = security.DatabaseRateLimiter(2, 60, "qa")
        second = security.DatabaseRateLimiter(2, 60, "qa")
        self.assertTrue(first.allow(self.db, "client", now=120))
        self.assertTrue(second.allow(self.db, "client", now=121))
        self.assertFalse(first.allow(self.db, "client", now=122))
        self.assertTrue(first.allow(self.db, "client", now=180))

    def test_production_config_rejects_default_or_short_jwt_secrets(self):
        production = type("ConfigStub", (), {
            "APP_ENV": "production",
            "JWT_SECRET": "change-me",
            "JWT_REFRESH_SECRET": "a" * 64,
            "AUTH_COOKIE_SECURE": True,
            "AUTH_COOKIE_SAMESITE": "lax",
        })()
        with self.assertRaisesRegex(RuntimeError, "JWT_SECRET"):
            validate_security_config(production)

        production.JWT_SECRET = "0123456789abcdef" * 4
        production.JWT_REFRESH_SECRET = "change-me-refresh"
        with self.assertRaisesRegex(RuntimeError, "JWT_REFRESH_SECRET"):
            validate_security_config(production)

        production.JWT_REFRESH_SECRET = "fedcba9876543210" * 4
        validate_security_config(production)
        production.AUTH_COOKIE_SECURE = False
        with self.assertRaisesRegex(RuntimeError, "AUTH_COOKIE_SECURE"):
            validate_security_config(production)


if __name__ == "__main__":
    unittest.main(verbosity=2)
