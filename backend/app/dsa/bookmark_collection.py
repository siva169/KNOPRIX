"""Hash-table + doubly linked-list collection for project bookmarks."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class _Node:
    key: str
    value: dict[str, Any]
    previous: _Node | None = None
    next: _Node | None = None


class BookmarkCollection:
    """Keep bookmarks newest-first with average O(1) key operations."""

    def __init__(self, rows: list[dict[str, Any]] | None = None):
        self._nodes: dict[str, _Node] = {}
        self._head: _Node | None = None
        self._tail: _Node | None = None
        self._size = 0
        for row in rows or []:
            self.add(row)

    def add(self, bookmark: dict[str, Any]) -> None:
        key = bookmark["id"]
        if key in self._nodes:
            raise ValueError(f"Bookmark already exists: {key}")
        node = _Node(key=key, value=bookmark)
        node.next = self._head
        if self._head is None:
            self._tail = node
        else:
            self._head.previous = node
        self._head = node
        self._nodes[key] = node
        self._size += 1

    def remove(self, bookmark_id: str) -> dict[str, Any] | None:
        node = self._nodes.pop(bookmark_id, None)
        if node is None:
            return None
        if node.previous is None:
            self._head = node.next
        else:
            node.previous.next = node.next
        if node.next is None:
            self._tail = node.previous
        else:
            node.next.previous = node.previous
        self._size -= 1
        return node.value

    def get(self, bookmark_id: str) -> dict[str, Any] | None:
        node = self._nodes.get(bookmark_id)
        return node.value if node else None

    def newest(self) -> dict[str, Any] | None:
        return self._head.value if self._head else None

    def items_newest_first(self) -> list[dict[str, Any]]:
        items = []
        node = self._head
        while node is not None:
            items.append(node.value)
            node = node.next
        return items

    def size(self) -> int:
        return self._size

    def is_empty(self) -> bool:
        return self._size == 0
