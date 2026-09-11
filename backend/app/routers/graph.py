"""Knowledge Graph routes — auto concepts + user-pinned words.

Pipeline (every word scanned, glue dropped):
1. tokenize() reads EVERY word of every doc (length + stopword filter).
2. Per-doc top concepts by frequency (cap: TOP_PER_DOC).
3. Pins (user-tracked words) are force-added even when rare.
4. Edges: concept pairs sharing >= MIN_STRENGTH documents.

Review-proof: no AI key, no internet — pure DSA over the existing index.
"""
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..security import get_current_user, get_owned_project
from ..services.indexer import _project_page_map, tokenize, word_locations

router = APIRouter(prefix="/api", tags=["graph"])

TOP_PER_DOC = 30
MIN_STRENGTH = 2
MAX_WORD_LEN = 40

# Prepositions the shared tokenizer keeps (search-safe there) but which are
# pure glue on a concept map. Kept LOCAL so search indices never shift.
EXTRA_GLUE = {
    "across", "among", "around", "behind", "along", "toward", "towards",
    "upon", "within", "without",
}


def _ensure_pins_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS pinned_concepts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            word TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, project_id, word)
        )
        """
    )


def _doc_concepts(page_map: dict, doc_id: str) -> Counter:
    """Frequency of meaningful words in ONE document (glue already filtered)."""
    counts: Counter = Counter()
    for page in page_map.get(doc_id, []):
        counts.update(w for w in tokenize(page.get("text", "")) if w not in EXTRA_GLUE)
    return counts


@router.get("/projects/{project_id}/graph")
def get_graph(project_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    _ensure_pins_table(db)

    rows = db.execute(
        "SELECT id, file_name FROM documents WHERE project_id = ?",
        (project_id,),
    ).fetchall()
    if not rows:
        return {"nodes": [], "edges": [], "pinned": []}
    page_map = _project_page_map(db, project_id)

    pins = {
        r["word"] for r in db.execute(
            "SELECT word FROM pinned_concepts WHERE user_id = ? AND project_id = ?",
            (user["id"], project_id),
        ).fetchall()
    }

    # Per-doc concept sets: top-N by frequency + every pin present in the doc.
    doc_sets: dict[str, set[str]] = {}
    for r in rows:
        counts = _doc_concepts(page_map, r["id"])
        top = {w for w, _ in counts.most_common(TOP_PER_DOC)}
        top |= {w for w in pins if counts.get(w, 0) > 0}
        doc_sets[r["id"]] = top

    # Nodes: concept -> documents + pages (reuse word_locations).
    concepts = sorted({w for s in doc_sets.values() for w in s})
    nodes = []
    for w in concepts:
        locs = word_locations(db, project_id, w, page_map)
        nodes.append({
            "id": w,
            "label": w,
            "pinned": w in pins,
            "documents": locs,
            "docCount": len(locs),
        })

    # Edges: pairs co-occurring in >= MIN_STRENGTH docs (combination scan).
    clist = concepts
    in_doc = {w: {d for d, s in doc_sets.items() if w in s} for w in clist}
    edges = []
    for i in range(len(clist)):
        for j in range(i + 1, len(clist)):
            shared = in_doc[clist[i]] & in_doc[clist[j]]
            if len(shared) >= MIN_STRENGTH:
                edges.append({
                    "a": clist[i], "b": clist[j],
                    "strength": len(shared), "documents": sorted(shared),
                })

    return {
        "nodes": nodes,
        "edges": edges,
        "pinned": sorted(pins),
        "params": {"topPerDoc": TOP_PER_DOC, "minStrength": MIN_STRENGTH},
    }


@router.post("/projects/{project_id}/pins", status_code=201)
def pin_word(project_id: str, body: dict,
             user=Depends(get_current_user), db=Depends(get_db)):
    """Track one word: it joins the graph even when rare. Unpin anytime."""
    get_owned_project(db, user["id"], project_id)
    _ensure_pins_table(db)
    word = (body.get("word") or "").strip().lower() if isinstance(body, dict) else ""
    if not word or len(word) > MAX_WORD_LEN or not word.replace("-", "").isalnum():
        raise HTTPException(400, "Give one plain word (letters/numbers, max 40).")
    import uuid
    try:
        db.execute(
            "INSERT INTO pinned_concepts (id, user_id, project_id, word) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), user["id"], project_id, word),
        )
    except Exception:
        raise HTTPException(409, f"'{word}' is already pinned.")
    return {"word": word, "pinned": True}


@router.delete("/projects/{project_id}/pins/{word}", status_code=204)
def unpin_word(project_id: str, word: str,
               user=Depends(get_current_user), db=Depends(get_db)):
    get_owned_project(db, user["id"], project_id)
    _ensure_pins_table(db)
    db.execute(
        "DELETE FROM pinned_concepts WHERE user_id = ? AND project_id = ? AND word = ?",
        (user["id"], project_id, word.strip().lower()),
    )
    return None
