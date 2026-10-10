"""Focused tests for Firebase token verification and Knoprix account linking."""
import asyncio
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import database, security
from app.routers import auth
from app.routers.auth import RegisterBody, _get_or_create_firebase_user

PROJECT_ID = "knoprix-a647"


class FirebaseAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.private_pem = cls.private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        cls.public_key = cls.private_key.public_key()

    def token(self, **overrides):
        now = int(time.time())
        claims = {
            "iss": f"https://securetoken.google.com/{PROJECT_ID}",
            "aud": PROJECT_ID,
            "sub": "firebase-user-1",
            "email": "reader@example.com",
            "email_verified": True,
            "iat": now,
            "exp": now + 3600,
            "auth_time": now,
            "name": "Reader One",
        }
        claims.update(overrides)
        return jwt.encode(
            claims,
            self.private_pem,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )

    def verify(self, token):
        jwks = SimpleNamespace(
            get_signing_key_from_jwt=lambda _: SimpleNamespace(key=self.public_key)
        )
        with (
            patch.object(security.cfg, "FIREBASE_PROJECT_ID", PROJECT_ID),
            patch.object(security, "_firebase_jwks", jwks),
        ):
            return security.verify_firebase_id_token(token)

    def test_accepts_valid_signed_project_token(self):
        claims = self.verify(self.token())
        self.assertEqual(claims["sub"], "firebase-user-1")

    def test_fails_closed_when_firebase_project_is_not_configured(self):
        with patch.object(security.cfg, "FIREBASE_PROJECT_ID", ""):
            with self.assertRaises(HTTPException) as raised:
                security.verify_firebase_id_token("unverified-token")
        self.assertEqual(raised.exception.status_code, 503)

    def test_legacy_registration_is_disabled_when_firebase_is_configured(self):
        with patch.object(auth.cfg, "FIREBASE_PROJECT_ID", PROJECT_ID):
            with self.assertRaises(HTTPException) as raised:
                auth.register(
                    RegisterBody(
                        email="reader@example.com",
                        password="password123",
                        fullName="Reader One",
                    ),
                    SimpleNamespace(client=None),
                    db=None,
                )
        self.assertEqual(raised.exception.status_code, 410)

    def test_startup_does_not_create_demo_account_without_explicit_opt_in(self):
        from app import main

        async def start_app():
            async with main.lifespan(None):
                pass

        with (
            patch.object(main, "init_db"),
            patch.object(main, "seed") as seed_demo,
            patch.object(main.cfg, "ENABLE_DEMO_SEED", False, create=True),
        ):
            asyncio.run(start_app())
        seed_demo.assert_not_called()

    def test_seed_refuses_to_run_without_local_opt_in(self):
        from app import seed as demo_seed

        with (
            patch.object(
                demo_seed,
                "cfg",
                SimpleNamespace(ENABLE_DEMO_SEED=False),
                create=True,
            ),
            patch.object(demo_seed, "connect", side_effect=RuntimeError) as connect,
        ):
            with self.assertRaises(RuntimeError):
                demo_seed.seed()
        connect.assert_not_called()

    def test_seed_refuses_firebase_or_postgres_configuration(self):
        from app import seed as demo_seed

        with (
            patch.object(
                demo_seed,
                "cfg",
                SimpleNamespace(
                    ENABLE_DEMO_SEED=True,
                    FIREBASE_PROJECT_ID=PROJECT_ID,
                    DEMO_PASSWORD="private-local-password",
                ),
                create=True,
            ),
            patch.object(demo_seed, "DATABASE_URL", ""),
            patch.object(demo_seed, "connect") as connect,
        ):
            with self.assertRaises(RuntimeError):
                demo_seed.seed()
        connect.assert_not_called()

    def test_seed_replaces_any_existing_demo_password_with_local_secret(self):
        from app import seed as demo_seed

        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "demo.db"
            upload_dir = Path(directory) / "uploads"
            upload_dir.mkdir()
            conn = sqlite3.connect(database_path)
            conn.row_factory = sqlite3.Row
            conn.executescript(database.SCHEMA)
            conn.commit()
            conn.close()

            config = SimpleNamespace(
                ENABLE_DEMO_SEED=True,
                FIREBASE_PROJECT_ID="",
                DEMO_PASSWORD="first-private-password",
                DEMO_ACCOUNT_EMAIL="demo@knoprix.io",
            )

            def connect_local_db():
                local = sqlite3.connect(database_path)
                local.row_factory = sqlite3.Row
                return local

            with (
                patch.object(demo_seed, "cfg", config),
                patch.object(demo_seed, "DATABASE_URL", ""),
                patch.object(demo_seed, "UPLOAD_DIR", upload_dir),
                patch.object(demo_seed, "connect", side_effect=connect_local_db),
                patch.object(demo_seed, "rebuild_project_indices"),
            ):
                demo_seed.seed()
                config.DEMO_PASSWORD = "second-private-password"
                demo_seed.seed()

            conn = sqlite3.connect(database_path)
            password_hash = conn.execute(
                "SELECT password_hash FROM users WHERE email = ?",
                ("demo@knoprix.io",),
            ).fetchone()[0]
            conn.close()
        self.assertFalse(
            security.verify_password("legacy-public-demo-password", password_hash)
        )
        self.assertTrue(
            security.verify_password("second-private-password", password_hash)
        )

    def test_demo_account_cannot_use_legacy_password_login(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT, email TEXT, password_hash TEXT, full_name TEXT, firebase_uid TEXT)"
        )
        conn.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?, NULL)",
            (
                "user-demo-1",
                "demo@knoprix.io",
                security.hash_password("legacy-public-demo-password"),
                "Demo User",
            ),
        )
        with (
            patch.object(auth.cfg, "ENABLE_DEMO_SEED", False, create=True),
            self.assertRaises(HTTPException) as raised,
        ):
            auth.login(
                auth.LoginBody(
                    email="demo@knoprix.io", password="legacy-public-demo-password"
                ),
                SimpleNamespace(client=None),
                conn,
            )
        self.assertEqual(raised.exception.status_code, 401)
        conn.close()

    def test_demo_account_legacy_tokens_are_rejected(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT, email TEXT, full_name TEXT, firebase_uid TEXT)"
        )
        conn.execute(
            "INSERT INTO users VALUES (?, ?, ?, NULL)",
            ("user-demo-1", "demo@knoprix.io", "Demo User"),
        )
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials=security.create_access_token("user-demo-1")
        )
        with (
            patch.object(security.cfg, "ENABLE_DEMO_SEED", False, create=True),
            self.assertRaises(HTTPException) as raised,
        ):
            security.get_current_user(credentials, conn)
        self.assertEqual(raised.exception.status_code, 401)
        conn.close()

    def test_demo_account_remains_available_to_verified_firebase_owner(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT, email TEXT, full_name TEXT, firebase_uid TEXT)"
        )
        conn.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?)",
            ("user-demo-1", "demo@knoprix.io", "Demo User", "firebase-user-1"),
        )
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials=self.token(email="demo@knoprix.io")
        )
        jwks = SimpleNamespace(
            get_signing_key_from_jwt=lambda _: SimpleNamespace(key=self.public_key)
        )
        with (
            patch.object(security.cfg, "FIREBASE_PROJECT_ID", PROJECT_ID),
            patch.object(security.cfg, "ENABLE_DEMO_SEED", False, create=True),
            patch.object(security, "_firebase_jwks", jwks),
        ):
            user = security.get_current_user(credentials, conn)
        self.assertEqual(user["id"], "user-demo-1")
        conn.close()

    def test_rejects_wrong_project_audience(self):
        with self.assertRaises(HTTPException) as raised:
            self.verify(self.token(aud="another-project"))
        self.assertEqual(raised.exception.status_code, 401)

    def test_rejects_wrong_issuer(self):
        with self.assertRaises(HTTPException) as raised:
            self.verify(self.token(iss="https://securetoken.google.com/another-project"))
        self.assertEqual(raised.exception.status_code, 401)

    def test_rejects_expired_token(self):
        with self.assertRaises(HTTPException) as raised:
            self.verify(self.token(exp=int(time.time()) - 10))
        self.assertEqual(raised.exception.status_code, 401)

    def test_rejects_tampered_signature(self):
        parts = self.token().split(".")
        parts[2] = ("A" if parts[2][0] != "A" else "B") + parts[2][1:]
        with self.assertRaises(HTTPException) as raised:
            self.verify(".".join(parts))
        self.assertEqual(raised.exception.status_code, 401)

    def test_signing_key_unavailable_returns_service_unavailable(self):
        class UnavailableJwks:
            def get_signing_key_from_jwt(self, _token):
                raise jwt.PyJWKClientConnectionError("network unavailable")

        with (
            patch.object(security.cfg, "FIREBASE_PROJECT_ID", PROJECT_ID),
            patch.object(security, "_firebase_jwks", UnavailableJwks()),
        ):
            with self.assertRaises(HTTPException) as raised:
                security.verify_firebase_id_token(self.token())
        self.assertEqual(raised.exception.status_code, 503)

    def test_requires_verified_email(self):
        with self.assertRaises(HTTPException) as raised:
            self.verify(self.token(email_verified=False))
        self.assertEqual(raised.exception.status_code, 403)

    def test_rejects_future_authentication_time(self):
        with self.assertRaises(HTTPException) as raised:
            self.verify(self.token(auth_time=int(time.time()) + 60))
        self.assertEqual(raised.exception.status_code, 401)

    def test_rejects_malformed_authentication_time(self):
        with self.assertRaises(HTTPException) as raised:
            self.verify(self.token(auth_time="not-a-time"))
        self.assertEqual(raised.exception.status_code, 401)

    def test_firebase_bearer_resolves_linked_user(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, full_name TEXT, firebase_uid TEXT)"
        )
        conn.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?)",
            ("knoprix-id", "reader@example.com", "Reader One", "firebase-user-1"),
        )
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials=self.token()
        )
        jwks = SimpleNamespace(
            get_signing_key_from_jwt=lambda _: SimpleNamespace(key=self.public_key)
        )
        with (
            patch.object(security.cfg, "FIREBASE_PROJECT_ID", PROJECT_ID),
            patch.object(security, "_firebase_jwks", jwks),
        ):
            user = security.get_current_user(credentials, conn)
        self.assertEqual(user["id"], "knoprix-id")
        conn.close()

    def test_legacy_session_remains_valid_until_account_is_linked(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, full_name TEXT, firebase_uid TEXT)"
        )
        conn.execute(
            "INSERT INTO users VALUES (?, ?, ?, NULL)",
            ("knoprix-id", "reader@example.com", "Reader One"),
        )
        legacy_token = security.create_access_token("knoprix-id")
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials=legacy_token
        )
        self.assertEqual(
            security.get_current_user(credentials, conn)["id"], "knoprix-id"
        )
        conn.execute(
            "UPDATE users SET firebase_uid = ? WHERE id = ?",
            ("firebase-user-1", "knoprix-id"),
        )
        with self.assertRaises(HTTPException) as raised:
            security.get_current_user(credentials, conn)
        self.assertEqual(raised.exception.status_code, 401)
        conn.close()

    def test_links_existing_account_without_changing_project_owner(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript(
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,
                full_name TEXT, firebase_uid TEXT
            );
            CREATE TABLE projects (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL
            );
            INSERT INTO users VALUES ('knoprix-id', 'reader@example.com', 'legacy-hash', 'Reader One', NULL);
            INSERT INTO projects VALUES ('project-id', 'knoprix-id');
            """
        )
        linked = _get_or_create_firebase_user(
            conn,
            {
                "sub": "firebase-user-1",
                "email": "READER@example.com",
                "email_verified": True,
            },
            "Should Not Replace Existing Name",
        )
        owner = conn.execute(
            "SELECT user_id FROM projects WHERE id = 'project-id'"
        ).fetchone()["user_id"]
        uid = conn.execute(
            "SELECT firebase_uid FROM users WHERE id = 'knoprix-id'"
        ).fetchone()["firebase_uid"]
        self.assertEqual(linked["id"], "knoprix-id")
        self.assertEqual(owner, "knoprix-id")
        self.assertEqual(uid, "firebase-user-1")
        self.assertEqual(linked["full_name"], "Reader One")
        conn.close()

    def test_creates_firebase_user_with_submitted_profile_name(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, full_name TEXT, firebase_uid TEXT)"
        )
        user = _get_or_create_firebase_user(
            conn,
            {
                "sub": "firebase-user-1",
                "email": "reader@example.com",
                "email_verified": True,
            },
            "Reader One",
        )
        self.assertEqual(user["full_name"], "Reader One")
        conn.close()

    def test_repeated_session_sync_returns_same_user(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, full_name TEXT, firebase_uid TEXT UNIQUE)"
        )
        claims = {
            "sub": "firebase-user-1",
            "email": "reader@example.com",
            "email_verified": True,
        }
        first = _get_or_create_firebase_user(conn, claims, "Reader One")
        second = _get_or_create_firebase_user(conn, claims, "Reader One")
        self.assertEqual(first, second)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0], 1)
        conn.close()

    def test_refuses_to_link_email_already_assigned_to_another_uid(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, full_name TEXT, firebase_uid TEXT)"
        )
        conn.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?)",
            ("knoprix-id", "reader@example.com", "Reader One", "other-firebase-user"),
        )
        with self.assertRaises(HTTPException) as raised:
            _get_or_create_firebase_user(
                conn,
                {
                    "sub": "firebase-user-1",
                    "email": "reader@example.com",
                    "email_verified": True,
                },
            )
        self.assertEqual(raised.exception.status_code, 409)
        conn.close()

    def test_additive_database_migration_preserves_existing_user(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "knoprix.db"
            conn = sqlite3.connect(path)
            conn.execute(
                """
                CREATE TABLE users (
                    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL, full_name TEXT NOT NULL,
                    created_at TEXT
                )
                """
            )
            conn.execute(
                "INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                ("legacy-id", "reader@example.com", "legacy-hash", "Reader One", "today"),
            )
            conn.commit()
            conn.close()

            with patch.object(database, "DATABASE_URL", ""), patch.object(
                database, "DB_PATH", path
            ):
                database.init_db()

            conn = sqlite3.connect(path)
            user = conn.execute(
                "SELECT id, email, password_hash, full_name, firebase_uid FROM users"
            ).fetchone()
            conn.close()
        self.assertEqual(user, ("legacy-id", "reader@example.com", "legacy-hash", "Reader One", None))


if __name__ == "__main__":
    unittest.main(verbosity=2)
