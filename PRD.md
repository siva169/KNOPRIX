# PRD: Knoprix Final Project

**Type:** College project / document knowledge platform  
**Status:** General AI chat and account-synced history are implemented in the
current worktree. Retrieval is internal context gathering; provider-native
search is limited to the verified Gemini models documented below. Live
provider behavior remains unverified.
**Source baseline:** Current Knoprix mid-review version  
**Project folder:** `knoprix-final-project/`

## 1. Problem Statement — WHY

Students and researchers need one place to read course documents, search
across them, save important pages, highlight evidence, and later ask questions
about selected documents. Existing readers separate these activities and make
study context difficult to preserve.

**Primary user:** A student reading PDFs/PPTs on a laptop or mobile device.  
**Opportunity:** Turn document reading into a searchable, explainable study
workspace.  
**One-line pitch:** Read, find, remember, and later discuss the evidence inside
your documents.

## 2. Goals and Non-Goals — WHAT

### Goals

- Preserve the current backend routes and data behavior as the new baseline.
- Improve the interface as a deliberate, mobile-first reading workspace.
- Keep document search explainable through the existing Trie and inverted index.
- Keep bookmark ordering explainable through Hash Table + Doubly Linked List.
- Support user-controlled AI provider connections with explicit,
  provider/model-specific confirmation before sending document context and
  disclosure when saved-chat context is included.
- Send extracted page text only; do not upload original files or send images,
  charts, diagrams, or visual layout in document chat.
- Support one general AI Wing chat that can use authorized document evidence
  and provider-native live web search when the selected model supports it.
  Summaries, flashcards, and quizzes remain separate feature slices.
- Show source citations for AI answers whenever document evidence is used.
- Keep a document-first **Reading Desk** and an AI-first **AI Wing** connected
  through shared reader state and explicit AI source permissions.
- Make knowledge-map concepts actionable and traceable to source pages.
- Allow in-app sharing of approved resources with accepted contacts.

### Non-goals for the first rebuild

- No end-user on-device LLM installation in the initial release.
- No AI provider key hardcoded in source code.
- No automatic upload of every document to a provider.
- No delivery of private documents as email attachments; email may only
  notify users about in-app requests.
- No deployment or remote push without explicit approval.
- No visual implementation before the user approves the UI/UX decisions.

## 3. Approved Architecture

- **Backend:** Existing FastAPI application copied from the current Knoprix
  version.
- **Frontend:** Existing React + Vite application copied as a functional
  baseline, then redesigned through approved UI/UX slices.
- **Persistence:** Existing database layer remains the source of truth.
- **AI providers:** Free-tier providers from the server-published allowlist;
  verify availability and terms when implementing each provider.
- **BYOK — Bring Your Own Key:** Provider keys remain in browser-local storage
  and are sent in request headers to Knoprix backend routes for provider
  operations. The backend uses them only in request memory and never stores or
  logs raw keys. NVIDIA uses a backend-managed key.
- **Model allowlist:** Knoprix displays only models explicitly approved by
  the application configuration.
- **Document scope:** Every AI operation uses only explicitly selected,
  authorized documents with an active per-document AI grant.
- **Consent boundary:** Routine storage, extraction, and indexing happen on
  Knoprix-controlled backend/storage after upload and must be disclosed.
  AI access to a document requires an explicit grant; sending document content
  to a third-party AI provider requires a separate, provider-specific consent.
  Current production direction is Render + Vercel + Supabase; this is server
  processing, not on-device processing.
- **Sharing:** Accepted shares appear inside the recipient's Knoprix account.
  Contact acceptance and every resource-share acceptance are separate.
  Contacts are mutual; each share can be revoked. Email is an optional
  notification only.
- **Public identity:** Contact discovery uses only the random public Knoprix ID;
  email addresses are never a discovery mechanism.
- **Data lifecycle:** User content and derived data remain until the user
  deletes them. Encrypted backups may retain deleted data for up to 30 days
  before purge; actual deletion/export behavior must be implemented and
  verified before public beta.
- **Initial file scope:** PDF, PPTX, DOCX, TXT, MD, PNG, JPG/JPEG, and static
  SVG. Standalone images are stored as originals without OCR in this slice;
  English OCR remains a separate capability requiring explicit support and
  quality evidence. Legacy `.ppt` is unsupported.
- **Initial scale assumption:** Plan initially for 100–1,000 users; this is a
  planning estimate, not a capacity or availability guarantee.

## 4. Capability Acceptance Criteria

### Foundation

- The new project starts independently from the old repository.
- The backend and frontend have separate local start commands.
- No uploaded documents, database files, dependency caches, or secrets are
  copied into the new baseline.
- When Firebase is configured, email/password registration and sign-in do not
  require email verification. The backend verifies Firebase ID tokens; a
  verified email is required only to link an unlinked existing Knoprix account,
  preserving its internal user ID and project ownership. Firebase console
  and deployment setup remain manual.

### Core backend

- Existing health, authentication, project, document, search, DSA, bookmark,
  and highlight routes remain available.
- Existing bookmark behavior remains Hash Table + Doubly Linked List based.
- Project document lists include authenticated-user bookmark and highlight
  totals per document. The sidebar can expand these items and jump to a saved
  page/text anchor without loading every document's highlights at startup.
- Any backend behavior change is proposed and approved separately.

### Reading Desk - region selection annotations

- In an owned PDF or PPT/PPTX reader, Region Selection mode captures one
  page/slide rectangle per mouse or touch drag. It is separate from text
  selection and is unavailable in read-only shared views.
- The rectangle is stored as normalized page-local `x`, `y`, `width`, and
  `height` values in the range 0..1, with positive width/height and
  `x + width <= 1`, `y + height <= 1`. The API rejects non-finite,
  incomplete, zero-area, or out-of-page rectangles.
- The action popup offers Copy, Bookmark, and Highlight. Copy writes a PNG
  crop to the clipboard and reports unsupported/denied clipboard operations.
- A region bookmark remains a bookmark-collection item, has optional naming
  through the existing dialog, and opens the document at its page/slide with
  the saved rectangle outlined. It is distinct from whole-page and text
  bookmarks.
- A region highlight remains independent from bookmarks, persists with one of
  the existing six highlight colors, renders after reopening, and appears in
  the existing highlight/annotation management flow.
- Existing text/page bookmarks and text highlights survive the additive
  SQLite/PostgreSQL schema migration unchanged. No OCR, cross-page selection,
  external image service, or new dependency is in scope without further
  approval.
- Success requires focused backend migration/API tests, browser verification
  of selection/copy/save/reopen/removal, a production build, and responsive
  checks at 390, 425, 768, and 1024px.

### AI integration — one general, source-aware chat

- Replace the user-selectable Retrieval/Document text modes with one general
  chat. Keep passage retrieval as an internal context-gathering mechanism.
- The model may answer general questions without document evidence. When
  relevant, the backend may provide bounded passages only from active-project
  documents with active AI grants and bounded messages only from the signed-in
  user's saved conversations.
- Document context sent to an external provider requires the existing
  per-request confirmation naming provider, model, and documents. Disclose
  when relevant saved-chat context is also included. Cancel sends nothing.
- The server checks account ownership, active document grants, conversation
  ownership, provider/model allowlists, and context limits before reading or
  sending context. Retrieved passages are evidence, never instructions.
- Preserve structured document citations and add validated provider web
  citations where supported. Do not claim that model output is verified fact.
- Use provider-native web search only for provider/model combinations verified
  against official documentation. The selected model decides whether to search.
  Other models remain usable and clearly show that live search is unavailable.
  Provider search may incur provider-defined usage charges.
- New provider-file uploads and full-document visual chat remain retired.
  Existing provider-copy records remain visible for cleanup; revoke and
  retry-delete actions remain for legacy remote copies.
- BYOK keys remain browser-local and are sent only in request headers to
  Knoprix; raw keys are never persisted server-side. NVIDIA uses a
  server-managed key. Provider safety safeguards remain enabled.

### Sharing — first implementation slice

- Contact requests use discoverable Knoprix IDs only; privacy settings govern
  lookup and incoming requests. Email is never a discovery key.
- Contact status alone never grants access to a project, document, bookmark,
  or highlight.
- A recipient sees each resource-share request in Knoprix and must accept it.
  The current resource scopes are an individual document, bookmark, or
  highlight; project snapshots are not supported.
- Accepted document shares provide read-only access to that document's
  existing reader endpoints. Bookmark/highlight shares expose only the selected
  annotation; a shared annotation opens its source only when the recipient also
  has a separately accepted share for that document. Contact removal, blocking,
  owner revocation, recipient leave, or source deletion removes future access.
- Contacts & sharing loads sections independently, retains successful data,
  names failed sections, and offers a retry for those requests.
- Email preference fields are present, but email delivery is not configured.
  Do not claim that email notifications are sent. Email cannot deliver private
  files or bypass Knoprix authentication and share acceptance.

## 5. API Contract Direction

The existing API remains the baseline. The backend exposes
`GET /api/providers/allowlist`, `POST /api/chat/ask`, `POST /api/chat/stream`,
authenticated conversation list/create/read/rename/delete routes, and
provider-document status/revoke/retry routes for legacy provider copies.
The legacy `/api/chat/ask` and `/api/chat/stream` routes will provide one
general chat flow with optional authorized context. Authenticated conversation
CRUD routes will provide synced history. Retired provider-upload and
full-document chat routes remain unavailable. The `/api/v1` contracts below
remain future work and must enforce ownership/share access and AI grants before
returning content:

```text
GET    /api/health                         (legacy)
GET    /api/providers/allowlist            (legacy)
POST   /api/chat/ask                       (legacy)
GET    /api/v1/providers/allowlist
POST   /api/v1/projects/{id}/documents     (async extraction contract)
POST   /api/v1/documents/{id}/ai-grants
POST   /api/v1/documents/{id}/summary
POST   /api/v1/ai/retrieval
POST   /api/v1/contact-requests
POST   /api/v1/shares
```

No provider-key endpoint is planned. The complete request/response, data,
authorization, idempotency, pagination, expiry, deletion, and verification
rules are in `docs/api-data-permission-contract.md`, which distinguishes the
implemented legacy chat and provider-copy cleanup routes from the future
`/api/v1` target.

## 6. UI/UX Contract

The complete component inventory and required decisions are in `UI-UX.md`.
The user supplies screenshot/reference URLs in that file before the relevant
surface is implemented.

Required responsive checks: 390px, 425px, 768px, and 1024px.

## 7. Testing Strategy

- Backend: existing Python compilation and API smoke tests, followed by
  focused tests for each changed route.
- Frontend: production build after each vertical slice.
- Browser: interaction and responsive verification at the required widths.
- Security: key masking, authorization, provider allowlist, request limits,
  custom endpoint SSRF protection if custom endpoints are later enabled.
- Accessibility: keyboard navigation, focus states, labels, alerts, and
  readable contrast.

## 8. Boundaries

- **Always:** preserve unrelated user changes, validate inputs, keep secrets
  out of Git, update `changes.md`, verify before committing.
- **Ask first:** live provider calls, custom provider endpoints, deployment,
  remote Git operations, and meaningful UI/UX choices. The approved full-
  document backend slice includes its focused schema/API changes.
- **Never:** commit API keys, expose provider credentials to React, silently
  upload documents, delete user data, or present unverified AI output as fact.

## 9. Product decisions recorded 2026-10-04 and 2026-10-12

- Mode names: **Reading Desk** (document-first) and **AI Wing** (AI-first).
  Names are approved; their visual layouts and interactions are not.
- Consent: Knoprix-controlled backend processing is distinct from
  third-party AI-provider transfer. AI requires selected-document grants;
  external transfer requires an additional provider-specific opt-in.
- Provider keys: browser-local only; do not send them to or store them in the
  backend.
- Sharing: mutual contacts; each resource share is separately accepted and
  appears in the recipient's Knoprix inbox. Pending requests expire after 30
  days; accepted shares remain until revoked/left. Contact removal or blocking
  revokes pending and accepted shares.
- 2026-10-12: Public IDs use `KP-` plus 10 random Crockford Base32 characters;
  database uniqueness and ID-only discovery are required. Users can control
  lookup and incoming contact requests. Share only individual documents,
  bookmarks, and highlights; do not implement project snapshots. Approve the
  dedicated dark/gold Contacts page and proposed sections/entry points. Defer
  connecting an email-delivery provider; email preference remains unavailable
  until that service is approved and configured.
- Shared-document AI: sender explicitly enables AI access; the recipient
  separately grants document AI access and gives provider/model consent for
  external transfer.
- Conversation history: account-synced on Knoprix; only the authenticated
  owner may list, read, rename, or delete it. Provider keys are never stored.
- Extraction history: terminal job metadata expires after 30 days; this does
  not delete the source document.
- Initial supported formats: PDF, PPTX, DOCX, TXT, MD, PNG, JPG/JPEG, and
  static SVG. Standalone images are preserved without OCR; English OCR is a
  separate capability. See `docs/upload-support-matrix.md`.
- Retention: content remains until user deletion; encrypted backups may retain
  deleted content for up to 30 days.
- Deployment direction: Render + Vercel + Supabase.
- Initial scale planning assumption: 100–1,000 users.

## 9a. Historical full-document AI decisions recorded 2026-10-20

These decisions describe the earlier implementation and were superseded by
the approved general-chat direction below. Cleanup routes remain for old
provider copies; upload and full-document chat are retired.

- Require both existing Knoprix AI access and separate confirmation naming
  the external provider/model before transferring a document.
- Reuse provider file uploads where available; split uploads into 20-page
  parts and reject any part exceeding 50 MB.
- Refresh expired Gemini uploads after the approved 48-hour expiry.
- For NVIDIA, render and analyze every page in four-page batches per question,
  with progress and cost/latency notices in the UI.
- Keep provider-specific statuses, immediate local revocation, and a
  retryable remote-deletion-pending state.
- AI Wing uses a Retrieval / Full documents segmented control. Before a
  transfer, one confirmation lists every currently AI-enabled document and
  names the provider/model; per-document status and revoke/retry actions remain
  inline. If reliable pricing is unavailable, disclose possible provider
  charges/quota use and latency without inventing a price.
- No separate per-chat document checkbox is added in this slice: the current
  chat scope is all documents with an active Knoprix AI grant in the project.
- No live provider calls, deployment, or remote push are authorized.

## 9b. Approved AI Wing general chat and synced history

- The mode selector is removed; retrieval remains an internal method, not a
  separate user-facing mode. General questions work without document context.
- Relevant document context is restricted to active-project documents with
  active AI grants. Relevant chat context is restricted to the signed-in
  user's own saved messages. Context is bounded and disclosed before provider
  transfer.
- Provider-native search is enabled only for officially verified
  provider/model pairs. Unsupported models remain usable with a visible
  no-live-search status. Search may use provider quota or incur charges.
- Conversations and ordered messages are stored in Knoprix for account sync.
  Deleting a conversation deletes its messages; account deletion removes all
  conversations. No keys, full prompts in logs, or retrieved passages as
  separate chat records are stored.
- Provider safety safeguards, model allowlists, document grants, and
  provider/model disclosures remain in force. This removes the
  document-only answer restriction, not provider safeguards.
- The Recent Chats dialog supports title search, title/date rows, new/open,
  rename, and confirmed deletion. Its dark/gold styling is retained; it is
  full-width on mobile and centered on larger screens.

## 10. Success Criteria

- The copied backend starts locally and its health endpoint responds.
- The frontend starts locally and builds successfully.
- The UI/UX inventory is approved surface by surface.
- Each feature is delivered as a verified vertical slice with a local commit.
- AI document chat is optional, provider-controlled, citation-aware, and
  unavailable rather than misleading when configuration is missing.

## 11. Polish and Fixes

The project follows the complete checklist at:
`checklists/033-vibecoding-complete-33-checklist.md`. The AI Wing feature
evaluation is recorded in that project-local checklist; it does not claim
whole-project completion.

Progress is intentionally `0/33` until each item is evaluated against the new
interface and either implemented or marked `N/A` with a reason.

For the approved reader slice, the source checklists remain:

- `../checklists/016-vibecoding-polish-checklist.md`
- `../checklists/017-vibecoding-fix-checklist.md`
