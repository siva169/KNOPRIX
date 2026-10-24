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
