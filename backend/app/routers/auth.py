"""Auth routes — register / login / refresh / me."""
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..config import cfg
from ..database import get_db
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
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


class RefreshBody(BaseModel):
    refreshToken: str


class FirebaseSessionBody(BaseModel):
    fullName: str | None = Field(default=None, max_length=100)


def _token_response(db, user_id: str) -> dict:
    row = db.execute(
        "SELECT id, email, full_name FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    user = dict(row)
    return {
        "tokens": {
            "accessToken": create_access_token(user_id),
            "refreshToken": create_refresh_token(user_id),
        },
        "user": user,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterBody, request: Request, db=Depends(get_db)):
    if cfg.FIREBASE_PROJECT_ID:
        raise HTTPException(410, "Use Firebase email/password registration")
    if not register_limiter.allow(request.client.host if request.client else "unknown"):
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
    return _token_response(db, user_id)


@router.post("/login")
def login(body: LoginBody, request: Request, db=Depends(get_db)):
    if not login_limiter.allow(request.client.host if request.client else "unknown"):
        raise HTTPException(429, "Too many login attempts. Try again in a minute.")
    email = body.email.strip().lower()
    if email == cfg.DEMO_ACCOUNT_EMAIL and not cfg.ENABLE_DEMO_SEED:
        raise HTTPException(401, "Invalid email or password")
    row = db.execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if row["firebase_uid"]:
        raise HTTPException(401, "Sign in with Firebase to access this account")
    return _token_response(db, row["id"])


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
def refresh(body: RefreshBody, db=Depends(get_db)):
    try:
        user_id = decode_token(body.refreshToken, cfg.JWT_REFRESH_SECRET)
    except HTTPException:
        raise HTTPException(401, "Invalid or expired refresh token")
    row = db.execute(
        "SELECT id, firebase_uid FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(401, "User no longer exists")
    if row["firebase_uid"]:
        raise HTTPException(401, "Use Firebase to refresh this session")
    return _token_response(db, user_id)


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user


@router.post("/logout")
def logout(user=Depends(get_current_user)):
    # Stateless JWT — the client discards tokens. Access token self-expires.
    return {"success": True, "message": "Logged out"}
