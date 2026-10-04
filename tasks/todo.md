# Knoprix Consumer-Grade Product Backlog

This is the master, dependency-ordered backlog for taking Knoprix from its
current academic prototype toward a trustworthy consumer product. It separates
verified current capabilities from future work. A checkbox means the work has
been implemented and verified; planning or partial wiring does not count.

## Product direction

- **Reading Desk**: proposed name for the document-first reading and annotation
  workspace; confirm the visible product copy before UI implementation.
- **AI Wing**: AI-first notebook/chat workspace; keep the active document,
  page, and approved source scope connected to Reading Desk.
- **Sharing destination**: accepted shares appear inside the recipient's
  Knoprix account. Email is an optional notification channel, not the place
  where the shared file is delivered.
- **Trust boundaries**: contact acceptance, resource-share acceptance, and AI
  access are separate permissions.
- **AI providers**: current BYOK contract says keys stay browser-local and
  provider requests go browser-to-provider. Do not move keys to the backend
  until the conflicting PRD contract is explicitly resolved.
- **RAG**: use retrieval to select source-grounded evidence; use a separate
  text-generation model to write summaries/answers. Laya may classify or route
  tasks, but is neither a text generator nor an authorization mechanism.
- **Knowledge map**: evolve the current heuristic shared-term graph into an
  evidence-linked mind map. Label inferred/shared-topic links honestly.

## Current baseline — verified in source/docs, not a claim of production readiness

- [x] React + Vite frontend and FastAPI modular-monolith backend.
- [x] Password registration/login, bcrypt password hashes, JWT access and
  refresh tokens, and owner-scoped project/document checks.
- [x] Project/document CRUD, upload, PDF stream, page text, PPTX slide data,
  deletion, local SQLite, optional PostgreSQL, and optional S3-compatible file
  storage.
- [x] PDF text extraction, PPTX text extraction, DOCX paragraphs/tables, and
  TXT/MD extraction; no complete OCR/image/table-fidelity pipeline.
- [x] Trie autocomplete, inverted-index keyword search, Min-Heap top-k passage
  ranking, and persisted JSON-serialized derived search indexes.
- [x] Bookmark collection implemented with Hash Table + Doubly Linked List
  semantics; highlights are separate records and are not linked to bookmarks.
- [x] Heuristic shared-word knowledge graph with evidence excerpts, page jumps,
  document filters, and user-pinned concepts; not a semantic mind map yet.
- [x] Deterministic extractive summary endpoint; it selects original sentences
  and is not generative summarization.
- [x] Chat panel with explicit document selection, allowlist checks, citation
  retrieval, and browser-direct provider calls for some configured providers;
  the backend response itself is mocked. Current docs/UI status needs a
  canonical contract and truthful live/mock behavior.
- [x] Local reading progress, reader focus mode, command palette, thumbnails,
  annotation controls, theme, responsive shell, and a dashboard with
  document search and filters.

## Delivery rules for every feature slice

- Build one vertical slice at a time: contract → backend/data → frontend →
  tests → documentation → local checkpoint.
- Preserve APIs/records where possible; migrations must be tested against a
  copied database and have a rollback/recovery plan.
- Get boss approval for unresolved provider, data-retention, privacy, and UI/UX
  decisions before implementing them. Obtain explicit authorization before
  connecting new external accounts/services or using credentials.
- Do not promise zero errors, zero latency, or perfect extraction. Define
  measurable quality/latency targets and communicate uncertainty.
- For UI work, record boss-approved choices in `UI-UX.md`; verify
  accessibility and widths 390, 425, 768, and 1024px.
- For implementation tasks, attach focused automated tests and update
  `changes.md`. Never mark a task done on build-only evidence if behavior,
  permission boundaries, or data integrity are the acceptance target.

## Phase 0 — Product decisions and stable contracts

### [x] 0.1 Resolve product and privacy decisions

**Priority:** P0 — blocks authorization and AI implementation
**Description:** Confirm the user-visible names, sharing policy, AI processing
locations, key handling, document-consent meaning, and operational limits.

**Acceptance criteria**
- [x] Confirm whether **Reading Desk** is the final reading-mode label; retain
  **AI Wing** as the working AI-mode label unless boss changes it.
- [x] Specify whether AI approval permits Knoprix backend processing, third-party cloud
  provider transfer, or each as a separate consent.
- [x] Resolve the conflict between `PRD.md` (encrypted backend provider keys)
  and `docs/byok-security-contract.md` (keys browser-local, never sent to the
  backend); one canonical policy is reflected everywhere.
- [x] Confirm contact requests are mutual, every resource share requires
  recipient acceptance and can be revoked to remove access, and email only
  notifies.
- [x] Select initial supported file formats, OCR languages, retention rules,
  target deployment, and initial product scale.

**Decision record (boss-approved 2026-10-04):**
- Names: Reading Desk and AI Wing; visuals/interactions remain unapproved.
- Processing: Knoprix backend processing is separate from third-party AI
  transfer; provider-specific consent is required before external transfer.
- Provider keys: browser-local only; never sent to/stored by the backend.
- Sharing: mutual contacts; each share separately accepted; deliver in Knoprix;
  optional email is notification only.
- Initial files: PDF/PPTX/DOCX/TXT/MD; English OCR target.
- Retention: until user deletes; encrypted backups may retain deleted data up
  to 30 days.
- Deployment: Render + Vercel + Supabase; initial planning assumption
  100–1,000 users.
**Verification:** Mode names/status are reflected in `UI-UX.md`; processing,
key, and retention rules are in `PRD.md` and `docs/byok-security-contract.md`;
sharing policy is in `PRD.md`. No application code changed.
**Dependencies:** None.
**Files touched:** `PRD.md`, `UI-UX.md`, `docs/byok-security-contract.md`,
`tasks/todo.md`, `changes.md`
**Estimated scope:** Medium

### [x] 0.2 Define API, data, and permission contracts

**Priority:** P0
**Description:** Document versioned request/response shapes and entity
relationships before any schema or UI work.

**Acceptance criteria**
- [x] Define contracts for extraction jobs, document blocks, AI grants,
  conversation/messages, citations, graph nodes/edges, contact requests,
  resource shares, inbox items, and notifications.
- [x] Define one authorization rule: every resource read checks the owner or
  active accepted share; every AI read also checks an active AI grant and
  provider consent where applicable, plus sender AI permission for shared
  documents.
- [x] Define idempotency, pagination, deletion, revocation, and expiry behavior
  for long-running jobs and share requests.
- [x] Keep response schemas explicit; reject unexpected sensitive fields and
  never return provider secrets.

**Decision record (boss-approved 2026-10-04):**
- API: new routes use `/api/v1`; existing `/api/...` routes stay unchanged.
- Conversation history: browser-local only; no server sync in v1.
- Shares: read-only; project shares are snapshots; pending requests expire
  after 30 days; accepted access lasts until sender revocation or recipient
  leaves.
- Removing a mutual contact cancels pending shares and revokes accepted
  shares; terminal extraction job metadata expires 30 days after completion.
- AI on shared documents: sender must explicitly enable it; recipient still
  needs their own AI grant and provider/model consent.
- Provider keys remain browser-local and are never part of API payloads.
**Verification:** `docs/api-data-permission-contract.md` defines request and
response shapes, relationships, authorization, error, retry, pagination,
expiry, deletion, and verification cases. Legacy API behavior and the
implementation boundary are explicitly identified.
**Dependencies:** 0.1.
**Files touched:** `PRD.md`, `docs/api-data-permission-contract.md`,
`docs/byok-security-contract.md`, `tasks/plan.md`, `tasks/todo.md`,
`changes.md`
**Estimated scope:** Medium

### [ ] 0.3 Add safe, versioned database migrations

**Priority:** P0
**Description:** Replace schema changes hidden inside startup code with
versioned, testable migrations before introducing grants, sharing, jobs, or
structured extraction records.

**Acceptance criteria**
- [ ] Existing SQLite and PostgreSQL databases can be upgraded without losing
  users, documents, bookmarks, highlights, or DSA data.
- [ ] Each migration records its version and can detect already-applied work.
- [ ] Migration tests cover fresh database, current database upgrade, repeated
  startup, and documented recovery/rollback strategy.

**Verification:** Run migration tests on disposable copies of both supported
database types where available; compare row counts and key relationships
before/after.
**Dependencies:** 0.2.
**Files likely touched:** `backend/app/database.py`, `backend/migrations/`,
`backend/qa_*`, `backend/requirements.txt`
**Estimated scope:** Medium

## Phase 1 — Consumer-grade account access and abuse protection

### [ ] 1.1 Harden account/session lifecycle

**Priority:** P0
**Description:** Strengthen the existing password/JWT flow and align browser
token handling with the approved threat model.

**Acceptance criteria**
- [ ] Access/refresh tokens have explicit rotation, expiry, logout/revocation,
  and concurrent-session behavior.
- [ ] Production secrets are required and validated; unsafe default JWT
  secrets cannot start a production deployment.
- [ ] Auth errors avoid account enumeration; rate limits work across deployed
  instances, not only in one process.
- [ ] Frontend session storage and refresh failure behavior are documented and
  tested; no credentials/tokens appear in logs.

**Verification:** Auth tests cover invalid credentials, expiry, refresh
rotation/reuse, logout, rate limit, and cross-user access.
**Dependencies:** 0.2, 0.3.
**Files likely touched:** `backend/app/security.py`, `backend/app/routers/auth.py`,
`backend/app/config.py`, `frontend/src/context/AuthContext.jsx`, auth tests
**Estimated scope:** Medium

### [ ] 1.2 Add Google sign-in using OAuth/OIDC

**Priority:** P1
**Description:** Add Google as an optional login method while retaining
password sign-in unless boss chooses otherwise. Google is an identity provider,
not a replacement for Knoprix authorization.

**Acceptance criteria**
- [ ] Validate provider signatures, issuer, audience, expiry, nonce/state, and
  verified email before account linking.
- [ ] Prevent account takeover or duplicate accounts when Google identity and
  existing email/password accounts overlap.
- [ ] Store only required provider subject/identity fields; support unlinking
  only when another valid sign-in method remains.
- [ ] OAuth secrets stay server-side; redirect/callback origins are an exact
  allowlist; failures show recoverable messages.

**Verification:** Automated tests cover forged/expired tokens, wrong audience,
CSRF/state mismatch, duplicate identity, safe linking, and sign-in rollback.
**Dependencies:** 0.1–0.3, 1.1.
**External gate:** Boss supplies/authorizes the Google Cloud OAuth client and
approved callback configuration before connection/testing.
**Files likely touched:** `backend/app/routers/auth.py`, `backend/app/config.py`,
`backend/migrations/`, `frontend/src/components/auth/`, auth tests
**Estimated scope:** Medium

### [ ] 1.3 Add email verification and account recovery

**Priority:** P1
**Description:** Make email ownership and account recovery safe before adding
email-based contacts and share invitations.

**Acceptance criteria**
- [ ] Verification/reset tokens are single-use, expiring, stored hashed, and
  invalidated after use or replacement.
- [ ] Responses avoid revealing whether an email has an account.
- [ ] Password-reset flow invalidates/revokes sessions according to the
  approved policy.
- [ ] Email delivery failure is visible and retryable without exposing tokens
  in logs.

**Verification:** Tests cover expired, reused, malformed, and cross-account
tokens plus delivery failures.
**Dependencies:** 0.1, 1.1.
**External gate:** Choose and explicitly authorize an email delivery provider
before connecting it.
**Files likely touched:** `backend/app/routers/auth.py`, `backend/app/config.py`,
`backend/migrations/`, `frontend/src/components/auth/`, tests
**Estimated scope:** Medium

### [ ] 1.4 Add CAPTCHA/bot defense with accessible fallback

**Priority:** P1
**Description:** Protect registration, login, recovery, and contact-invite
flows against automated abuse. CAPTCHA complements—not replaces—rate limits,
email verification, and abuse monitoring.

**Acceptance criteria**
- [ ] Boss selects a provider after reviewing privacy/data transfer,
  accessibility, cost, deployment, and fallback trade-offs (e.g. reCAPTCHA or
  Turnstile); do not silently connect either.
- [ ] Backend verifies challenge tokens server-to-server with secret material
  only on the backend and fails safely when verification is unavailable.
- [ ] Challenge is triggered by risk/threshold policy where supported; keyboard
  and screen-reader users have an accessible fallback.
- [ ] Tests cover missing, invalid, expired, replayed, provider-timeout, and
  valid challenge responses.

**Verification:** Provider adapter contract tests plus staging end-to-end test;
confirm CAPTCHA secrets never reach the browser, Git, or logs.
**Dependencies:** 0.1, 1.1.
**External gate:** Provider account/configuration and any external data
processing require explicit approval.
**Files likely touched:** `backend/app/routers/auth.py`, `backend/app/config.py`,
`frontend/src/components/auth/`, tests, privacy documentation
**Estimated scope:** Medium

## Phase 2 — Reliable, inspectable document ingestion

### [ ] 2.1 Make upload validation content-based and explicit

**Priority:** P0
**Description:** Treat every file as untrusted. Validate actual file content,
not only filename extension or browser MIME type.

**Acceptance criteria**
- [ ] Enforce configured size limits while streaming; reject empty, malformed,
  unsupported, and mismatched files before processing.
- [ ] Validate file signatures, safe storage keys, decompression/resource
  limits, and filename display separately.
- [ ] Publish a tested support matrix for PDF, PPTX, DOCX, TXT, MD, and image
  formats; reject legacy `.ppt` until a real parser is supported.
- [ ] Uploaded files remain private and downloadable only after authorization.

**Verification:** Upload tests include spoofed extensions/MIME, oversized,
truncated, empty, and valid sample files.
**Dependencies:** 0.2.
**Files likely touched:** `backend/app/routers/documents.py`,
`backend/app/services/storage.py`, `backend/app/config.py`, tests
**Estimated scope:** Medium

### [ ] 2.2 Store source-preserving structured extraction output

**Priority:** P0
**Description:** Preserve original files and represent extracted content as
typed, location-aware records instead of treating one flattened text string
as the only source.

**Acceptance criteria**
- [ ] Represent paragraphs, headings, table cells, image references, and
  page/slide boundaries with document ID, location, extraction method, and
  parser version.
- [ ] Keep normalized, frequently queried fields relational; use JSON/JSONB
  only for parser-specific metadata that genuinely varies by format.
- [ ] Treat DSA indexes and embeddings as rebuildable derived data, not the
  canonical copy of source content.
- [ ] Preserve compatibility while migrating existing `extracted_text` and
  `document_pages` records; never silently discard old content.

**Verification:** Fixture tests compare extracted block order/locations and
confirm old documents remain readable after migration.
**Dependencies:** 0.2, 0.3, 2.1.
**Files likely touched:** `backend/app/database.py`, `backend/migrations/`,
`backend/app/services/pdf_parser.py`, `backend/app/routers/documents.py`,
tests
**Estimated scope:** Medium

### [ ] 2.3 Extract tables and images with honest confidence signals

**Priority:** P1
**Description:** Improve PDF/PPTX/DOCX extraction while distinguishing literal
source text from OCR or generated interpretation.

**Acceptance criteria**
- [ ] Extract text and tables with page/slide coordinates or stable location
  metadata where supported by the parser.
- [ ] Preserve embedded image references; OCR scanned pages/images using an
  explicitly selected OCR engine/language set.
- [ ] Label OCR output and optional AI image descriptions by origin; never
  present generated descriptions as text present in the original.
- [ ] Mark unreadable/low-confidence regions for review and state unsupported
  cases; do not invent missing content or claim perfect accuracy.

**Verification:** Curated gold corpus includes born-digital/scanned PDFs,
multi-column layouts, tables, charts/images, DOCX tables/images, PPTX shapes,
multiple languages, and intentionally poor scans; report precision/recall or
field-level accuracy per format.
**Dependencies:** 0.1, 2.1, 2.2.
**External gate:** Approve any OCR/model packages, model downloads, or cloud
document-processing services before adoption.
**Files likely touched:** `backend/app/services/pdf_parser.py`,
`backend/app/config.py`, `backend/requirements.txt`, tests, extraction docs
**Estimated scope:** Medium

### [ ] 2.4 Move long ingestion work into observable jobs

**Priority:** P1
**Description:** Keep upload requests responsive while parsing, OCR, indexing,
and embedding larger files.

**Acceptance criteria**
- [ ] Define queued/running/succeeded/partial/failed/cancelled states with
  progress, timestamps, retry limits, and safe idempotency.
- [ ] API returns a job/document status; frontend displays progress, partial
  extraction warnings, retry, and actionable failure details.
- [ ] Worker failure or restart does not lose job state or create duplicate
  document/index records.
- [ ] Select job implementation based on deployment and scale; start with the
  simplest durable option and avoid adding Redis/microservices without
  measured need.

**Verification:** Tests simulate worker crash/retry, duplicate delivery,
partial extraction, cancellation, and status polling.
**Dependencies:** 0.1–0.3, 2.2.
**Files likely touched:** `backend/app/`, `backend/migrations/`,
`frontend/src/components/UploadModal.jsx`, `frontend/src/context/AppContext.jsx`,
tests
**Estimated scope:** Medium

## Phase 3 — Permission-safe content access and RAG foundation

### [ ] 3.1 Separate document metadata from document content

**Priority:** P0 — closes an over-broad data exposure path
**Description:** Stop sending full extracted text in every project document
list response. Fetch content only through explicit, authorized endpoints.

**Acceptance criteria**
- [ ] Document list returns metadata/status only, not full extracted text.
- [ ] Page/block endpoints check ownership or accepted share access and return
  only requested, bounded content.
- [ ] Reader views continue to work through the appropriate authorized content
  routes.
- [ ] Logs, analytics, and errors exclude document text and prompts.

**Verification:** Request-body tests prove metadata responses omit text and
cross-user/unshared content requests fail.
**Dependencies:** 0.2, 0.3, 2.2.
**Files likely touched:** `backend/app/routers/documents.py`,
`backend/app/security.py`, `frontend/src/`, API tests
**Estimated scope:** Medium

### [ ] 3.2 Enforce per-document AI grants and provider consent

**Priority:** P0 — prerequisite for every AI feature
**Description:** Persist explicit, revocable document grants and enforce them
server-side for every AI content retrieval. UI selection alone is not a
security boundary.

**Acceptance criteria**
- [ ] Grant records identify user, document, purpose, creation, expiry/revoke
  state, and applicable processing mode.
- [ ] Every AI request checks current ownership/share permission, active grant,
  requested purpose, and cloud-provider consent where needed.
- [ ] Unselected, unapproved, expired, revoked, or inaccessible documents
  contribute zero text/chunks to retrieval or provider payloads.
- [ ] User can inspect/revoke grants and see the exact scope before sending.

**Verification:** Adversarial API tests cover forged IDs, mixed approved and
unapproved IDs, revoked grants, shared docs, and cross-project leakage; assert
the model/provider payload contains only approved chunks.
**Dependencies:** 0.1–0.3, 3.1.
**Files likely touched:** `backend/app/security.py`, `backend/app/routers/`,
`backend/migrations/`, `frontend/src/components/ChatPanel.jsx`, tests
**Estimated scope:** Medium

### [ ] 3.3 Select embedding and vector-search strategy

**Priority:** P1
**Description:** Choose a retrieval implementation that fits the actual
SQLite-development/PostgreSQL-deployment setup and initial volume.

**Acceptance criteria**
- [ ] Compare existing inverted-index search, PostgreSQL vector extension,
  and local vector-index choices using expected deployment, language, scale,
  privacy, backup, and operating-cost constraints.
- [ ] Choose an embedding model and record license, hardware/runtime needs,
  language coverage, latency, and whether text leaves the device.
- [ ] Define chunk size/overlap by page/structure, embedding versioning,
  rebuild-on-model-change, and deletion/retention behavior.
- [ ] Keep semantic retrieval optional until benchmarks show improvement over
  the existing keyword baseline.

**Verification:** Decision record includes a reproducible retrieval benchmark
on a representative, approved corpus and a rollback path to keyword search.
**Dependencies:** 0.1, 0.2, 2.2.
**External gate:** Model downloads, package installs, hosted embeddings, and
third-party APIs require explicit approval.
**Files likely touched:** `docs/`, `backend/app/services/`, configuration,
benchmark fixtures
**Estimated scope:** Medium

### [ ] 3.4 Implement scoped hybrid retrieval

**Priority:** P1
**Description:** Retrieve source chunks using keyword ranking and, if the
benchmark supports it, semantic similarity; apply authorization before
retrieval and rerank only within that authorized set.

**Acceptance criteria**
- [ ] Retrieval is constrained by user, project/share permission, document
  selection, and active AI grant before content is read.
- [ ] Search combines or compares the existing inverted index with vector
  results; the selected strategy is measurable and configurable only where
  needed.
- [ ] Results retain stable document/page/block citations and avoid returning
  duplicate or unrelated passages.
- [ ] Empty, scanned/unindexed, stale-index, and oversized-scope states are
  explicit and recoverable.

**Verification:** Recall@k/precision@k and permission-isolation tests pass on
the agreed test set; measure retrieval latency separately from generation.
**Dependencies:** 3.1–3.3.
**Files likely touched:** `backend/app/services/indexer.py`,
`backend/app/services/`, `backend/app/routers/search.py`, tests
**Estimated scope:** Medium

### [ ] 3.5 Add grounded answer and citation evaluation

**Priority:** P1
**Description:** Make citations inspectable and measure whether generated
claims are supported by retrieved evidence.

**Acceptance criteria**
- [ ] Every citation points to a real document and page/block and opens the
  exact source location.
- [ ] Model instructions require admitting insufficient evidence; retrieved
  excerpts are treated as untrusted input, not executable instructions.
- [ ] Evaluation separates retrieval relevance, citation correctness,
  faithfulness, unsupported-claim rate, and response latency.
- [ ] No AI result is described as guaranteed correct; provider/model and
  generated-versus-extractive mode are visible.

**Verification:** Automated golden cases include answerable, unanswerable,
conflicting-source, prompt-injection-in-document, and citation-jump cases.
**Dependencies:** 3.2, 3.4.
**Files likely touched:** `backend/app/services/`, `frontend/src/components/`,
`backend/qa_*`, evaluation fixtures
**Estimated scope:** Medium

## Phase 4 — AI Wing, summaries, and study tools

### [ ] 4.1 Add an optional Laya decision adapter

**Priority:** P2 — optional enhancement, not a product dependency
**Description:** Evaluate Laya for fast structured intent/workflow
classification (summary, explain, quiz, flashcards), never for authorization or
long-form generation.

**Acceptance criteria**
- [ ] Laya runs only in an explicitly chosen local/server-owned process and
  is not required for ordinary reading, upload, or login.
- [ ] Its output is typed, bounded, validated, and treated as a suggestion;
  failures fall back to deterministic routing without changing access scope.
- [ ] Benchmark model load time, memory/VRAM, cold/warm latency, and task
  accuracy on Knoprix intents before enabling it by default.
- [ ] A deployed backend does not claim to use the user's laptop hardware
  unless the user explicitly runs and connects a local Knoprix companion.

**Verification:** Unit tests prove malformed/low-confidence decisions cannot
expand document scope; compare with a rules-only baseline.
**Dependencies:** 0.1, 0.2.
**External gate:** Installing Laya/model dependencies or downloading model
weights requires approval.
**Files likely touched:** `backend/app/services/ai/`, configuration,
`docs/`
**Estimated scope:** Medium

### [ ] 4.2 Add a real text-generation adapter and hierarchical summaries

**Priority:** P1
**Description:** Keep the extractive summary as a clearly labeled quick option;
add generated summaries through a separate local or approved BYOK provider.

**Acceptance criteria**
- [ ] User chooses/approves document scope and local-vs-cloud processing
  before the first relevant operation.
- [ ] Long documents are summarized chunk-by-chunk and then composed into a
  document summary with citations back to source pages/blocks.
- [ ] Provider adapters handle streaming, timeout, cancellation, bounded
  retries, rate limits, invalid keys, unavailable models, and empty output.
- [ ] Generated output is distinguished from source quotations and
  deterministic extraction; no silent fallback is labeled as a live summary.

**Verification:** Test short/long documents, no-text/scanned files, provider
errors, cancellation, citation coverage, and latency targets on a fixed corpus.
**Dependencies:** 0.1, 3.2–3.5.
**External gate:** Live provider use requires explicit provider/key/data-transfer
approval; local model downloads require separate approval.
**Files likely touched:** `backend/app/routers/summary.py`,
`backend/app/services/ai/`, `frontend/src/components/ChatPanel.jsx`, tests
**Estimated scope:** Medium

### [ ] 4.3 Build the Reading Desk / AI Wing mode switch

**Priority:** P1
**Description:** Make the two workspaces clear modes over shared selected
document/page state, rather than two disconnected apps.

**Acceptance criteria**
- [ ] Reading Desk preserves reader, page navigation, annotations, bookmarks,
  focus mode, and optional AI panel.
- [ ] AI Wing opens chat-first with visible source scope, conversation list,
  AI tool entry points, and empty/loading/error states.
- [ ] Switching modes preserves active document, page, and approved scope;
  mode switch never silently grants new AI access.
- [ ] Boss approves mode layouts, navigation, controls, mobile behavior,
  colors, typography, and interaction states in `UI-UX.md` before UI build.

**Verification:** End-to-end switch/read/chat/citation-jump flow at 390, 425,
768, and 1024px; keyboard and screen-reader checks.
**Dependencies:** 0.1, 0.2, 3.2; design approval before implementation.
**Files likely touched:** `frontend/src/App.jsx`,
`frontend/src/context/AppContext.jsx`, `frontend/src/components/`,
`UI-UX.md`
**Estimated scope:** Medium

### [ ] 4.4 Persist browser-local conversation history with user controls

**Priority:** P1
**Description:** Persist conversations in browser-local storage only; v1 does
not synchronize conversation content to Knoprix servers.

**Acceptance criteria**
- [ ] User can create, rename, resume, delete one conversation, and delete all
  history in the current browser; local-only retention and no-sync behavior
  are explicit.
- [ ] Browser-local history is isolated by account and hidden on logout/account
  switch.
- [ ] Each conversation stores source IDs and grant context, but a stale
  conversation cannot bypass current authorization or reuse revoked access.
- [ ] Message streaming/cancel/retry states are safe; failed partial responses
  are not stored as successful answers.
- [ ] Secrets and full provider keys are never persisted in conversations or
  logs; source excerpts remain citation-linked.

**Verification:** Tests cover per-account browser-local isolation, deletion,
revoked-source reuse, partial generation, and reload/resume behavior.
**Dependencies:** 0.1, 0.2, 3.2, 4.2.
**Files likely touched:** `frontend/src/components/ChatPanel.jsx`,
frontend conversation storage/context modules, tests
**Estimated scope:** Medium

### [ ] 4.5 Add flashcards, quizzes, and analogies as cited study artifacts

**Priority:** P2
**Description:** Build each study tool as a distinct vertical slice over the
same approved retrieval/generation boundary.

**Acceptance criteria**
- [ ] Flashcards, quizzes, and analogy/story explanations are generated only
  from currently approved source chunks.
- [ ] Each artifact links to source citations and is labeled generated; user
  can edit, regenerate, save, and delete it.
- [ ] Quiz answer/reveal and flashcard interactions work by keyboard and on
  mobile; unsupported/no-evidence cases do not fabricate content.

**Verification:** Per-tool evaluation checks citation coverage, answerability,
empty-source behavior, and responsive interaction.
**Dependencies:** 3.2–3.5, 4.2–4.4.
**Files likely touched:** `backend/app/routers/`, `backend/app/services/ai/`,
`backend/migrations/`, `frontend/src/components/`, tests
**Estimated scope:** Medium

## Phase 5 — Useful, evidence-linked mind map

### [ ] 5.1 Turn the current graph into an actionable evidence mind map

**Priority:** P1
**Description:** Replace the current mostly exploratory circle with a readable
hierarchy: Project → Documents → Topics → supporting pages/evidence.

**Acceptance criteria**
- [ ] Every displayed document/topic can be expanded, filtered, searched, and
  selected; selecting evidence opens the exact document/page.
- [ ] Shared-term edges are labeled as inferred/shared-topic connections, not
  verified semantic or causal relationships.
- [ ] Users can pin/unpin topics and create a study scope from selected nodes
  without granting AI access automatically.
- [ ] Large graphs have readable zoom/pan, keyboard navigation, mobile
  fallback, empty/error/loading states, and bounded rendering.

**Verification:** Fixture tests prove every visible evidence reference resolves
to a real document/page; manual usability check on a small and large workspace.
**Dependencies:** 0.1, 0.2, 3.1.
**UI gate:** Boss approves the map layout and mobile interaction before UI work.
**Files likely touched:** `backend/app/routers/graph.py`,
`frontend/src/components/KnowledgeMap.jsx`, `UI-UX.md`, tests
**Estimated scope:** Medium

### [ ] 5.2 Add stronger semantic links only when evaluated

**Priority:** P2
**Description:** Optionally enrich shared-term links with RAG/embedding-derived
topic similarity, while retaining transparent evidence and provenance.

**Acceptance criteria**
- [ ] Semantic edge shows method, evidence, confidence/threshold, and is
  visually distinguishable from exact shared-term links.
- [ ] User can inspect the passages behind an edge and hide/remove weak links.
- [ ] Semantic graph feature is enabled only if benchmarked relevance improves
  over current shared-term graph without unacceptable latency.

**Verification:** Human-labeled topic-pair evaluation reports precision and
false-link rate; every edge supports evidence inspection.
**Dependencies:** 3.3–3.5, 5.1.
**Files likely touched:** `backend/app/services/`, `backend/app/routers/graph.py`,
`frontend/src/components/KnowledgeMap.jsx`, tests
**Estimated scope:** Medium

## Phase 6 — Optional bookmark/highlight relationship

### [ ] 6.1 Add an explicit optional bookmark-to-highlight link

**Priority:** P1
**Description:** Preserve independent bookmarks and highlights by default;
allow a user to link/unlink them intentionally.

**Acceptance criteria**
- [ ] A bookmark may reference a highlight only when both belong to the same
  authorized user/document/page; page bookmarks may remain unlinked.
- [ ] Deleting/unlinking one record does not silently delete the other.
- [ ] Existing bookmark collection ordering and its Hash Table + Doubly Linked
  List behavior remain intact.
- [ ] API and UI expose link state consistently and prevent cross-user links.

**Verification:** Migration and API tests cover old data, link/unlink, invalid
IDs, deletion on either side, and collection-order regression.
**Dependencies:** 0.2, 0.3.
**Files likely touched:** `backend/migrations/`, `backend/app/routers/bookmarks.py`,
`backend/app/routers/highlights.py`, `frontend/src/components/`, tests
**Estimated scope:** Medium

## Phase 7 — Contacts, Knoprix IDs, and in-app sharing

### [ ] 7.1 Define stable public Knoprix IDs and contact discovery

**Priority:** P1
**Description:** Let users discover contacts by verified email or a separate
random public Knoprix ID; never expose internal database identifiers as the
public identity.

**Acceptance criteria**
- [ ] Public IDs are unique, non-sequential, rate-limited for lookup, and
  distinct from internal primary keys.
- [ ] Privacy settings control discoverability; email lookup does not reveal
  whether an account exists to unauthorized callers.
- [ ] Users can copy/share their ID and change/revoke discoverability safely.

**Verification:** Collision, enumeration, rate-limit, normalization, and
privacy tests.
**Dependencies:** 0.1–0.3, 1.3.
**Files likely touched:** `backend/migrations/`, `backend/app/routers/`,
`backend/app/security.py`, frontend contact surfaces, tests
**Estimated scope:** Medium

### [ ] 7.2 Implement mutual contact requests

**Priority:** P1
**Description:** A share attempt to a non-contact must clearly explain that a
contact is not established and offer a request workflow.

**Acceptance criteria**
- [ ] Contact states cover pending, accepted, declined, blocked, and removed;
  duplicate/concurrent requests behave idempotently.
- [ ] In-app notification tells the requester when the recipient is not an
  accepted contact and offers “Send request” or cancel.
- [ ] Contact acceptance grants no document/project/bookmark access by itself.
- [ ] Block/remove actions prevent new requests and are reflected in both
  users' contact lists.

**Verification:** Two-account end-to-end tests cover send, accept, decline,
duplicate, block, and no-implicit-resource-access.
**Dependencies:** 7.1.
**Files likely touched:** `backend/migrations/`, `backend/app/routers/`,
`frontend/src/components/`, tests
**Estimated scope:** Medium

### [ ] 7.3 Implement per-resource share requests and recipient inbox

**Priority:** P1
**Description:** Share documents, project folders, bookmarks, and optionally
selected evidence into the recipient's Knoprix inbox. Contact status and
resource authorization stay separate.

**Acceptance criteria**
- [ ] Share records identify sender, recipient, resource, allowed actions,
  creation/expiry, recipient decision, and revocation status.
- [ ] Recipients see an in-app pending-share notification and must accept
  before the API grants read access.
- [ ] Every list/read/download route enforces active accepted share permission;
  project-folder shares do not become public links.
- [ ] Sender can revoke; recipient loses access immediately; deleted resources
  resolve safely; multi-recipient sharing tracks each recipient independently.
- [ ] Sharing bookmarks preserves source ownership/attribution and only exposes
  referenced content the recipient is authorized to read.

**Verification:** Cross-account API tests cover pending, accepted, declined,
expired, revoked, deleted resource, multiple recipients, and IDOR attempts.
**Dependencies:** 0.2–0.3, 3.1, 7.2.
**Files likely touched:** `backend/migrations/`, `backend/app/security.py`,
`backend/app/routers/`, `frontend/src/`, tests
**Estimated scope:** Medium

### [ ] 7.4 Add reliable email notifications (not file delivery)

**Priority:** P2
**Description:** Notify users of contact/share requests by email only as an
optional channel; the authoritative request and content stay inside Knoprix.

**Acceptance criteria**
- [ ] Notification email contains minimal information and a safe Knoprix link;
  it does not attach the private document or bypass recipient login/acceptance.
- [ ] Durable outbox records pending/sent/failed attempts with bounded retry
  and deduplication; email failure does not lose in-app state.
- [ ] User can control notification preferences; no Gmail inbox import or
  send-as access is added unless separately approved.
- [ ] Bulk sharing queues per-recipient notifications and isolates failures.

**Verification:** Fake-mailer tests cover retries, duplicate delivery,
recipient preferences, link expiry/login, and provider failure.
**Dependencies:** 0.1–0.3, 7.2–7.3.
**External gate:** Explicit approval and account/configuration for an email
delivery provider before connecting it.
**Files likely touched:** `backend/app/`, `backend/migrations/`,
`backend/app/config.py`, tests, privacy docs
**Estimated scope:** Medium

## Phase 8 — Security, reliability, quality, and release gates

### [ ] 8.1 Establish operational observability and cost/latency budgets

**Priority:** P0 before public beta
**Description:** Measure operational health without collecting secrets,
document contents, or unnecessary personal data.

**Acceptance criteria**
- [ ] Track request/job status, latency buckets, parser/model version, retry
  counts, and provider error classes with content-free telemetry.
- [ ] Define product targets for upload response, extraction completion,
  retrieval, AI first-token/total response, and sharing notification delivery.
- [ ] Add health/readiness checks, structured error IDs, alert thresholds, and
  a support-facing diagnostic path.
- [ ] Identify model/provider costs and free-tier quota behavior before
  enabling paid or externally metered operations.

**Verification:** Simulated provider/storage/worker/database outage produces
observable alerts and user-safe error states without content/key leakage.
**Dependencies:** 0.1, 2.4, 4.2, 7.4.
**Files likely touched:** `backend/app/main.py`, `backend/app/config.py`,
`backend/app/services/`, deployment docs, tests
**Estimated scope:** Medium

### [ ] 8.2 Complete privacy, deletion, backup, and recovery controls

**Priority:** P0 before public beta
**Description:** Make user data lifecycle transparent and recoverable.

**Acceptance criteria**
- [ ] User can export/delete account data according to the approved retention
  policy; deletion covers database rows, object files, derived indexes,
  embeddings, cached artifacts, and queued jobs.
- [ ] Backups are encrypted, access-controlled, scheduled, and restore-tested;
  retention and recovery objectives are documented.
- [ ] Provider keys, OAuth secrets, CAPTCHA secrets, and storage credentials
  are never committed or exposed to the browser/logs.
- [ ] Privacy notice clearly distinguishes local processing, cloud-provider
  transfer, email notification, recipient sharing, and provider retention.

**Verification:** Deletion/export tests reconcile all derived records and
object storage; perform a documented restore drill on a non-production copy.
**Dependencies:** 0.1–0.3, 3.2, 7.3–7.4.
**Files likely touched:** `backend/app/`, `backend/migrations/`, deployment
configuration/docs, privacy docs, tests
**Estimated scope:** Medium

### [ ] 8.3 Build a repeatable test and release pipeline

**Priority:** P0 before public beta
**Description:** Turn the existing QA scripts and production build into
repeatable gates for each feature and release.

**Acceptance criteria**
- [ ] Backend unit/API tests cover auth, ownership, shares, grants, ingestion,
  extraction, RAG, citations, graph, and migrations.
- [ ] Frontend production build and end-to-end tests cover login, upload,
  reader, AI scope, mode switch, citations, graph, sharing, and recovery states.
- [ ] Security tests include IDOR, privilege escalation, rate-limit bypass,
  malformed upload, prompt injection in documents, and revoked access.
- [ ] Browser QA checks 390/425/768/1024px, keyboard use, reduced motion,
  loading/empty/error/success, and no horizontal overflow.
- [ ] Existing 33-point product polish/fix checklist is evaluated; each item is
  completed or marked N/A with a reason and evidence.

**Verification:** One documented command sequence runs required tests/builds;
release checklist links test results and open issues.
**Dependencies:** 1.1–1.4, 2.1–2.4, 3.1–3.5, 4.1–4.5, 5.1, 6.1, 7.1–7.4,
8.1–8.2.
**Files likely touched:** backend/frontend tests, CI workflow, checklists,
`docs/`, `tasks/`
**Estimated scope:** Medium

### [ ] 8.4 Run a closed beta and verify consumer readiness

**Priority:** P0 launch gate
**Description:** Validate the end-to-end product with a small, invited cohort
before public release.

**Acceptance criteria**
- [ ] Beta participants can register/sign in, upload supported files, inspect
  extraction warnings, read, use approved AI scope, and share/accept/revoke
  resources without support intervention for normal flows.
- [ ] Define and review activation, successful extraction, retrieval
  relevance/citation, crash/error, latency, share acceptance, and user
  satisfaction metrics.
- [ ] No unresolved critical/high security issue; data restore and deletion
  drills pass; incident and support procedures exist.
- [ ] Public launch remains blocked until all product, privacy, security, and
  operational gates have an owner and evidence.

**Verification:** Beta report records cohort, metrics, known limitations,
incidents, fixes, and explicit go/no-go decision.
**Dependencies:** 8.1–8.3 and boss approval for deployment/external release.
**Files likely touched:** `docs/`, `checklists/`, `tasks/`
**Estimated scope:** Medium

## Checkpoints

### Checkpoint A — Trust foundation

- [ ] Decisions and contracts approved.
- [ ] Migrations, session hardening, upload validation, metadata/content
  separation, and AI grants pass focused tests.
- [ ] No AI path can read unapproved content.

### Checkpoint B — Evidence-based intelligence

- [ ] Extraction quality is measured on the agreed corpus; limitations are
  visible.
- [ ] Retrieval is permission-filtered and citations resolve to source pages.
- [ ] Summary/chat outputs are correctly labeled and evaluated.

### Checkpoint C — Connected workflows

- [ ] Reading Desk and AI Wing preserve shared state and consent boundaries.
- [ ] Mind map is actionable and evidence-linked.
- [ ] Optional bookmark/highlight links preserve independent records.
- [ ] Contacts, in-app shares, revocation, and notification failure paths pass
  two-account tests.

### Checkpoint D — Consumer beta

- [ ] Security, accessibility, responsive, backup/restore, monitoring, support,
  and 33-point polish/fix gates have evidence.
- [ ] Boss approves the launch decision; deployment/publishing is a separate
  explicit authorization.
