"""DSA indexer — builds the Trie + Inverted Index from a project's documents
and persists them as JSON in `dsa_indices`.

Mid-review scope: this build features 3 of the project's 5 data structures:
  - Trie           → autocomplete in the navbar search
  - Inverted Index → ranked full-text search across documents
  - Hash Table + Doubly Linked List → ordered bookmark lookup
(Knowledge Graph and Min-Heap arrive in the final review.)
"""
from __future__ import annotations

import json
import re
from collections import Counter

from ..dsa.inverted_index import InvertedIndex
from ..dsa.trie import Trie

WORD_RE = re.compile(r"[a-zA-Z0-9]+(?:['-][a-zA-Z0-9]+)*")

STOPWORDS = {
    "the", "and", "for", "are", "was", "were", "with", "this", "that",
    "from", "have", "has", "had", "you", "your", "our", "their", "they",
    "will", "would", "can", "could", "should", "shall", "may", "might",
    "not", "but", "its", "it's", "all", "any", "each", "more", "most",
    "some", "such", "than", "then", "there", "these", "those", "into",
    "over", "under", "about", "after", "before", "between", "during",
    "also", "only", "other", "very", "just", "like", "been", "being",
    "does", "doing", "which", "when", "where", "how", "what", "who",
}

# Keep words >= this length (filters noise)
MIN_WORD_LEN = 2


def tokenize(text: str) -> list[str]:
    words = [w.lower() for w in WORD_RE.findall(text or "")]
    return [w for w in words if len(w) >= MIN_WORD_LEN and w not in STOPWORDS]


def rebuild_project_indices(db, project_id: str) -> dict:
    rows = db.execute(
        "SELECT id, extracted_text FROM documents WHERE project_id = ?",
        (project_id,),
    ).fetchall()

    trie = Trie()
    inverted = InvertedIndex()

    freq: Counter = Counter()

    for row in rows:
        words = tokenize(row["extracted_text"])
        inverted.add_document(row["id"], words)
        for w, c in Counter(words).items():
            trie.insert(w, c)
            freq[w] += c

    db.execute("DELETE FROM dsa_indices WHERE project_id = ?", (project_id,))
    db.execute(
        """
        INSERT INTO dsa_indices (project_id, trie_json, inverted_index_json,
                                 total_keywords)
        VALUES (?, ?, ?, ?)
        """,
        (
            project_id,
            json.dumps(trie.to_dict()),
            json.dumps(inverted.to_dict()),
            len(freq),
        ),
    )
    db.execute(
        "UPDATE documents SET is_indexed = 1 WHERE project_id = ?",
        (project_id,),
    )
    db.execute(
        "UPDATE projects SET file_count = (SELECT COUNT(*) FROM documents WHERE project_id = ?) WHERE id = ?",
        (project_id, project_id),
    )

    return {"keywords": len(freq)}


# ── Query helpers ────────────────────────────────────────────────────────────
def _load_indices(db, project_id: str) -> dict | None:
    row = db.execute(
        "SELECT * FROM dsa_indices WHERE project_id = ?", (project_id,)
    ).fetchone()
    if row is None:
        return None
    return {
        "trie": Trie.from_dict(json.loads(row["trie_json"] or "{}")),
        "inverted": InvertedIndex.from_dict(json.loads(row["inverted_index_json"] or "{}")),
        "meta": {
            "keywords": row["total_keywords"],
            "updated_at": row["updated_at"],
        },
    }


def get_stats(db, project_id: str) -> dict | None:
    indices = _load_indices(db, project_id)
    if indices is None:
        return None
    return indices["meta"]


def autocomplete(db, project_id: str, prefix: str, limit: int = 8) -> list[dict]:
    indices = _load_indices(db, project_id)
    if indices is None:
        return []
    return indices["trie"].autocomplete(prefix, limit)


def make_snippet(text: str, words: list[str], radius: int = 130) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    lower = text.lower()
    pos = -1
    for w in words:
        found = lower.find(w)
        if found != -1:
            pos = found
            break
    if pos == -1:
        return text[: radius * 2]
    start = max(0, pos - radius)
    end = min(len(text), pos + radius)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return f"{prefix}{text[start:end]}{suffix}"


# ── Page-level locations (separate lookup — the Trie/Index/collection are untouched) ─
def _project_page_map(db, project_id: str) -> dict[str, list[dict]]:
    """{doc_id: [{page_number, text(lowercased)}]} — page texts for a project,
    loaded once per request so word→page lookups stay in memory."""
    rows = db.execute(
        """
        SELECT dp.document_id, dp.page_number, dp.page_text
        FROM document_pages dp
        JOIN documents d ON d.id = dp.document_id
        WHERE d.project_id = ?
        ORDER BY dp.document_id, dp.page_number
        """,
        (project_id,),
    ).fetchall()
    pages: dict[str, list[dict]] = {}
    for r in rows:
        pages.setdefault(r["document_id"], []).append(
            {"page_number": r["page_number"], "text": (r["page_text"] or "").lower()}
        )
    return pages


def _word_pages(page_map: dict[str, list[dict]], doc_id: str, word: str, cap: int = 8) -> list[int]:
    """Page numbers of `doc_id` whose text contains `word` (case-insensitive)."""
    found: list[int] = []
    for pg in page_map.get(doc_id, []):
        if word in pg["text"]:
            found.append(pg["page_number"])
            if len(found) >= cap:
                break
    return found


def word_locations(db, project_id: str, word: str, page_map: dict | None = None,
                   cap: int = 8) -> list[dict]:
    """[{documentId, fileName, pages}] — where `word` appears, per document."""
    page_map = page_map if page_map is not None else _project_page_map(db, project_id)
    rows = db.execute(
        "SELECT id, file_name FROM documents WHERE project_id = ?", (project_id,)
    ).fetchall()
    out: list[dict] = []
    for r in rows:
        pages = _word_pages(page_map, r["id"], word, cap)
        if pages:
            out.append({"documentId": r["id"], "fileName": r["file_name"], "pages": pages})
    return out


def search_project(db, project_id: str, query: str, limit: int = 6) -> list[dict]:
    indices = _load_indices(db, project_id)
    if indices is None:
        return []
    words = tokenize(query)
    if not words:
        return []
    matches = indices["inverted"].search(words)
    page_map = _project_page_map(db, project_id)
    results = []
    for m in matches[:limit]:
        doc = db.execute(
            "SELECT id, file_name, file_type, extracted_text, page_count FROM documents WHERE id = ?",
            (m["doc_id"],),
        ).fetchone()
        if doc is None:
            continue
        pages = sorted({p for w in words for p in _word_pages(page_map, doc["id"], w)})
        results.append({
            "documentId": doc["id"],
            "fileName": doc["file_name"],
            "fileType": doc["file_type"],
            "score": m["score"],
            "snippet": make_snippet(doc["extracted_text"], words),
            "pageCount": doc["page_count"],
            "pages": pages,
        })
    return results


def top_keywords(db, project_id: str, limit: int = 20) -> list[dict]:
    indices = _load_indices(db, project_id)
    if indices is None:
        return []
    return indices["trie"].top_keywords(limit)
