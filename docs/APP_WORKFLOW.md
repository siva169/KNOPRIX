# Knoprix — How Every Feature Works (plain-English walkthrough)

**Audience:** the student presenting this project. Read this top-to-bottom and
you can explain every screen and every data structure without opening code.

Analogy that carries through the whole app:

> Knoprix is like a **study library** you carry in your pocket.
> - **Trie** = the library's word index card cabinet (find words by first letters)
> - **Inverted Index** = the "which books mention this topic?" lookup table
> - **Bookmark collection** = an indexed chain of bookmark slips — newest first,
>   with direct lookup when you remove any slip

---

## 1. Login & accounts

**What happens:** you enter email + password → the app checks them → you get in.

**Workflow (backend):**
1. `POST /api/auth/login` receives email + password.
2. It looks up the email in the `users` table. If found, it re-hashes the typed
   password with **bcrypt** and compares to the stored hash. bcrypt is a
   one-way hash: the real password is never stored, only a fingerprint.
3. If it matches, the server mints a **JWT** (a signed digital pass) that
   contains your user id + expiry time. The frontend sends this pass on every
   request so you don't retype the password.
4. Register (`POST /api/auth/register`) does the same but first checks the
   email is free, hashes the password, inserts the row, and logs you in.

**Why passwords are safe:** the DB stores only bcrypt hashes; if someone
stole the database they still can't read passwords. JWTs expire (60 min
access + 7 day refresh) and are signed with a secret.

**The login bug we fixed:** the app used to store users in a local SQLite file
on the free hosting server. That server's disk is *wiped on every restart*, so
new accounts vanished → "invalid email or password". Now accounts live in a
persistent **Postgres (Neon)** database and survive restarts.

---

## 2. Projects & documents (the library shelves)

**What happens:** folders ("projects") hold files ("documents"). Click a
project → its files appear in the tree. Click a file → the viewer opens it.

**Workflow:**
1. `POST /api/projects` creates a folder row owned by you (users can't see
   each other's folders — an ownership check runs on every access).
2. `POST /api/projects/{id}/documents/upload` saves the file, then runs a
   **parser** that reads it and stores:
   - `documents.extracted_text` → the whole text, one block
   - `document_pages` → the text **per page/slide** (used for page numbers
     in search and for highlights)
3. After upload, the project's **Trie + Inverted Index are rebuilt** so the
   new file is instantly searchable.

**Parsers (backend `services/pdf_parser.py`):**
- PDF → `pypdf` extracts text per page (scanned image PDFs have no text layer)
- PPTX → `python-pptx` reads each slide's text boxes
- DOCX → `python-docx` reads paragraphs + tables
- TXT → read as plain text

---

## 3. Search bar (Trie + Inverted Index in action)

**What happens:** type one word → suggestions appear as you type; type a
phrase → ranked document results with page numbers.

**Single word → Trie (autocomplete).** The Trie is a prefix tree of every word
in your documents. Typing `sig` walks the tree: `s → i → g`, then lists every
word hanging below `g` (signal, signals, signalpreprocessor…), sorted by how
often they appear. That's why it's called a "Trie" — it's reTRIEval by prefix.

**Phrase (2+ words) → Inverted Index (ranked search).** The inverted index is
a dictionary: `word → {documentId: count}`. For "signal flow" it looks up
"signal" and "flow", sums each document's counts, and ranks documents by the
total. Higher score = the phrase appears more there.

**Page numbers:** a separate lookup scans `document_pages` (the per-page text)
to find which page numbers contain each word, so results show
"Section 2 Block Diagrams… p. 1, 3, 29–35".

**Flow:**
`type` → debounce 300ms → if 1 word: `/api/autocomplete` (Trie) → dropdown;
else: `/api/search` (Inverted Index) → dropdown. Click a result → the document
opens.

---

## 4. Document viewer (PDF / PPTX / text)

**PDF:** rendered on a `<canvas>` page-by-page with a hidden "text layer" on
top. The text layer is invisible but lets you select/search/highlight text
like a real document. Pages render at devicePixelRatio so text is crisp on
high-DPI screens.

**Page navigation:** the toolbar arrows change the current page and the viewer
scrolls to it; the "Page X of Y" box is editable — type a number and press
Enter to jump straight there.

**PPTX:** each slide is drawn as a scaled canvas (`designW × scale`) so slides
fit any screen width.

**Text files (TXT/DOCX):** shown as plain paragraphs; the zoom buttons now
scale the text size.

---

## 5. Selecting text → Bookmark / Copy / Highlight

Select any words → a small popover appears with **Bookmark · Copy ·
Highlight**.

- **Bookmark** → `POST /api/bookmarks` → a row is inserted → the row is
  inserted at the front of the **Hash Table + Doubly Linked List collection**.
  The Bookmarks drawer refreshes instantly (no page reload).
- **Copy** → copies the text to your clipboard.
- **Highlight** → a colour picker opens (yellow, green, blue, pink, orange,
  purple) plus a **"Highlight all matches"** toggle:
  - OFF = paint only the selected text (first occurrence)
  - ON = paint *every* occurrence of that text on the page/slide
  - Saved via `POST /api/highlights` with the page number; the paint is
    re-applied every time the document opens (persists after refresh).
  - Click a painted mark → small menu with **Remove**; or turn on the **Erase**
    toolbar toggle and click marks to delete them.

**How the paint works:** the frontend finds your selected text inside the
page's text layer (ignoring line breaks / extra spaces), wraps it in a
coloured `<mark>`, and positions it over the real text. This is why highlights
work on PDFs, slides, and text files alike — and why a highlight recorded on
the wrong page paints nothing (a bug we fixed: selections now carry the page
they were made on).

---

## 6. Bookmarks drawer (the ordered collection, visualised)

**What happens:** every bookmark is a node in a newest-first doubly linked
list. A hash table maps each bookmark ID directly to its node, so the drawer
can remove any bookmark without scanning the list.

**Workflow:**
1. Saving a bookmark adds it at the collection head.
2. The hash table maps each bookmark ID to its linked-list node.
3. The doubly linked list keeps the newest bookmark at the head.
4. Removing any bookmark unlinks its node in O(1) average time.

**The bookmark collection (`dsa/bookmark_collection.py`)** combines a hash
table with a doubly linked list. Add, lookup, and unlink are O(1) average;
listing remains O(n) because the API returns every bookmark.

---

## 7. DSA Index Visualizer (stats modal)

The bar-chart button opens a modal with 3 animated cards:
- **Trie** → total keywords + a top-keyword frequency cloud
- **Inverted Index** → document match stats
- **Bookmark collection** → current bookmark count / newest item

Data comes from `GET /api/projects/{id}/dsa/top-keywords` (Trie) and the
bookmarks endpoint (ordered bookmark collection).

---

## 8. How the three data structures are built (item 9)

On upload (and on server start via `seed.py`), `services/indexer.py` runs:

1. `tokenize(text)` → splits every document into lowercase words, drops
   stopwords ("the", "and"…) and 1-letter words.
2. Builds the **Trie**: for each word, walk letter-by-letter creating nodes;
   each end-node stores the word's total frequency.
3. Builds the **Inverted Index**: `word → {document_id: count}` per document.
4. Saves both as JSON in the `dsa_indices` table (`trie_json`,
   `inverted_index_json`) — so they're rebuilt once per project and reused.

**Queries never touch the JSON directly:** `_load_indices()` deserialises them
back into the classes (`Trie.from_dict`, `InvertedIndex.from_dict`) and the
router calls `autocomplete()` / `search()` on the live objects.

**The bookmark collection is different:** it is not persisted as JSON —
bookmarks live in the `bookmarks` table (their natural home), and a collection
is rebuilt from persisted rows for each request. The database remains the
source of truth.

**Data flow diagram:**

```
Upload file
   │
   ▼
parser (pypdf / python-pptx / python-docx)
   │
   ├── documents (extracted_text) ──────────► viewer text, search snippets
   ├── document_pages (per-page text) ──────► page numbers, highlights
   │
   ▼
indexer.rebuild_project_indices()
   ├── tokenize each document
   ├── Trie          ──► autocomplete (single word)
   ├── InvertedIndex ──► ranked search (phrase)
   └── saved as JSON in dsa_indices
```

---

## 9. Where the Python code lives (map)

| Concern | File |
|---|---|
| Auth (bcrypt + JWT) | `backend/app/security.py`, `routers/auth.py` |
| Database layer (SQLite/Postgres) | `backend/app/database.py`, `config.py` |
| Trie | `backend/app/dsa/trie.py` *(untouched — the 3 core files)* |
| Inverted Index | `backend/app/dsa/inverted_index.py` *(untouched)* |
| Hash Table + Doubly Linked List | `backend/app/dsa/bookmark_collection.py` |
| Indexer (builds Trie + Index) | `backend/app/services/indexer.py` |
| Parsers (PDF/PPTX/DOCX/TXT) | `backend/app/services/pdf_parser.py` |
| Routers (API endpoints) | `backend/app/routers/*.py` |
| Frontend (React) | `frontend/src/` — `App.jsx`, `components/*` |
