# 🔶 KNOPRIX — Mid Review Build (50%)

An academic-grade, **DSA-powered Knowledge Management Platform** built for the
mid-semester review. This is the **50% milestone** of the project: 3 of the 5
data structures are live and demo-ready — the remaining ones (and the AI
agent / read-aloud features) are planned for the final review.

> Built on the completed `knoprix-v2` codebase (FastAPI + React), trimmed and
> re-themed with a **saffron / Saraswati study palette** — warm orange on deep
> charcoal, cream ivory text, aurora gradients.

## 🧠 Featured data structures (mid review)

| # | Structure | Where it lives in the app |
|---|---|---|
| 1 | **Hash Table + Doubly Linked List** | Bookmarks — the hash table finds any bookmark by ID, while the doubly linked list keeps newest-first order and supports O(1) average unlinking. |
| 2 | **Trie** | Navbar search — live prefix **autocomplete** with word frequencies. |
| 3 | **Inverted Index** | Navbar search — **ranked full-text search** with snippets and scores. |

Coming in the **final review**: Knowledge Graph, Min-Heap, AI document agent,
read-aloud.

## ✨ What's in this build

- 🔶 **Orange Saraswati theme** — warm saffron/amber on deep charcoal, cream
  text, aurora gradients, Outfit display font, light/dark themes
- 📚 **Multi-format reading** — PDF (real canvas pages + selectable text),
  PPTX, DOCX, TXT/MD, images
- 🔖 **Ordered bookmark collection** — per-page bookmark buttons on every PDF
  page + toolbar, text-highlight bookmarks, newest-first drawer, arbitrary ID
  deletion, and O(1) average collection updates
- 🔍 **Live search** — Trie autocomplete (single word) + Inverted Index ranked
  results (phrases) in the navbar
- 📊 **DSA Index Visualizer** — animated stats for Trie / Inverted Index /
  bookmark collection + top-keyword cloud
- 🛡️ **Security** — JWT auth, owner-scoped routes (IDOR-proof), rate-limited
  login/register

## 🚀 Run it

### Backend (port 8000)
```bash
cd backend
py -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```
Interactive API docs: http://127.0.0.1:8000/docs

### Frontend (port 5173)
```bash
cd frontend
npm install
npm run dev
```
App: **http://localhost:5173**

### Demo account
`demo@knoprix.io` / `Password123!` — your documents are auto-imported on first
start (SDC - Grok.pdf, Section 2, A-dsa, Spectrum PPTX…).

## 🗂️ Structure
```
knoprix-v2-midreview/
├── backend/                 FastAPI app
│   ├── app/
│   │   ├── dsa/             pure-Python Trie, InvertedIndex, bookmark collection
│   │   ├── routers/         auth, projects, documents, search, dsa, bookmarks
│   │   ├── services/        pdf/pptx/docx parsing, DSA indexer
│   │   ├── security.py      JWT + bcrypt + rate limiting + ownership
│   │   └── main.py
│   └── uploads/             your documents
└── frontend/                React + Vite + Tailwind (orange theme)
    └── src/                 components, contexts, api client
```

## 🧮 DSA engine notes
- `dsa/trie.py` — prefix tree with frequencies, autocomplete + top keywords
- `dsa/inverted_index.py` — word → {document: count}, ranked search
- `dsa/bookmark_collection.py` — hash table + doubly linked list for bookmark lookup and recency order
- Indexes are serialized to SQLite (`dsa_indices`) and rebuilt on upload/delete
- No AI/API keys required — the app is fully self-contained
