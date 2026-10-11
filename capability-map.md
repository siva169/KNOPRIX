# Knoprix Final Project — Capability Map

## Purpose

This map separates independently testable capabilities and fixes their build
order before implementation.

| Module ID | Responsibility | Depends on |
|---|---|---|
| foundation | Project shell, configuration, shared API/client contracts, responsive foundations | — |
| database-foundation | Versioned, data-preserving schema migrations | foundation |
| auth | Registration, login, session lifecycle, abuse controls, protected routes | foundation, database-foundation |
| projects-documents | Projects, uploads, metadata, source-preserving extraction, ingestion jobs | auth, database-foundation |
| reader-highlights-bookmarks | Document reading, highlights, bookmarks, notes | projects-documents |
| search-dsa | Trie search, inverted index search, bookmark collection statistics | projects-documents, reader-highlights-bookmarks |
| dashboard | Project overview, document activity, search entry points, empty states | auth, projects-documents, search-dsa |
| access-control | Shared owner/share authorization, content boundaries, AI grants and provider consent | auth, projects-documents, database-foundation |
| ai-integration | BYOK provider settings, authorized retrieval, document-grounded chat, citations, study tools | access-control, projects-documents, search-dsa |
| evidence-map | Evidence-linked mind map and optional bookmark/highlight relationships | projects-documents, reader-highlights-bookmarks, access-control |
| sharing | Knoprix IDs, mutual contacts, accepted read-only shares, inbox, optional notifications | auth, projects-documents, reader-highlights-bookmarks, access-control |
| release-readiness | Observability, deletion/recovery, adversarial quality gates, local acceptance | all feature modules |

## Build order

`foundation → database-foundation → auth → projects-documents → access-control`

After `projects-documents`, reading/annotations and search can proceed; dashboard
depends on search. AI integration, evidence map, and sharing follow their listed
dependencies. Release readiness closes the feature set.

## AI boundary

The approved BYOK boundary remains:

- Keys stay in browser `localStorage` and go directly from the browser to the
  selected provider; Knoprix never receives or stores them.
- Knoprix document processing and third-party provider transfer are separate
  consent boundaries.
- Only selected documents with active per-document grants may be used; provider
  and model consent is required before external transfer.

Current chat remains partially implemented: the backend response is mocked,
some providers are called directly from the browser, and persisted AI grants
are not enforced yet. Do not describe this as a complete secure AI integration.
