"""Search routes — Trie autocomplete + inverted-index full-text search."""
from fastapi import APIRouter, Depends, Query

from ..database import get_db
from ..security import get_current_user, get_owned_project
from ..services.indexer import autocomplete, search_project, top_keywords, word_locations, _project_page_map

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search(
    projectId: str = Query(...),
    q: str = Query("", max_length=200),
    limit: int = Query(6, ge=1, le=20),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    get_owned_project(db, user["id"], projectId)
    results = search_project(db, projectId, q.strip(), limit)
    return {"query": q, "results": results, "totalResults": len(results)}


@router.get("/autocomplete")
def autocomplete_route(
    projectId: str = Query(...),
    prefix: str = Query("", max_length=100),
    limit: int = Query(8, ge=1, le=20),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    get_owned_project(db, user["id"], projectId)
    suggestions = autocomplete(db, projectId, prefix.strip(), limit)
    # Enrich each suggestion with where the word lives: document names + pages.
    # Pure page-level lookup — the Trie itself is untouched.
    page_map = _project_page_map(db, projectId)
    for s in suggestions:
        s["locations"] = word_locations(db, projectId, s["word"], page_map)
    return {"suggestions": suggestions}


@router.get("/projects/{project_id}/dsa/top-keywords")
def top_keywords_route(project_id: str, limit: int = Query(20, ge=1, le=50),
                       user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    return {"keywords": top_keywords(db, project_id, limit)}
