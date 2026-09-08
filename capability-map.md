# Knoprix Final Project — Capability Map

## Purpose

This map separates independently testable capabilities and fixes their build
order before implementation.

| Module ID | Responsibility | Depends on |
|---|---|---|
| foundation | Project shell, configuration, shared API/client contracts, responsive foundations | — |
| auth | Registration, login, session, protected routes | foundation |
| projects-documents | Projects, uploads, document metadata, document processing | auth |
| reader-highlights-bookmarks | Document reading, highlights, bookmarks, notes | projects-documents |
| search-dsa | Trie search, inverted index search, bookmark collection statistics | projects-documents, reader-highlights-bookmarks |
| dashboard | Project overview, document activity, search entry points, empty states | auth, projects-documents, search-dsa |
| ai-integration | BYOK provider settings, document-grounded chat, citations, later study tools | auth, projects-documents, search-dsa |

## Build order

`foundation → auth → projects-documents → reader-highlights-bookmarks → search-dsa → dashboard → ai-integration`

## AI boundary

The first AI provider boundary supports:

- Z.AI GLM cloud models
- OpenAI-compatible cloud providers

The first AI slice is document chat. Summaries, flashcards, quizzes, and
opt-in web research follow as separate vertical slices.

API keys are user-owned credentials. They are never placed in frontend code,
never committed, and never displayed after saving. The backend stores them
encrypted and uses them only for documents the user explicitly selects.
