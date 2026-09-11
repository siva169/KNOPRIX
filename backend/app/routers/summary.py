"""Summary routes — extractive, key-free, deterministic.

No provider, no key, no randomness: picks the highest-weight sentences by
word frequency (stopwords ignored), returned in reading order. Honest label:
'extractive' — it quotes the document, never invents. An abstractive
(free-model) summary can layer on later behind the same response shape.
"""
import re
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..security import get_current_user, get_owned_document

router = APIRouter(prefix="/api", tags=["summary"])

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "is", "are", "was", "were", "be", "been", "it",
    "this", "that", "these", "those", "as", "from", "into", "over", "after",
    "such", "no", "not", "only", "own", "same", "so", "than", "too", "very",
    "can", "will", "just", "if", "we", "you", "they", "he", "she", "his",
    "her", "its", "our", "their", "what", "which", "who", "when", "where",
}

SENT_RE = re.compile(r"(?<=[.!?])\s+")
WORD_RE = re.compile(r"[a-z0-9]+")


def _sentences(text: str) -> list[str]:
    parts = [s.strip() for s in SENT_RE.split(text.strip()) if s.strip()]
    # Drop fragments too short to carry meaning (page numbers, captions).
    return [s for s in parts if len(s.split()) >= 5]


@router.post("/documents/{document_id}/summary")
def summarize_document(document_id: str, body: dict,
                       user=Depends(get_current_user), db=Depends(get_db)):
    doc = get_owned_document(db, user["id"], document_id)
    text = (doc.get("extracted_text") or "").strip()
    if not text:
        raise HTTPException(422, "Document has no readable text to summarize.")

    max_sentences = body.get("maxSentences", 5) if isinstance(body, dict) else 5
    if not isinstance(max_sentences, int) or not 1 <= max_sentences <= 10:
        raise HTTPException(400, "'maxSentences' must be an integer 1–10.")

    sentences = _sentences(text)
    if not sentences:
        raise HTTPException(422, "Document has no readable text to summarize.")

    freq = Counter(
        w for w in WORD_RE.findall(text.lower()) if w not in STOPWORDS
    )
    scored = sorted(
        ((sum(freq.get(w, 0) for w in WORD_RE.findall(s.lower())), i, s)
         for i, s in enumerate(sentences)),
        key=lambda t: (-t[0], t[1]),
    )
    picked = sorted(scored[:max_sentences], key=lambda t: t[1])
    return {
        "documentId": document_id,
        "fileName": doc.get("file_name"),
        "method": "extractive",
        "requestedSentences": max_sentences,
        "sentenceCount": len(picked),
        "totalSentences": len(sentences),
        "summary": [s for _, _, s in picked],
    }
