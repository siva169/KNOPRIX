"""Inverted Index — maps every word to the documents containing it (with counts)."""
from __future__ import annotations


class InvertedIndex:
    def __init__(self):
        self.index: dict[str, dict[str, int]] = {}  # word -> {doc_id: count}

    def add_document(self, doc_id: str, words: list[str]) -> None:
        counts: dict[str, int] = {}
        for w in words:
            counts[w] = counts.get(w, 0) + 1
        for word, count in counts.items():
            self.index.setdefault(word, {})[doc_id] = count

    def search(self, words: list[str], doc_ids: set[str] | None = None) -> list[dict]:
        """Ranked matches: [{doc_id, score}] for docs containing any query word."""
        scores: dict[str, int] = {}
        for word in words:
            for doc_id, count in self.index.get(word, {}).items():
                if doc_ids is not None and doc_id not in doc_ids:
                    continue
                scores[doc_id] = scores.get(doc_id, 0) + count
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])
        return [{"doc_id": d, "score": s} for d, s in ranked]

    def doc_count(self) -> int:
        return len(self.index)

    # ── persistence ──────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return self.index

    @classmethod
    def from_dict(cls, data: dict) -> "InvertedIndex":
        idx = cls()
        idx.index = data or {}
        return idx
