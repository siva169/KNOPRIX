"""Knoprix — mid-review FastAPI application entrypoint.

Run (from backend/):  py -m uvicorn app.main:app --port 8000
Interactive docs at /docs.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import cfg
from .database import init_db
from .routers import auth, bookmarks, chat, documents, dsa, highlights, projects, search, summary
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed()
    yield


app = FastAPI(
    title="Knoprix API — Mid Review",
    description="DSA-powered document knowledge platform (Trie · Inverted Index · Bookmark Collection)",
    version="0.5.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.CORS_ORIGINS,
    allow_origin_regex=cfg.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(chat.router)
app.include_router(summary.router)
app.include_router(dsa.router)
app.include_router(bookmarks.router)
app.include_router(highlights.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "knoprix-mid-review"}
