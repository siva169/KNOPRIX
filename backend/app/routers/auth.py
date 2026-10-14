import base64
import hashlib
import json
import re
import secrets
import time
import urllib.parse
import urllib.request
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..config import cfg
from ..database import get_db, new_knoprix_id
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
from ..services.email import send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    fullName: str = Field(min_length=1, max_length=100)
    captchaToken: str | None = None


class LoginBody(BaseModel):
    email: str
    password: str
    captchaToken: str | None = None


class FirebaseSessionBody(BaseModel):
    fullName: str | None = Field(default=None, max_length=100)


class GoogleAuthBody(BaseModel):
    credential: str
    fullName: str | None = None


class ForgotPasswordBody(BaseModel):
    email: str
    captchaToken: str | None = None


class ResetPasswordBody(BaseModel):
    token: str
    newPassword: str = Field(min_length=8, max_length=128)


def verify_captcha(token: str | None, client_ip: str | None = None) -> bool:
    if not cfg.TURNSTILE_SECRET_KEY:
        return True
    if not token:
        return False
    try:
        data = urllib.parse.urlencode({
            "secret": cfg.TURNSTILE_SECRET_KEY,
            "response": token,
            "remoteip": client_ip or "",
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data=data,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            res = json.loads(r.read())
            return res.get("success", False) is True
    except Exception:
        return False


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
    if not verify_captcha(body.captchaToken, request.client.host if request.client else None):
        raise HTTPException(400, "CAPTCHA verification failed.")
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Enter a valid email address")
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    user_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO users (id, email, password_hash, full_name, knoprix_id) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            user_id,
            email,
            hash_password(body.password),
            body.fullName.strip(),
            new_knoprix_id(db),
        ),
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
    if not verify_captcha(body.captchaToken, request.client.host if request.client else None):
        raise HTTPException(400, "CAPTCHA verification failed.")
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
        "INSERT INTO users (id, email, password_hash, full_name, firebase_uid, knoprix_id) "
        "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
        (
            user_id,
            email,
            hash_password(secrets.token_urlsafe(32)),
            full_name,
            firebase_uid,
            new_knoprix_id(db),
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


def _decode_google_jwt(credential: str) -> dict:
    parts = credential.split(".")
    if len(parts) != 3:
        raise HTTPException(400, "Malformed Google identity credential")
    try:
        padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Could not decode Google identity credential")

    iss = payload.get("iss", "")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(400, "Invalid credential issuer")
    if cfg.GOOGLE_CLIENT_ID and payload.get("aud") != cfg.GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Invalid credential audience")
    if payload.get("exp", 0) < int(time.time()):
        raise HTTPException(401, "Google identity credential has expired")
    if not payload.get("email_verified"):
        raise HTTPException(403, "Google email must be verified to sign in")
    return payload


@router.post("/google")
def google_auth(
    body: GoogleAuthBody,
    response: Response,
    db=Depends(get_db),
):
    payload = _decode_google_jwt(body.credential)
    sub = payload["sub"]
    email = payload["email"].strip().lower()
    name = (body.fullName or payload.get("name") or email.split("@")[0]).strip()[:100]
    picture = payload.get("picture", "")

    user = db.execute("SELECT * FROM users WHERE google_id = ?", (sub,)).fetchone()
    if user:
        return _token_response(db, user["id"], response)

    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user:
        db.execute(
            "UPDATE users SET google_id = ?, avatar_url = COALESCE(NULLIF(avatar_url, ''), ?) WHERE id = ?",
            (sub, picture, user["id"]),
        )
        return _token_response(db, user["id"], response)

    user_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO users (id, email, password_hash, full_name, google_id, avatar_url, knoprix_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            user_id,
            email,
            hash_password(secrets.token_urlsafe(32)),
            name,
            sub,
            picture,
            new_knoprix_id(db),
        ),
    )
    return _token_response(db, user_id, response)


@router.post("/forgot-password")
def forgot_password(
    body: ForgotPasswordBody,
    request: Request,
    db=Depends(get_db),
):
    if not login_limiter.allow(db, request.client.host if request.client else "unknown"):
        raise HTTPException(429, "Too many password recovery attempts. Try later.")
    if not verify_captcha(body.captchaToken, request.client.host if request.client else None):
        raise HTTPException(400, "CAPTCHA verification failed.")

    email = body.email.strip().lower()
    row = db.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone()
    if row:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        now = int(time.time())
        expires_at = now + 3600
        db.execute(
            "UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
            (now, row["id"]),
        )
        db.execute(
            "INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (token_hash, row["id"], now, expires_at),
        )
        send_password_reset_email(row["email"], token)

    return {
        "success": True,
        "message": "If an account exists with that email, a password reset link has been dispatched.",
    }


@router.post("/reset-password")
def reset_password(
    body: ResetPasswordBody,
    db=Depends(get_db),
):
    if len(body.newPassword) < 8:
        raise HTTPException(400, "Password must be at least 8 characters long.")

    token_hash = hashlib.sha256(body.token.encode("utf-8")).hexdigest()
    now = int(time.time())
    token_row = db.execute(
        "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
        (token_hash, now),
    ).fetchone()

    if not token_row:
        raise HTTPException(400, "Invalid or expired password reset link.")

    user_id = token_row["user_id"]
    new_hash = hash_password(body.newPassword)

    db.execute(
        "UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?",
        (now, token_hash),
    )
    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (new_hash, user_id),
    )
    db.execute(
        "UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
        (now, user_id),
    )
    return {
        "success": True,
        "message": "Password has been successfully reset. Please log in with your new password.",
    }


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


@router.post("/logout-cookie")
def logout_cookie(request: Request, response: Response, db=Depends(get_db)):
    _assert_trusted_origin(request)
    refresh_token = request.cookies.get(cfg.AUTH_COOKIE_NAME)
    if refresh_token:
        token_hash = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
        row = db.execute(
            "SELECT session_id FROM auth_refresh_tokens WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()
        if row is not None:
            db.execute(
                "UPDATE auth_sessions SET revoked_at = ? "
                "WHERE id = ? AND revoked_at IS NULL",
                (int(time.time()), row["session_id"]),
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
