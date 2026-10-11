"""Auth routes — register / login / refresh / me."""
import hashlib
import re
import secrets
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..config import cfg
from ..database import get_db
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token_claims,
    get_current_user,
    get_firebase_claims,
    hash_password,
    login_limiter,
    register_limiter,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    fullName: str = Field(min_length=1, max_length=100)


class LoginBody(BaseModel):
    email: str
    password: str


class FirebaseSessionBody(BaseModel):
    fullName: str | None = Field(default=None, max_length=100)


def _set_refresh_cookie(response: Response, token: str, expires_at: int) -> None:
    response.set_cookie(
        cfg.AUTH_COOKIE_NAME,
        token,
        max_age=max(0, expires_at - int(time.time())),
        httponly=True,
        secure=cfg.AUTH_COOKIE_SECURE,
        samesite=cfg.AUTH_COOKIE_SAMESITE,
        path=cfg.AUTH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        cfg.AUTH_COOKIE_NAME,
        path=cfg.AUTH_COOKIE_PATH,
        httponly=True,
        secure=cfg.AUTH_COOKIE_SECURE,
        samesite=cfg.AUTH_COOKIE_SAMESITE,
    )


def _reject_refresh(response: Response, detail: str) -> None:
    cleared = Response()
    _clear_refresh_cookie(cleared)
    raise HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail,
        headers={"Set-Cookie": cleared.headers["set-cookie"]},
    )


def _assert_trusted_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin or (
        origin not in cfg.CORS_ORIGINS
        and not (
            cfg.CORS_ORIGIN_REGEX
            and re.fullmatch(cfg.CORS_ORIGIN_REGEX, origin)
        )
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Untrusted browser origin")


def _token_response(db, user_id: str, response: Response) -> dict:
    row = db.execute(
        "SELECT id, email, full_name FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    user = dict(row)
    now = int(time.time())
    session_id = str(uuid.uuid4())
    expires_at = now + max(1, min(cfg.REFRESH_TOKEN_EXPIRE_DAYS, 7)) * 86400
    db.execute(
        "DELETE FROM auth_sessions "
        "WHERE user_id = ? AND (revoked_at IS NOT NULL OR expires_at <= ?)",
        (user_id, now),
    )
    db.execute(
        "INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (session_id, user_id, now, expires_at),
    )
    refresh_token = create_refresh_token(user_id, session_id, expires_at)
    db.execute(
        "INSERT INTO auth_refresh_tokens (token_hash, session_id, created_at, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (
            hashlib.sha256(refresh_token.encode("utf-8")).hexdigest(),
            session_id,
            now,
            expires_at,
        ),
    )
    _set_refresh_cookie(response, refresh_token, expires_at)
    return {
        "tokens": {
            "accessToken": create_access_token(user_id, session_id),
        },
        "user": user,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterBody,
    request: Request,
    db=Depends(get_db),
    response: Response = None,
):
    if cfg.FIREBASE_PROJECT_ID:
        raise HTTPException(410, "Use Firebase email/password registration")
    if not register_limiter.allow(
        db, request.client.host if request.client else "unknown"
    ):
        raise HTTPException(429, "Too many accounts created from this address. Try later.")
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Enter a valid email address")
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    user_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)",
        (user_id, email, hash_password(body.password), body.fullName.strip()),
    )
    return _token_response(db, user_id, response)


@router.post("/login")
def login(
    body: LoginBody,
    request: Request,
    db=Depends(get_db),
    response: Response = None,
):
    email = body.email.strip().lower()
    if email == cfg.DEMO_ACCOUNT_EMAIL and not cfg.ENABLE_DEMO_SEED:
        raise HTTPException(401, "Invalid email or password")
    if not login_limiter.allow(
        db, request.client.host if request.client else "unknown"
    ):
        raise HTTPException(429, "Too many login attempts. Try again in a minute.")
    row = db.execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if row["firebase_uid"]:
        raise HTTPException(401, "Invalid email or password")
    return _token_response(db, row["id"], response)


def _get_or_create_firebase_user(db, claims: dict, full_name: str = "") -> dict:
    firebase_uid = claims["sub"]
    email = claims["email"].strip().lower()
    linked = db.execute(
        "SELECT id, email, full_name FROM users WHERE firebase_uid = ?",
        (firebase_uid,),
    ).fetchone()
    if linked:
        return dict(linked)

    existing = db.execute(
        "SELECT id, email, full_name, firebase_uid FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    if existing:
        if existing["firebase_uid"] and existing["firebase_uid"] != firebase_uid:
            raise HTTPException(409, "This email is linked to another Firebase account")
        if claims.get("email_verified") is not True:
            raise HTTPException(
                403,
                "Verify your email before linking this existing Knoprix account",
            )
        db.execute(
            "UPDATE users SET firebase_uid = ? WHERE id = ? AND firebase_uid IS NULL",
            (firebase_uid, existing["id"]),
        )
        linked = db.execute(
            "SELECT id, email, full_name FROM users WHERE firebase_uid = ?",
            (firebase_uid,),
        ).fetchone()
        if linked is None:
            raise HTTPException(409, "This account could not be linked")
        return dict(linked)

    user_id = str(uuid.uuid4())
    full_name = (
        full_name.strip()[:100]
        or (claims.get("name") or "").strip()[:100]
        or email.split("@", 1)[0][:100]
    )
    db.execute(
        "INSERT INTO users (id, email, password_hash, full_name, firebase_uid) "
        "VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
        (
            user_id,
            email,
            hash_password(secrets.token_urlsafe(32)),
            full_name,
            firebase_uid,
        ),
    )
    row = db.execute(
        "SELECT id, email, full_name FROM users WHERE firebase_uid = ?",
        (firebase_uid,),
    ).fetchone()
    if row is None:
        raise HTTPException(409, "This Firebase account could not be linked")
    return dict(row)


@router.post("/firebase/session")
def firebase_session(
    body: FirebaseSessionBody,
    claims=Depends(get_firebase_claims),
    db=Depends(get_db),
):
    return _get_or_create_firebase_user(db, claims, body.fullName or "")


@router.post("/refresh")
def refresh(request: Request, response: Response, db=Depends(get_db)):
    _assert_trusted_origin(request)
    token = request.cookies.get(cfg.AUTH_COOKIE_NAME)
    if not token:
        _reject_refresh(response, "Invalid or expired refresh session")
    try:
        claims = decode_token_claims(token, cfg.JWT_REFRESH_SECRET)
    except HTTPException:
        _reject_refresh(response, "Invalid or expired refresh session")
    user_id = claims.get("sub")
    session_id = claims.get("sid")
    if not all(isinstance(value, str) and value for value in (user_id, session_id, claims.get("jti"))):
        _reject_refresh(response, "Invalid or expired refresh session")

    now = int(time.time())
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = db.execute(
        """
        SELECT rt.used_at, s.user_id, s.expires_at AS session_expires_at, s.revoked_at
        FROM auth_refresh_tokens rt
        JOIN auth_sessions s ON s.id = rt.session_id
        WHERE rt.token_hash = ? AND rt.session_id = ?
        """,
        (token_hash, session_id),
    ).fetchone()
    if row is None or row["user_id"] != user_id:
        _reject_refresh(response, "Invalid or expired refresh session")
    if row["used_at"] is not None:
        db.execute(
            "UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
            (now, session_id),
        )
        db.commit()
        _reject_refresh(response, "Refresh token reuse detected")
    if row["revoked_at"] is not None or row["session_expires_at"] <= now:
        _reject_refresh(response, "Invalid or expired refresh session")
    session_expires_at = row["session_expires_at"]

    updated = db.execute(
        "UPDATE auth_refresh_tokens SET used_at = ? "
        "WHERE token_hash = ? AND used_at IS NULL",
        (now, token_hash),
    )
    if updated.rowcount != 1:
        db.execute(
            "UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
            (now, session_id),
        )
        db.commit()
        _reject_refresh(response, "Refresh token reuse detected")

    row = db.execute(
        "SELECT id, email, full_name, firebase_uid FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        _reject_refresh(response, "User no longer exists")
    if row["firebase_uid"]:
        _reject_refresh(response, "Use Firebase to refresh this session")
    next_refresh = create_refresh_token(user_id, session_id, session_expires_at)
    db.execute(
        "INSERT INTO auth_refresh_tokens (token_hash, session_id, created_at, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (
            hashlib.sha256(next_refresh.encode("utf-8")).hexdigest(),
            session_id,
            now,
            session_expires_at,
        ),
    )
    _set_refresh_cookie(response, next_refresh, session_expires_at)
    return {
        "tokens": {"accessToken": create_access_token(user_id, session_id)},
        "user": {
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
        },
    }


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    authorization = request.headers.get("authorization", "")
    token = authorization.removeprefix("Bearer ").strip()
    claims = decode_token_claims(token, cfg.JWT_SECRET)
    session_id = claims.get("sid")
    if session_id:
        db.execute(
            "UPDATE auth_sessions SET revoked_at = ? "
            "WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
            (int(time.time()), session_id, user["id"]),
        )
    _clear_refresh_cookie(response)
    return {"success": True, "message": "Logged out"}


@router.post("/logout-all")
def logout_all(
    response: Response,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    db.execute(
        "UPDATE auth_sessions SET revoked_at = ? "
        "WHERE user_id = ? AND revoked_at IS NULL",
        (int(time.time()), user["id"]),
    )
    _clear_refresh_cookie(response)
    return {"success": True, "message": "Logged out of all sessions"}
