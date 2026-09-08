"""DSA routes — live stats for the 3 featured structures + manual rebuild."""
from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..dsa.bookmark_collection import BookmarkCollection
from ..security import get_current_user, get_owned_project
from ..services.indexer import get_stats, rebuild_project_indices

router = APIRouter(prefix="/api/projects", tags=["dsa"])


def _bookmark_collection_stats(db, project_id: str, user_id: str) -> dict:
    rows = db.execute(
        """
        SELECT id, page_number, highlighted_text, bookmark_type, document_id
        FROM bookmarks
        WHERE project_id = ? AND user_id = ?
        ORDER BY created_at ASC, id ASC
        """,
        (project_id, user_id),
    ).fetchall()
    collection = BookmarkCollection([dict(r) for r in rows])
    top = collection.newest()
    return {
        "totalBookmarks": collection.size(),
        "isEmpty": collection.is_empty(),
        "topPage": top["page_number"] if top else None,
        "topText": (top["highlighted_text"] or "Page bookmark")[:80] if top else None,
    }


@router.get("/{project_id}/dsa/stats")
def dsa_stats(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    stats = get_stats(db, project_id)
    if stats is None:
        stats = rebuild_project_indices(db, project_id)
    return {
        "stats": {
            "trie": {"totalKeywords": stats.get("keywords", 0)},
            "invertedIndex": {"totalMappings": stats.get("keywords", 0)},
            "bookmarkCollection": _bookmark_collection_stats(db, project_id, user["id"]),
            "updatedAt": stats.get("updated_at"),
        }
    }


@router.post("/{project_id}/dsa/rebuild")
def dsa_rebuild(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    stats = rebuild_project_indices(db, project_id)
    return {"success": True, "stats": stats}
