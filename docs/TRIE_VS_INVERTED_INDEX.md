# Trie vs Inverted Index — the clear difference (and our implementations)

## One-line answer

- **Trie** answers: *"What words start with this prefix?"* (autocomplete).
- **Inverted Index** answers: *"Which documents contain these words, and how
  much?"* (search).

Analogy:

> The **Trie** is a **phone contacts list** — you type a few letters and it
> shows every name starting with them.
> The **Inverted Index** is a **textbook's index at the back** — look up a
> topic and it tells you every page that talks about it.

---

## The Trie (prefix tree)

**Shape:** a tree. Each node = one letter. Every path from the root spells a
word. The word's node is marked as "end of word" and stores how many times the
word appears.

```
        r
       / \
      o   u
     /     \
    t       n  ← "run" ends here (count: 5)
```

**Our implementation — `backend/app/dsa/trie.py`:**
- `TrieNode` = `{children: {char → node}, is_end, count}`
- `insert(word, frequency)` — walks letter by letter, creating nodes as
  needed, adds `frequency` to the end node.
- `autocomplete(prefix, limit)` — walks down the prefix, then a depth-first
  search collects every word under it, sorted by frequency (highest first).
- `top_keywords(limit)` — DFS over the whole tree, returns the most frequent
  words (used in the stats modal).

**Why a Trie for autocomplete:**
- Lookup is O(word length) — no matter how many words are stored.
- All completions share the prefix path, so it's fast and memory-efficient
  for a dictionary.
- Perfect for "type as you type": walk one letter per keystroke.

---

## The Inverted Index (word → documents)

**Shape:** a dictionary (hash map). For every word, a list of
(document, count) pairs.

```
"signal"  → { "SDC - Grok.pdf": 20, "Section 2.pdf": 8, ... }
"flow"    → { "Section 2.pdf": 6, ... }
```

**Our implementation — `backend/app/dsa/inverted_index.py`:**
- `index: dict[str, dict[str, int]]` → word → {doc_id: count}
- `add_document(doc_id, words)` — counts each word in the document, stores the
  per-document count.
- `search(words, doc_ids=None)` — for each query word, looks up its documents,
  **sums the counts per document**, sorts by total → ranked results
  `[{doc_id, score}]`.

**Why an Inverted Index for search:**
- It's the same trick search engines use: flip the data around so the *word*
  is the key, not the document. Finding "which docs mention X" becomes one
  dictionary lookup instead of scanning every document.
- Ranking by summed counts = a simple, explainable relevance score.

---

## Side-by-side

| | **Trie** | **Inverted Index** |
|---|---|---|
| Question it answers | words starting with a prefix | docs containing the words |
| Data shape | tree of letters | word → {doc: count} |
| Built from | tokenized words (each unique word once) | tokenized words with per-doc counts |
| Typical use here | autocomplete dropdown (1 word) | ranked phrase search (2+ words) |
| Query cost | O(prefix length + results) | O(#query words × #docs per word) |
| What it stores | word frequencies (global) | per-document frequencies |
| Memory | one node per unique letter path | one entry per (word, doc) pair |
| Analogy | phone contacts list | textbook back-of-book index |

## How they work together in our app

Both are built at the same time from the same tokenizer
(`indexer.rebuild_project_indices`), persisted as JSON in `dsa_indices`, and
reloaded into live objects for queries:

1. User types **one word** → Trie walks the prefix → dropdown suggestions.
2. User types **a phrase** (2+ words) → Inverted Index looks up each word,
   sums counts per document → ranked list.
3. Both answers then get **page numbers** from the `document_pages` table — a
   separate lookup that never touches the Trie/Index code.

**Files (untouched in this project's whole feature round):**
- `backend/app/dsa/trie.py` — Trie
- `backend/app/dsa/inverted_index.py` — Inverted Index
- `backend/app/dsa/bookmark_collection.py` — Hash Table + Doubly Linked List (bookmarks)
