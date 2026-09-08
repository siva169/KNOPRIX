"""Auth routes — register / login / refresh / me."""
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
    row = db.execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return _token_response(db, row["id"])


@router.post("/refresh")
def refresh(body: RefreshBody, db=Depends(get_db)):
    try:
        user_id = decode_token(body.refreshToken, cfg.JWT_REFRESH_SECRET)
    except HTTPException:
        raise HTTPException(401, "Invalid or expired refresh token")
    row = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(401, "User no longer exists")
    return _token_response(db, user_id)


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user


@router.post("/logout")
def logout(user=Depends(get_current_user)):
    # Stateless JWT — the client discards tokens. Access token self-expires.
    return {"success": True, "message": "Logged out"}
