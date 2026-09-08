"""Stack (LIFO) — powers bookmark recall in Knoprix.

The bookmarks you collect while reading behave exactly like a stack:
push a highlighted passage or a page onto the top, pop the most recent
one off, peek at the top without removing it. The most recently saved
bookmark is always the top of the stack.

This is a pure-Python implementation (list-backed) with O(1) push /
pop / peek so it is easy to explain during the review.
"""
from __future__ import annotations

from typing import Any


class Stack:
    def __init__(self, items: list[Any] | None = None):
        # Bottom of the stack = index 0, top of the stack = last element.
        self._items: list[Any] = list(items or [])

    def push(self, item: Any) -> None:
        """Push an item onto the top of the stack — O(1)."""
        self._items.append(item)

    def pop(self) -> Any:
        """Remove and return the top item — O(1). Raises if empty."""
        if self.is_empty():
            raise IndexError("pop from empty stack")
        return self._items.pop()

    def peek(self) -> Any | None:
        """Return the top item without removing it — O(1)."""
        if self.is_empty():
            return None
        return self._items[-1]

    def is_empty(self) -> bool:
        return len(self._items) == 0

    def size(self) -> int:
        return len(self._items)

    def items_top_first(self) -> list[Any]:
        """Iterate from the top of the stack down to the bottom."""
        return list(reversed(self._items))

    def __len__(self) -> int:
        return len(self._items)

    def __repr__(self) -> str:
        return f"Stack(top={self.peek()!r}, size={len(self._items)})"
