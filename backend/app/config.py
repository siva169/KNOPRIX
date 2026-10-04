"""Knoprix v2 — configuration (reads .env / environment)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
UPLOAD_DIR = BASE_DIR / "uploads"
DB_PATH = BASE_DIR / "knoprix.db"


def _load_dotenv():
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


class Config:
    PORT = int(os.getenv("PORT", "8000"))

    JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
    JWT_REFRESH_SECRET = os.getenv("JWT_REFRESH_SECRET", "change-me-refresh")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "500"))
    MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

    # Deployed frontend origins come from the CORS_ORIGINS env var
    # (comma-separated); localhost entries are always allowed for dev.
    CORS_ORIGINS = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "").split(",")
        if o.strip()
    ] + [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX") or None

    OBJECT_STORAGE_BUCKET = os.getenv("OBJECT_STORAGE_BUCKET", "")
    OBJECT_STORAGE_ENDPOINT = os.getenv("OBJECT_STORAGE_ENDPOINT", "")
    OBJECT_STORAGE_API_KEY = os.getenv("OBJECT_STORAGE_API_KEY", "")
    OBJECT_STORAGE_ENABLED = all(
        (
            OBJECT_STORAGE_BUCKET,
            OBJECT_STORAGE_ENDPOINT,
            OBJECT_STORAGE_API_KEY,
        )
    )


# Optional persistent Postgres (Neon/Render Postgres). When set, the backend
# uses Postgres instead of the local SQLite file — required on hosts whose
# disk is ephemeral (Render free tier wipes SQLite on every restart).
DATABASE_URL = os.getenv("DATABASE_URL", "")

cfg = Config()

_storage_values = (
    cfg.OBJECT_STORAGE_BUCKET,
    cfg.OBJECT_STORAGE_ENDPOINT,
    cfg.OBJECT_STORAGE_API_KEY,
)
if any(_storage_values) and not cfg.OBJECT_STORAGE_ENABLED:
    raise RuntimeError(
        "Object storage configuration is incomplete; set bucket, endpoint, "
        "access key, and secret key together"
    )
