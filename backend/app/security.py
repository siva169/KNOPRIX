"""Knoprix v2 — auth & security helpers.

- bcrypt password hashing
- JWT access tokens and revocable refresh sessions
- database-backed authentication rate limiting
- object-ownership checks (IDOR protection)
"""
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from .config import cfg
from .database import get_db

_bearer = HTTPBearer(auto_error=False)
_firebase_jwks = jwt.PyJWKClient(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
    timeout=5,
    cache_keys=True,
)


# ── Passwords ────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ── JWT ──────────────────────────────────────────────────────────────────────
def _create_token(
    user_id: str,
    secret: str,
    expires_delta: timedelta,
    session_id: str | None = None,
) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    if session_id:
        payload["sid"] = session_id
    return jwt.encode(payload, secret, algorithm="HS256")


def create_access_token(user_id: str, session_id: str | None = None) -> str:
    return _create_token(
        user_id,
        cfg.JWT_SECRET,
        timedelta(minutes=max(1, min(cfg.ACCESS_TOKEN_EXPIRE_MINUTES, 15))),
        session_id,
    )


def create_refresh_token(user_id: str, session_id: str, expires_at: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "sid": session_id,
        "jti": secrets.token_urlsafe(24),
        "iat": now,
        "exp": datetime.fromtimestamp(expires_at, timezone.utc),
    }
    return jwt.encode(payload, cfg.JWT_REFRESH_SECRET, algorithm="HS256")


def decode_token_claims(token: str, secret: str) -> dict:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def decode_token(token: str, secret: str) -> str:
    """Returns the user_id (sub) or raises HTTPException(401)."""
    try:
        return decode_token_claims(token, secret)["sub"]
    except (KeyError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def verify_firebase_id_token(token: str) -> dict:
    """Verify a Firebase ID token and its required identity claims."""
    if not cfg.FIREBASE_PROJECT_ID:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Firebase auth is not configured")
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not header.get("kid"):
            raise jwt.InvalidTokenError("Unexpected Firebase token header")
        signing_key = _firebase_jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=cfg.FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{cfg.FIREBASE_PROJECT_ID}",
            options={"require": ["exp", "iat", "sub", "aud", "iss", "auth_time"]},
        )
    except PyJWKClientConnectionError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Firebase token verification is temporarily unavailable",
        ) from exc
    except (jwt.InvalidTokenError, PyJWKClientError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Firebase ID token") from exc

    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Firebase token has no valid user ID")
    auth_time = claims["auth_time"]
    if (
        isinstance(auth_time, bool)
        or not isinstance(auth_time, (int, float))
        or auth_time > time.time()
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Firebase authentication time")
    email = claims.get("email")
    if not isinstance(email, str) or "@" not in email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Firebase token has no valid email")
    return claims


# ── Current-user dependency ──────────────────────────────────────────────────
def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db=Depends(get_db),
):
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    token = cred.credentials
    try:
        is_firebase_token = jwt.get_unverified_header(token).get("alg") == "RS256"
    except jwt.InvalidTokenError:
        is_firebase_token = False

    if is_firebase_token:
        claims = verify_firebase_id_token(token)
        row = db.execute(
            "SELECT id, email, full_name FROM users WHERE firebase_uid = ?",
            (claims["sub"],),
        ).fetchone()
    else:
        claims = decode_token_claims(token, cfg.JWT_SECRET)
        user_id = claims.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
        row = db.execute(
            "SELECT id, email, full_name, firebase_uid FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        session_id = claims.get("sid")
        if session_id:
            session = db.execute(
                "SELECT user_id, expires_at, revoked_at FROM auth_sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
            if (
                session is None
                or session["user_id"] != user_id
                or session["revoked_at"] is not None
                or session["expires_at"] <= int(time.time())
            ):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked or expired")
        if (
            row is not None
            and row["email"].lower() == cfg.DEMO_ACCOUNT_EMAIL
            and not cfg.ENABLE_DEMO_SEED
        ):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Use verified Firebase sign-in to access this account",
            )
        if row is not None and row["firebase_uid"]:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Use Firebase to access this account",
            )
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return dict(row)


def get_firebase_claims(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return verify_firebase_id_token(cred.credentials)


# ── Login rate limiting ──────────────────────────────────────────────────────
class DatabaseRateLimiter:
    def __init__(self, max_calls: int, window_seconds: int, scope: str):
        self.max_calls = max_calls
        self.window = window_seconds
        self.scope = scope

    def allow(self, db, key: str, now: int | None = None) -> bool:
        now = int(time.time()) if now is None else now
        window_start = now - now % self.window
        bucket_key = hashlib.sha256(
            f"{self.scope}:{key}".encode("utf-8")
        ).hexdigest()
        db.execute(
            "DELETE FROM auth_rate_limits WHERE window_start < ?",
            (now - 3600,),
        )
        db.execute(
            """
            INSERT INTO auth_rate_limits (bucket_key, window_start, attempts)
            VALUES (?, ?, 1)
            ON CONFLICT(bucket_key) DO UPDATE SET
                window_start = CASE
                    WHEN auth_rate_limits.window_start < ? THEN excluded.window_start
                    ELSE auth_rate_limits.window_start
                END,
                attempts = CASE
                    WHEN auth_rate_limits.window_start < ? THEN 1
                    ELSE auth_rate_limits.attempts + 1
                END
            """,
            (bucket_key, window_start, window_start, window_start),
        )
        attempts = db.execute(
            "SELECT attempts FROM auth_rate_limits WHERE bucket_key = ?",
            (bucket_key,),
        ).fetchone()["attempts"]
        db.commit()
        return attempts <= self.max_calls


login_limiter = DatabaseRateLimiter(max_calls=8, window_seconds=60, scope="login")
register_limiter = DatabaseRateLimiter(max_calls=5, window_seconds=3600, scope="register")


# ── Ownership checks (IDOR protection) ───────────────────────────────────────
def get_owned_project(db, user_id: str, project_id: str) -> dict:
    row = db.execute(
        "SELECT * FROM projects WHERE id = ? AND user_id = ?",
        (project_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return dict(row)


def get_owned_document(db, user_id: str, document_id: str) -> dict:
    row = db.execute(
        """
        SELECT d.* FROM documents d
        JOIN projects p ON p.id = d.project_id
        WHERE d.id = ? AND p.user_id = ?
        """,
        (document_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return dict(row)
