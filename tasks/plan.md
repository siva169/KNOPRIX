# Knoprix Consumer-Grade Product — Delivery Plan

## Overview

Knoprix is a React/Vite + FastAPI document workspace that currently supports
accounts, projects, file reading, bookmarks/highlights, DSA-backed keyword
search, a heuristic knowledge graph, extractive summaries, and partially
live BYOK chat. This plan takes it toward a trusted consumer product with
Reading Desk and AI Wing modes, measured extraction quality, permission-safe
RAG, optional Laya decision support, evidence-linked study tools, in-app
sharing, and consumer-grade account/reliability controls.

This is a plan, not a claim that the future capabilities exist. The detailed,
acceptance-driven checklist and dependencies live in `tasks/todo.md`.

## Scope and success criteria

- Preserve current reading and DSA behavior while adding capabilities
  incrementally.
- AI processes only documents the authenticated user is authorized to access
  and has explicitly approved for that purpose.
- A recipient receives accepted shares inside Knoprix; email only notifies and
  never bypasses authentication or share acceptance.
- Extraction and AI output carry source locations and honest provenance;
  quality is measured, not promised as perfect.
- Database changes are versioned and tested; source files remain private;
  user-controlled deletion/export, backups, monitoring, and recovery exist
  before public beta.
- Each feature slice has acceptance evidence, accessibility/responsive review,
  an updated change log, and a local checkpoint.

## Current architecture and material gaps

```text
React + Vite client
  ├─ Auth screens and JWT-based API client
  ├─ Project dashboard/sidebar and PDF/PPTX/text readers
  ├─ Reader navigation, annotations, bookmarks, progress, focus mode
  ├─ Trie/inverted-index search UI, DSA stats, heuristic graph UI
  └─ Chat panel, selected-document picker, extractive-summary button
            │ authenticated HTTP
            ▼
FastAPI modular monolith
  ├─ auth / projects / documents / search / chat / summary
  ├─ bookmarks / highlights / graph / DSA endpoints
  ├─ extraction + indexing services
  └─ SQLite local; optional PostgreSQL + S3-compatible storage
            │
            ├─ relational source records
            ├─ JSON-serialized, rebuildable Trie/inverted-index data
            └─ private local/object file storage

Target additions
  ├─ versioned migrations + shared access-policy checks
  ├─ structured extraction blocks + OCR + durable ingestion status
  ├─ per-document AI grants + provider-specific consent
  ├─ page-aware chunks → authorized hybrid retrieval → cited generation
  ├─ optional Laya decision adapter (never auth or text generation)
  ├─ Reading Desk ↔ AI Wing shared workspace state
  ├─ evidence-linked mind map + explicit bookmark/highlight relations
  └─ contacts + Knoprix ID + accepted shares + inbox + notification outbox
```

### Confirmed by inspected source

- Auth retains legacy password/JWT sessions for unlinked accounts. Firebase
  email/password sign-in does not require verified email; a verified email is
  required only to link an unlinked existing account without changing its
  Knoprix ID or project ownership. Google OAuth, password recovery, and CAPTCHA
  were not found in the inspected code.
- Uploads are content-validated for PDF, PPTX, DOCX, TXT, MD, PNG, JPG/JPEG,
  and static SVG. Images are stored without OCR; legacy `.ppt` is rejected.
  See `docs/upload-support-matrix.md` for resource limits and validation.
- Project document listing currently includes `extracted_text`, broader
  content exposure than a strict selected-content AI design should allow.
- Summary is extractive sentence selection. Chat validates selected,
  owner-scoped document IDs and cites keyword-search results; the backend
  response is mocked, while the frontend has browser-direct provider calls
  for some provider configurations.
- Search indexes are stored as serialized JSON and are rebuildable. They are
  derived search structures, not a reason to store the whole application as
  JSON.
- Knowledge graph links are heuristic shared terms. Bookmarks and highlights
  were separate at the planning baseline. Migration 4 now adds optional
  independent-lifecycle bookmark/highlight links, Knoprix-ID contacts, and
  resource-level share records.
- Current DB initialization has in-code startup migrations; no formal
  migration framework was found in inspected project files.

## Architecture decisions and trade-offs

1. **Keep a modular monolith initially.** The current team/project does not
   show a need for microservices. Separate internal modules and a worker
   boundary; split services only after measured independent scaling needs.
2. **Keep relational data relational.** Users, documents, grants, contacts,
   shares, jobs, and relationships need constraints and queryable ownership.
   Store extracted blocks/chunks with locations. Use JSON/JSONB only for
   format-specific metadata; retain serialized DSA indexes as rebuildable
   derived data.
3. **Use one shared authorization policy.** Owner access or active accepted
   share authorizes ordinary reads. AI additionally requires a live per-user,
   per-document grant and provider-transfer consent for cloud inference.
4. **Separate retrieval, decision, and generation.** Existing keyword search
   is the baseline retriever. Add embeddings/hybrid retrieval only after
   benchmark. Laya can classify or route; a separate local or explicitly
   approved BYOK model generates text.
5. **Avoid promising impossible guarantees.** Extraction, model accuracy, and
   latency vary by input and hardware. Use provenance, measured quality,
   bounded timeouts, progress, cancellation, and recovery rather than claims
   of perfect accuracy or zero delay.
6. **In-app sharing is authoritative.** Contact acceptance, resource-share
   acceptance, and AI consent are independent. Email is optional notification,
   not file transfer or authorization.
7. **Keep local and deployed behavior honest.** A deployed server cannot
   silently run Laya on a user's laptop GPU. Local user hardware requires a
   separately installed, explicitly connected local companion.
8. **Do not choose external providers or UI on the user's behalf.** OAuth,
   CAPTCHA, mail, OCR/model services, key policy, data retention, and meaningful
   interface choices have explicit decision/approval gates in the backlog.

## Dependency-ordered phases

### Phase 0 — Decisions and contracts

Resolve product names, processing/consent rules, key policy conflict, sharing
rules, file support, data retention, and target deployment. Then write API,
data, and authorization contracts and introduce versioned migrations.

**Exit gate:** Boss approves the trust/security decisions; migrations upgrade
current SQLite/PostgreSQL records safely.

### Phase 1 — Account security and abuse controls

1. Harden existing legacy password/JWT sessions using the approved auth
   decisions: 15-minute access tokens, rotating 7-day refresh sessions,
   multiple active device sessions, current-session and all-session logout,
   in-memory access tokens plus HttpOnly refresh cookies, production-only
   secret enforcement, and shared database-backed rate limits. Firebase
   session/refresh behavior remains Firebase-managed.
2. Add Google OIDC only after the OAuth client and callback configuration are
   explicitly approved.
3. Implement account recovery only after an email delivery provider is chosen
   and authorized.
4. Add CAPTCHA only after its provider, privacy/data-transfer, accessibility,
   cost, and fallback policy are approved.

The auth session implementation spec is `SPEC-auth-session-hardening.md`.
Localhost verification is in scope. A production deployment using refresh
cookies requires a same-site API origin or equivalent proxy; no host or domain
is selected here.

**Exit gate:** Account linking, recovery, challenge verification, abuse
controls, and secret handling are tested. External account/service setup is
explicitly approved.

### Phase 2 — Reliable document ingestion

Validate actual file content; align accepted formats with real parsers; create
source-preserving extraction records; measure text/table/image/OCR quality;
move expensive processing to observable, durable jobs.

**Exit gate:** The supported-format matrix and benchmark corpus report measured
quality; unsupported/uncertain content is visible and never fabricated.

### Phase 3 — Permission-safe RAG

Return metadata separately from content; enforce AI grants; benchmark an
embedding/vector strategy against current keyword search; build scoped hybrid
retrieval and citation evaluation.

**Exit gate:** Adversarial tests prove no unapproved/unshared content reaches
retrieval or a model; citations jump to verifiable source locations.

### Phase 4 — AI Wing and study workflow

Add an optional Laya adapter only if it beats a rules baseline; add a distinct
generation adapter and hierarchical summaries; then build the approved
Reading Desk/AI Wing switch, conversation history, and cited study tools.

**Exit gate:** Extractive and generative results are labeled honestly; consent,
scope, streaming, cancellation, provider failure, citations, and mobile UI
work end-to-end.

### Phase 5 — Evidence-linked mind map

Make the graph a readable Project → Documents → Topics → Pages mind map.
Keep heuristic shared-term links distinct from evaluated semantic links.

**Exit gate:** All nodes/edges expose source evidence; selection never grants
AI access by itself; large and mobile maps remain usable.

### Phase 6 — Optional annotation relationship

Add explicit optional bookmark/highlight links without coupling deletion or
breaking the bookmark collection behavior.

**Exit gate:** Existing data and DSA behavior remain intact; link/unlink and
cross-user rejection are tested.

### Phase 7 — Contacts and in-app resource sharing

Add public Knoprix IDs, mutual contact requests, individual document/bookmark/
highlight share requests, recipient inbox, access enforcement/revocation, then
optional email notifications through a durable outbox. Project snapshots are
excluded. The first slice is implemented; provider delivery and broader
browser/PostgreSQL verification remain.

**Exit gate:** Two-account tests cover contact acceptance, per-resource
acceptance, bulk recipients, revocation, expiry, and email failures. Current
tests cover backend state/authorization paths; browser, PostgreSQL, and
email-provider evidence is still outstanding. Shared files remain in Knoprix.

### Phase 8 — Consumer beta and release readiness

Add content-free observability, latency/quality budgets, export/deletion,
backup/restore, CI and adversarial tests, accessibility/responsive coverage,
support/incident procedures, and a closed beta go/no-go review.

**Exit gate:** No unresolved critical/high security issue; restore/deletion
drills and 33-point polish/fix review pass; boss separately approves any
deployment or public release.

## Release checkpoints

- **Trust foundation:** authentication, migrations, upload validation,
  content boundaries, AI grants.
- **Evidence quality:** extraction benchmarks, RAG relevance, source citations,
  truthful failure/uncertainty states.
- **Connected workspace:** Reading Desk/AI Wing, actionable mind map, optional
  annotation links, accepted in-app shares.
- **Consumer beta:** tested operations, security, privacy, accessibility,
  responsive design, support, and recovery.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Conflicting BYOK key policies | Sensitive data sent/stored contrary to user expectation | Resolve one canonical policy before provider changes |
| Upload returns all extracted text | Unnecessary exposure to browser and future AI paths | Metadata-only lists; bounded, authorized content APIs |
| Weak OCR/table/image fidelity | Wrong study material and misleading summaries | Gold corpus, provenance, confidence/warnings, user review |
| Prompt injection in uploaded files | Model may follow document instructions | Treat retrieved text as untrusted data; restrict tools and output actions |
| RAG retrieves irrelevant passages | Unsupported answers despite citations | Retrieval benchmarks, citation validation, abstention |
| Laya hardware/model requirements | Slow startup, memory pressure, non-portable deployment | Optional adapter, measured benchmark, no core-flow dependency |
| Cross-account sharing flaws | Data leak/IDOR | Central authorization policy and two-account adversarial tests |
| Email/CAPTCHA/OAuth external dependencies | Privacy, availability, credentials, provider policy changes | Provider approval gates, adapters, fallbacks, minimal data |
| Large files block API requests | Perceived latency/timeouts | Durable job states, progress, bounded retries, worker |
| Premature infrastructure complexity | More failures and maintenance than user value | Modular monolith; add queue/vector infrastructure only after evidence |

## Open decisions tracked in `tasks/todo.md`

- Visual and interaction decisions for Reading Desk and AI Wing generally;
  Recent Chats theme and responsive dialog container are approved, while
  remaining chat/dialog details still need boss choices before UI work.
- Google OAuth account/linking policy and provider configuration.
- CAPTCHA provider, privacy implications, risk thresholds, and accessible
  fallback.
- Extraction/OCR quality targets and OCR engine/language implementation.
- Local versus cloud generation, embedding/model choices, and deployment
  constraints beyond the approved hosting direction.
- Resolved (2026-10-12): contact discovery is Knoprix-ID-only; lookup and
  incoming-request preferences are user controlled. No Google Contacts/Gmail
  contact integration. Email-provider setup is deferred.
- Resolved sharing contract (2026-10-12): read-only individual documents,
  bookmarks, and highlights; no project snapshots. Pending requests expire
  after 30 days; accepted shares remain until revoked/left/source deletion/
  contact removal/block. Shared-resource AI access is not part of this slice.
- Latency/availability targets for the 100–1,000-user planning assumption.

## Source of truth

- Product decisions: `PRD.md` and approved sections of `UI-UX.md`
- Detailed task acceptance/dependency list: `tasks/todo.md`
- BYOK/data-transfer policy: `docs/byok-security-contract.md` (approved
  browser-local key policy and separate Knoprix/provider consent boundaries)
- Completed work and verification history: `changes.md`
- Consumer polish/fix gates: `checklists/033-vibecoding-complete-33-checklist.md`

## Addendum — AI Wing General Chat and Synced History

**Status:** Approved by boss on 2026-10-25. Source of truth:
`AI-CHAT-CAPABILITY-MAP.md`, `SPEC-synced-chat-history.md`, and
`SPEC-source-aware-chat.md`.

### Outcome

Replace the separate Retrieval/Document text modes with one general
conversation. The model may answer using its general knowledge and use
relevant active-project document passages and relevant prior messages from the
signed-in user's own saved chats. The provider decides whether to invoke its
native web-search feature when the selected model supports it. Models without
native search remain available for general/document/chat-context answers and
show that live search is unavailable.

Conversation data becomes account-synced and user-manageable through the
approved Recent Chats dialog. Existing provider allowlists, document grants,
per-send disclosure, citations, provider safeguards, and legacy cleanup
behavior remain in force.
Recent Chats visual choice approved 2026-10-25: reuse the existing AI Wing
dark/gold tokens and modal styling; full-width on mobile, centered on larger
screens. Rename-dialog, reduced-motion, and inline-citation choices are
recorded in `UI-UX.md` and implemented.

### Implemented API/data contract

- Account-owned conversations and ordered messages use an append-only
  migration. Deletion cascades to messages; account deletion removes chats.
- Authenticated, owner-scoped list/create/get/rename/delete APIs provide
  title-only search and bounded pagination. Chat send/stream accepts an empty
  document scope for general chat.
- User/assistant messages and citations are stored; provider keys, retrieved
  passages as separate records, full prompts in logs, and other users' data
  are excluded.
- Provider-specific search payloads and citation parsing stay inside provider
  adapters. Unsupported models receive no search tool.

### Completed implementation slices

1. **History persistence/API:** migration, owner-scoped CRUD, message order,
   cascades, and two-account/migration QA are implemented.
2. **Recent Chats UI:** approved search, new/open/rename/confirmed-delete,
   loading/empty/error/retry/no-results, keyboard, and responsive states are
   implemented.
3. **General/context chat backend:** general questions work without documents;
   bounded document/chat context preserves grants and account isolation.
4. **Native provider search:** Gemini 3.8 Flash uses the documented native
   tool; unsupported models remain usable without search.
5. **AI Wing integration:** one chat flow, per-request disclosure, persisted
   history, inline citations, and feature checklist are synchronized.

### Verification evidence

- Focused history, context, provider-search, migration, and RAG QA passed; the
  README-listed local backend QA scripts also passed. The credentialed
  `qa_chat.py` was not run because `KNOPRIX_QA_PASSWORD` was unavailable and
  no live provider call was authorized.
- Frontend production build passed with the >500 kB chunk advisory. Mocked
  browser QA passed at 390, 425, 768, and 1024 px, including context
  consent/cancel, citations, history states/actions, focus, and overflow.
- No live provider call, deployment, or remote Git operation was made.

### Risks and controls

| Risk | Control |
|---|---|
| Models/providers differ in native search support and streaming formats | Verify each allowlisted model against its provider's official docs; enable only verified combinations. |
| Native search may add provider charges | Disclose this in the provider/search status and do not make live calls in QA. |
| Persistent chats contain private user content | Enforce ownership on every read/write/delete; use parameterized SQL and cascade account deletion. |
| Document/chat text is untrusted or prompt-injection content | Treat it as evidence, not instructions; do not expose server-side tools beyond the approved provider search. |
| Context may exceed provider limits | Bound retrieved document/chat context and return explicit, actionable errors rather than silently truncating. |

### Authoritative provider references

- Gemini Google Search grounding:
  <https://ai.google.dev/gemini-api/docs/google-search>
- Anthropic Web Search tool:
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool>
- OpenAI web search tool and Responses API:
  <https://developers.openai.com/api/docs/guides/tools-web-search>

These sources establish native, model-selected search behavior; support for
each currently allowlisted model still must be checked before enabling it.

## Approved Initiative - Region Selection Annotations

**Status:** Implemented, locally verified, and committed as `ccdb27e`.
The parent pointer/change-log checkpoint is `cfcc2a7`. Boss approved the
workflow, gold selection treatment, and LibreOffice-to-PDF rendering approach
on 2026-10-27.

### Objective and approved behavior

Add region selection to the owned PDF and PPTX reader. A toolbar toggle
activates one-page/slide mouse, touch, or keyboard selection. The translucent
gold rectangle is represented as normalized page-local `x`, `y`, `width`, and
`height` values, so it remains aligned across zoom and viewport changes. The
popup offers:

- **Copy:** copy the selected area as a PNG image to the clipboard; surface
  browser permission or support failures.
- **Bookmark:** create a region bookmark through the existing optional-name
  dialog. Reopening it navigates to the source page/slide and outlines the
  rectangle.
- **Highlight:** persist an independent region highlight using the existing
  six-color palette and annotation management/removal flow.

Text and whole-page bookmark/highlight behavior remains unchanged. Read-only shared views cannot create or modify annotations. Cross-page
selection, OCR, external image services, and unapproved dependencies are out
of scope.

### Architecture and data contract

- Extend the existing startup schema migration additively for bookmark and
  highlight region type/coordinates; preserve all old SQLite and PostgreSQL
  rows.
- Extend the existing `/api/bookmarks` and `/api/highlights` contracts with
  a complete, validated normalized rectangle. Keep ownership checks at the
  routes; reject incomplete, non-finite, zero-area, or out-of-bounds geometry.
- Proposed additive request contract:

  ```json
  {
    "projectId": "project-id",
    "documentId": "document-id",
    "pageNumber": 2,
    "bookmarkType": "region",
    "name": "Optional name",
    "region": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.25 }
  }
  ```

  For `/api/highlights`, use `highlightType: "region"`, `color`, and the same
  `region` object; the existing text-highlight request remains the default
  `highlightType: "text"`. Both create routes keep their existing `{"id": ...}`
  response. Region coordinates must satisfy `0 <= x,y < 1`, positive width and
  height, `x + width <= 1`, and `y + height <= 1`.
- Reuse `BrowserPDFViewer.jsx` for reader state/actions and `PDFToolbar.jsx`
  for the mode control. Render PPTX through a cached LibreOffice PDF preview
  in PDF.js so slide selection and copied pixels share the same coordinate
  system. Extend `AppContext.jsx` and `BookmarksDrawer.jsx` to carry region
  location requests and restore the outline.
- Reuse `BookmarkNameDialog.jsx`, the highlight palette in `highlights.js`,
  existing notification/error patterns, and existing annotation management.
- Keep the selected rectangle transient until Copy, Bookmark, or Highlight is
  chosen. Escape/cancel clears an unfinished drag. Coordinate conversion clips
  to the page boundary and uses the rendered page box, not the viewport.

### Delivery tasks — complete

1. **Backend contract and migration** - support
   region bookmark/highlight records and validate their geometry. Verify
   legacy-row preservation and both database dialects.
2. **Reader selection and clipboard copy** - add the mutually-exclusive reader
   toggle, page-local mouse/touch drag, keyboard selection, normalized gold
   rectangle overlay, and PNG Copy action for PDF and PPTX. PPTX uses the
   existing LibreOffice installation to create a bounded, cached PDF preview;
   failures remain visible and preserve extracted-text fallback.
3. **Region bookmarks** - save through the existing named-bookmark flow and
   restore the page/slide rectangle when opened from the collection.
4. **Region highlights** - save a colored rectangle independently from
   bookmarks; restore, list, and remove it through the existing annotation
   flow.
5. **Verification and documentation** - run focused backend tests, browser
   flows, responsive checks, and production build; update this plan, the PRD,
   UI/UX inventory, task list, and change logs; review the focused diffs.

### Verification and boundaries

- Backend: focused bookmark/highlight/migration tests and social share
  geometry coverage from `backend/`.
- Frontend: `npm run build`, geometry unit tests, and `node qa-bookmarks.mjs`
  from `frontend/`, covering PDF/PPTX selection, PNG clipboard data, color
  persistence, bookmark restore/removal, keyboard/touch access, and responsive
  layouts. Result: build passed with the existing large-chunk advisory;
  3 geometry tests and 85 browser checks passed.
- Backend focused QA passed: bookmarks (7), highlights (6), migrations (3),
  PPTX preview conversion (1), and social sharing (11). PostgreSQL was not
  available for an integration run; its compatibility uses shared additive
  `ALTER TABLE` syntax.
- No new package or external API is required; no deployment or remote Git
  operation is planned.
- Local checkpoints include only the feature files, the intended parent
  pointer, and the root change log. Unrelated parent work remains untouched.

### Approved UI decisions

- Region Selection sits beside Text Selection and is mutually exclusive.
- Selection fill/outline are translucent gold.
- PPTX uses LibreOffice-to-PDF rendering in PDF.js; output can differ from
  Microsoft PowerPoint.

## Feature Slice: Drill-down Bookmark Organizer (2026-10-27)

### Scope and goals
- Replace flat bookmark drawer with a 2-level drill-down organizer.
- Level 1: Document list showing all project documents with bookmark counts (even 0 bookmarks). Search filters documents.
- Level 2: Bookmarks within selected document, with "← Back" button, document title, search filter, newest-first ordering, inline edit, delete, and jump.
- Clicking any bookmark navigates to the document and page/anchor/region, then closes the drawer.
- Preserve O(1) DSA BookmarkCollection parity and reactivity.

### Plan
1. **Frontend drill-down state**: Add `selectedDocumentId` state to `BookmarksDrawer.jsx`.
2. **Level 1 (Documents view)**: Render list of all documents with file icons, names, and bookmark count badges. Implement search filtering for documents.
3. **Level 2 (Document bookmarks view)**: Render selected document header, back button, document-specific search, newest-first bookmarks with edit/delete, and jump action.
4. **Verification**: Verify responsive behavior (390px, 425px, 768px, 1024px), empty states, keyboard/touch access, and run `npm run build` + backend tests.

## Feature Slice: Core CRUD, Media Viewer, AI Wing & Workspace Fixes (2026-10-27)

### Scope and goals
- Complete repository-internal code diagnosis and implementation for missing CRUD operations and faulty features.
- Provide Document rename, delete modals, and original file download.
- Provide Project rename and delete modals with cascading disk/storage cleanup.
- Add multi-format image viewer (`png`, `jpg`, `jpeg`, `webp`, `svg`) with zoom controls and OCR text fallback.
- Enhance AI Wing: `AbortController` streaming stop button, auto-expanding `<textarea>` (Shift+Enter newline support), answer copy, answer regenerate, bulk document permissions toggle, quiz retake, and flashcard shuffle.
- Enhance Recent Chats: message content search, project filter toggle, chronological date grouping (*Today*, *Yesterday*, *Previous 7 Days*, *Older*), and custom in-app delete modal.
- Add Account and GDPR privacy modal: profile details, GDPR ZIP export (`POST /api/account/export`), and verified account deletion (`DELETE /api/account`).

### Plan & Execution
1. **Backend routes & cleanups**: Added `PATCH /api/documents/{id}`; updated `DELETE /api/projects/{id}` for physical file unlinking and share revocation; updated `GET /api/chat/conversations` for project scoping and full-text message content search.
2. **Backend unit tests**: Authored `backend/qa_crud_operations.py` (3 tests passed). All 10 backend tests pass.
3. **Frontend components**: Updated `Sidebar.jsx`, `DashboardOverview.jsx`, `PDFToolbar.jsx`, `BrowserPDFViewer.jsx`, `AIWingView.jsx`, `RecentChatsDialog.jsx`, `Navbar.jsx`, and created `AccountModal.jsx` and `recentChatsHelper.js`.
4. **Frontend unit tests & build**: 12 unit tests pass (`recentChatsHelper.test.js`, `bookmarkOrganizer.test.js`, etc.), Vite production build succeeds with 0 errors.
