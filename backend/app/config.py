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

_PROVIDER_KEY_ENV = {
    "zai-glm-free": ("GLM_API_KEY",),
    "gemini-free": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
    "groq-free": ("GROQ_API_KEY",),
    "openrouter-free": ("OPENROUTER_API_KEY",),
    "openai": ("OPENAI_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
}


def _load_provider_api_keys(environ: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ if environ is None else environ
    keys: dict[str, str] = {}
    for provider_id, env_names in _PROVIDER_KEY_ENV.items():
        for env_name in env_names:
            value = env.get(env_name, "").strip()
            if value:
                keys[provider_id] = value
                break
    return keys


class Config:
    PORT = int(os.getenv("PORT", "8000"))
    APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
    FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    ENABLE_DEMO_SEED = os.getenv("ENABLE_DEMO_SEED", "").lower() in {"1", "true"}
    DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "")
    DEMO_ACCOUNT_EMAIL = "demo@knoprix.io"

    JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
    JWT_REFRESH_SECRET = os.getenv("JWT_REFRESH_SECRET", "change-me-refresh")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    AUTH_COOKIE_NAME = "knoprix_refresh"
    AUTH_COOKIE_PATH = "/api/auth"
    AUTH_COOKIE_SECURE = os.getenv(
        "AUTH_COOKIE_SECURE", "true" if APP_ENV == "production" else "false"
    ).lower() in {"1", "true"}
    AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "lax").lower()

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

    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "").strip()
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
    EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@knoprix.io").strip()

    # --- AI provider credentials (server-side defaults) -------------------
    # BYOK (X-Provider-Key header) always wins. These are fallbacks so the
    # product works out of the box without every user pasting a key. They are
    # read from .env / the environment and are never returned to the browser —
    # the allowlist endpoint only reports *whether* a server key exists.
    PROVIDER_API_KEYS = _load_provider_api_keys()
    DEFAULT_AI_PROVIDER = os.getenv("DEFAULT_AI_PROVIDER", "zai-glm-free").strip()
    DEFAULT_AI_MODEL = os.getenv("DEFAULT_AI_MODEL", "glm-4.5-flash").strip()


# Optional persistent Postgres (Supabase/Render Postgres). When set, the backend
# uses Postgres instead of the local SQLite file — required on hosts whose
# disk is ephemeral (Render free tier wipes SQLite on every restart).
DATABASE_URL = os.getenv("DATABASE_URL", "")

cfg = Config()


def validate_security_config(config=cfg):
    if config.AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
        raise RuntimeError("AUTH_COOKIE_SAMESITE must be lax, strict, or none")
    if config.AUTH_COOKIE_SAMESITE == "none" and not config.AUTH_COOKIE_SECURE:
        raise RuntimeError("AUTH_COOKIE_SECURE must be enabled with SameSite=None")
    if config.APP_ENV != "production":
        return
    if not config.AUTH_COOKIE_SECURE:
        raise RuntimeError("AUTH_COOKIE_SECURE must be enabled in production")
    for name in ("JWT_SECRET", "JWT_REFRESH_SECRET"):
        secret = getattr(config, name)
        if (
            not isinstance(secret, str)
            or secret in {"change-me", "change-me-refresh"}
            or len(secret) < 32
            or len(set(secret)) < 8
        ):
            raise RuntimeError(
                f"{name} must be a high-entropy secret of at least 32 characters in production"
            )
    if config.JWT_SECRET == config.JWT_REFRESH_SECRET:
        raise RuntimeError("JWT_SECRET and JWT_REFRESH_SECRET must be different")


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
