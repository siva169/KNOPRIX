"""Knoprix v2 — auth & security helpers.

- bcrypt password hashing
- JWT access + refresh tokens (PyJWT)
- login rate limiting (in-memory)
- object-ownership checks (IDOR protection)
"""
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import cfg
from .database import get_db

_bearer = HTTPBearer(auto_error=False)


# ── Passwords ────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ── JWT ──────────────────────────────────────────────────────────────────────
def _create_token(user_id: str, secret: str, expires_delta: timedelta) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, cfg.JWT_SECRET,
                         timedelta(minutes=cfg.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, cfg.JWT_REFRESH_SECRET,
                         timedelta(days=cfg.REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str, secret: str) -> str:
    """Returns the user_id (sub) or raises HTTPException(401)."""
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


# ── Current-user dependency ──────────────────────────────────────────────────
def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db=Depends(get_db),
):
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user_id = decode_token(cred.credentials, cfg.JWT_SECRET)
    row = db.execute("SELECT id, email, full_name FROM users WHERE id = ?",
                     (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return dict(row)


# ── Login rate limiting ──────────────────────────────────────────────────────
class RateLimiter:
    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        dq = self._hits[key]
        while dq and now - dq[0] > self.window:
            dq.popleft()
        if len(dq) >= self.max_calls:
            return False
        dq.append(now)
        return True


login_limiter = RateLimiter(max_calls=8, window_seconds=60)
register_limiter = RateLimiter(max_calls=5, window_seconds=3600)


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
