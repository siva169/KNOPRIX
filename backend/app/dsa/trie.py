"""Trie (prefix tree) — powers instant autocomplete across documents."""
from __future__ import annotations


class TrieNode:
    __slots__ = ("children", "is_end", "count")

    def __init__(self):
        self.children: dict[str, TrieNode] = {}
        self.is_end = False
        self.count = 0  # how many times this word appears across docs


class Trie:
    def __init__(self):
        self.root = TrieNode()
        self.words = 0  # distinct words

    # ── build ────────────────────────────────────────────────────────────────
    def insert(self, word: str, frequency: int = 1) -> None:
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, TrieNode())
        if not node.is_end:
            node.is_end = True
            self.words += 1
        node.count += frequency

    # ── query ────────────────────────────────────────────────────────────────
    def search(self, word: str) -> bool:
        node = self.root
        for ch in word:
            node = node.children.get(ch)
            if node is None:
                return False
        return node.is_end

    def autocomplete(self, prefix: str, limit: int = 10) -> list[dict]:
        """Return [{word, frequency}] for words starting with prefix."""
        prefix = prefix.lower()
        node = self.root
        for ch in prefix:
            node = node.children.get(ch)
            if node is None:
                return []
        results: list[dict] = []

        def dfs(n: TrieNode, suffix: str):
            if len(results) >= limit:
                return
            if n.is_end:
                results.append({"word": prefix + suffix, "frequency": n.count})
            for ch in sorted(n.children):
                dfs(n.children[ch], suffix + ch)

        dfs(node, "")
        results.sort(key=lambda r: -r["frequency"])
        return results[:limit]

    def top_keywords(self, limit: int = 20) -> list[dict]:
        out: list[dict] = []

        def dfs(n: TrieNode, word: str):
            if n.is_end:
                out.append({"word": word, "frequency": n.count})
            for ch, child in n.children.items():
                dfs(child, word + ch)

        dfs(self.root, "")
        out.sort(key=lambda r: -r["frequency"])
        return out[:limit]

    # ── persistence ──────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        def node_to_dict(n: TrieNode) -> dict:
            return {
                "e": n.is_end,
                "c": n.count,
                "ch": {ch: node_to_dict(k) for ch, k in n.children.items()},
            }

        return {"words": self.words, "root": node_to_dict(self.root)}

    @classmethod
    def from_dict(cls, data: dict) -> "Trie":
        def node_from_dict(d: dict) -> TrieNode:
            n = TrieNode()
            n.is_end = d["e"]
            n.count = d["c"]
            n.children = {ch: node_from_dict(k) for ch, k in d["ch"].items()}
            return n

        trie = cls()
        if data:
            trie.words = data.get("words", 0)
            trie.root = node_from_dict(data["root"])
        return trie
