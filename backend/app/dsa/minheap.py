"""Min-Heap — top-k passage ranking in Knoprix.

Searching a project can return dozens of matching passages, but the chat
panel only shows 3 citations and the reviewer only reads the top few. Sorting
ALL matches to keep 3 is wasteful (O(n log n)). A min-heap of size k keeps
only the k best seen so far: each new passage either beats the smallest
kept one or is dropped — push / pop in O(log k), total O(n log k), memory
O(k). The smallest kept score always sits at the top (peek).

Pure-Python, array-backed binary heap so it is easy to explain during the
review. (Python's heapq exists — this file exists so the review can point
at OUR structure, matching trie.py / inverted_index.py / stack.py.)
"""
from __future__ import annotations

from typing import Any


class MinHeap:
    def __init__(self, items: list[Any] | None = None):
        # Binary heap in a plain list: children of index i live at 2i+1/2i+2.
        self._a: list[Any] = list(items or [])
        for i in reversed(range(len(self._a) // 2)):
            self._sift_down(i)

    def push(self, item: Any) -> None:
        """Add an item — O(log n)."""
        self._a.append(item)
        self._sift_up(len(self._a) - 1)

    def pop(self) -> Any:
        """Remove and return the SMALLEST item — O(log n). Raises if empty."""
        if self.is_empty():
            raise IndexError("pop from empty heap")
        top = self._a[0]
        last = self._a.pop()
        if self._a:
            self._a[0] = last
            self._sift_down(0)
        return top

    def peek(self) -> Any | None:
        """Smallest item without removing it — O(1)."""
        return self._a[0] if self._a else None

    def is_empty(self) -> bool:
        return len(self._a) == 0

    def size(self) -> int:
        return len(self._a)

    def _sift_up(self, i: int) -> None:
        while i > 0:
            parent = (i - 1) // 2
            if self._a[i] < self._a[parent]:
                self._a[i], self._a[parent] = self._a[parent], self._a[i]
                i = parent
            else:
                break

    def _sift_down(self, i: int) -> None:
        n = len(self._a)
        while True:
            left, right = 2 * i + 1, 2 * i + 2
            smallest = i
            if left < n and self._a[left] < self._a[smallest]:
                smallest = left
            if right < n and self._a[right] < self._a[smallest]:
                smallest = right
            if smallest == i:
                break
            self._a[i], self._a[smallest] = self._a[smallest], self._a[i]
            i = smallest

    def __len__(self) -> int:
        return len(self._a)

    def __repr__(self) -> str:
        return f"MinHeap(top={self.peek()!r}, size={len(self._a)})"


def top_k(scored: list[tuple[float, Any]], k: int) -> list[tuple[float, Any]]:
    """Keep the k HIGHEST-scored items, best-first — O(n log k).

    A min-heap of size k holds the current winners; anything smaller than
    the heap top is dropped unseen. Used for citation + passage ranking.
    """
    if k <= 0:
        return []
    heap = MinHeap()
    for score, item in scored:
        if heap.size() < k:
            heap.push((score, item))
        elif score > heap.peek()[0]:
            heap.pop()
            heap.push((score, item))
    out = []
    while not heap.is_empty():
        out.append(heap.pop())
    return sorted(out, key=lambda t: -t[0])
