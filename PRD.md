# PRD: Knoprix Final Project

**Type:** College project / document knowledge platform  
**Status:** Product direction approved; detailed UI/UX decisions remain pending
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
- Add user-controlled cloud AI provider connections later.
- Support document chat first, then summaries, flashcards, quizzes, and
  opt-in web research as separate slices.
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
  and are sent directly from the browser to the approved provider. Knoprix
  backend endpoints must reject key material and never store or log it.
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
- **Public identity:** Users may be discoverable by verified email or a
  randomly generated public Knoprix ID distinct from internal database IDs.
- **Data lifecycle:** User content and derived data remain until the user
  deletes them. Encrypted backups may retain deleted data for up to 30 days
  before purge; actual deletion/export behavior must be implemented and
  verified before public beta.
- **Initial file scope:** PDF, PPTX, DOCX, TXT, and MD. English OCR is the
  initial target; images and other OCR languages require explicit support and
  quality evidence before being represented as supported.
- **Initial scale assumption:** Plan initially for 100–1,000 users; this is a
  planning estimate, not a capacity or availability guarantee.

## 4. Capability Acceptance Criteria

### Foundation

- The new project starts independently from the old repository.
- The backend and frontend have separate local start commands.
- No uploaded documents, database files, dependency caches, or secrets are
  copied into the new baseline.
- When Firebase is configured, email/password registration and sign-in require
  a verified email; the backend verifies Firebase ID tokens and links existing
  Knoprix accounts by verified email without changing their internal user ID
  or project ownership. Firebase console and deployment setup remain manual.

### Core backend

- Existing health, authentication, project, document, search, DSA, bookmark,
  and highlight routes remain available.
- Existing bookmark behavior remains Hash Table + Doubly Linked List based.
- Any backend behavior change is proposed and approved separately.

### AI integration — later slice

- A user can add a supported provider key without exposing it to the Knoprix
  backend.
- The provider and model are visible before a request is sent.
- The user selects the document scope explicitly and grants AI access for
  those documents.
- Third-party processing requires a separate consent that names the provider
  and model before document content is sent.
- The system returns a grounded answer with document citations.
- Provider failure, invalid key, rate limit, and unsupported model errors are
  visible and actionable.

### Sharing — later slice

- A user can discover and request a mutual contact relationship using verified
  email or public Knoprix ID.
- Contact status alone never grants access to a project, document, bookmark,
  or highlight.
- A recipient sees a share request in Knoprix and must accept before access is
  granted; the sender can revoke it.
- Shared content is read-only. AI use of a shared document requires sender
  opt-in, the recipient's own document grant, and provider/model consent before
  any external transfer.
- Email can notify users of in-app events, but cannot deliver a private file or
  bypass Knoprix authentication and share acceptance.

## 5. API Contract Direction

The existing API remains the baseline. The current backend exposes
`GET /api/providers/allowlist` and `POST /api/chat/ask`; the latter currently
returns a mocked response with citations. The frontend can make browser-direct
calls to some allowlisted providers. These paths are not yet a complete,
persisted AI-grant system. Future API contracts must enforce ownership/share
access and AI grants before returning content:

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

No provider-key endpoint is planned under the approved browser-local BYOK
policy. New contracts use `/api/v1`; existing `/api/...` paths remain
unchanged. The complete request/response, data, authorization, idempotency,
pagination, expiry, deletion, and verification rules are in
`docs/api-data-permission-contract.md`. That document is a target spec, not a
claim that the behaviors are implemented.

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
- **Ask first:** new dependencies, provider/API usage, schema changes,
  custom provider endpoints, deployment, remote Git operations, and meaningful
  UI/UX choices.
- **Never:** commit API keys, expose provider credentials to React, silently
  upload documents, delete user data, or present unverified AI output as fact.

## 9. Product decisions recorded 2026-10-04

- Mode names: **Reading Desk** (document-first) and **AI Wing** (AI-first).
  Names are approved; their visual layouts and interactions are not.
- Consent: Knoprix-controlled backend processing is distinct from
  third-party AI-provider transfer. AI requires selected-document grants;
  external transfer requires an additional provider-specific opt-in.
- Provider keys: browser-local only; do not send them to or store them in the
  backend.
- Sharing: mutual contacts; each resource share is separately accepted and
  appears in the recipient's Knoprix inbox. Optional email is notification
  only. V1 shares are read-only snapshots; pending requests expire after 30
  days, accepted shares remain until revoked/left, and removing a contact
  cancels pending shares and revokes accepted shares. A project snapshot
  includes current documents, bookmarks, and highlights; new items require a
  new share.
- Shared-document AI: sender explicitly enables AI access; the recipient
  separately grants document AI access and gives provider/model consent for
  external transfer.
- Conversation history: browser-local only in v1; no Knoprix sync.
- Extraction history: terminal job metadata expires after 30 days; this does
  not delete the source document.
- Initial supported formats: PDF, PPTX, DOCX, TXT, MD; English OCR is the
  first target.
- Retention: content remains until user deletion; encrypted backups may retain
  deleted content for up to 30 days.
- Deployment direction: Render + Vercel + Supabase.
- Initial scale planning assumption: 100–1,000 users.

## 10. Success Criteria

- The copied backend starts locally and its health endpoint responds.
- The frontend starts locally and builds successfully.
- The UI/UX inventory is approved surface by surface.
- Each feature is delivered as a verified vertical slice with a local commit.
- AI document chat is optional, provider-controlled, citation-aware, and
  unavailable rather than misleading when configuration is missing.

## 11. Polish and Fixes

The project follows the complete checklist at:
`checklists/033-vibecoding-complete-33-checklist.md`.

Progress is intentionally `0/33` until each item is evaluated against the new
interface and either implemented or marked `N/A` with a reason.

For the approved reader slice, the source checklists remain:

- `../checklists/016-vibecoding-polish-checklist.md`
- `../checklists/017-vibecoding-fix-checklist.md`
