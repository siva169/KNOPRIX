# PRD: Knoprix Final Project

**Type:** College project / document knowledge platform  
**Status:** Draft awaiting UI/UX decisions  
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

### Non-goals for the first rebuild

- No local LLM installation.
- No AI provider key hardcoded in source code.
- No automatic upload of every document to a provider.
- No deployment or remote push without explicit approval.
- No visual implementation before the user approves the UI/UX decisions.

## 3. Approved Architecture

- **Backend:** Existing FastAPI application copied from the current Knoprix
  version.
- **Frontend:** Existing React + Vite application copied as a functional
  baseline, then redesigned through approved UI/UX slices.
- **Persistence:** Existing database layer remains the source of truth.
- **AI providers:** Z.AI GLM and OpenAI-compatible cloud providers.
- **BYOK — Bring Your Own Key:** Users connect their own provider credentials.
- **Encrypted backend storage:** Provider keys are encrypted at rest and
  masked after saving.
- **Model allowlist:** Knoprix displays only models explicitly approved by
  the application configuration.
- **Document scope:** A provider key may be used only for documents the user
  explicitly selects for AI.

## 4. Capability Acceptance Criteria

### Foundation

- The new project starts independently from the old repository.
- The backend and frontend have separate local start commands.
- No uploaded documents, database files, dependency caches, or secrets are
  copied into the new baseline.

### Core backend

- Existing health, authentication, project, document, search, DSA, bookmark,
  and highlight routes remain available.
- Existing bookmark behavior remains Hash Table + Doubly Linked List based.
- Any backend behavior change is proposed and approved separately.

### AI integration — later slice

- A user can add a supported provider key without exposing it to the browser.
- The provider and model are visible before a request is sent.
- The user selects the document scope explicitly.
- The system returns a grounded answer with document citations.
- Provider failure, invalid key, rate limit, and unsupported model errors are
  visible and actionable.

## 5. API Contract Direction

The copied baseline API remains the source contract for the first rebuild.
New AI routes will be added only after their security design is approved:

```text
GET    /api/health
GET    /api/ai/providers
POST   /api/ai/provider-keys
DELETE /api/ai/provider-keys/{key_id}
POST   /api/projects/{project_id}/ai/conversations
POST   /api/projects/{project_id}/ai/conversations/{conversation_id}/messages
```

The exact request and response schemas will be written in the AI module
specification before implementation.

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

## 9. Success Criteria

- The copied backend starts locally and its health endpoint responds.
- The frontend starts locally and builds successfully.
- The UI/UX inventory is approved surface by surface.
- Each feature is delivered as a verified vertical slice with a local commit.
- AI document chat is optional, provider-controlled, citation-aware, and
  unavailable rather than misleading when configuration is missing.

## 10. Polish and Fixes

The project follows the complete checklist at:
`checklists/033-vibecoding-complete-33-checklist.md`.

Progress is intentionally `0/33` until each item is evaluated against the new
interface and either implemented or marked `N/A` with a reason.
