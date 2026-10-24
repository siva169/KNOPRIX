# Spec: Synced AI Chat History

## Objective

Let an authenticated Knoprix user create, reopen, search, rename, and delete
AI conversations, with history available across devices through the Knoprix
account.

### Acceptance criteria

- Recent Chats opens as a dialog; selecting a row closes it and opens that chat.
- The dialog supports New Chat, title-only search, rename, and delete with a
  confirmation step. Rows show title and last-updated date.
- Approved visual direction: reuse the existing AI Wing dark/gold tokens and
  modal styling; full-width on mobile and centered on larger screens.
- Conversations and messages are isolated by authenticated user on every API
  operation. Deleting a conversation removes its messages.
- Messages and citations are stored for reopening; provider keys and retrieved
  document excerpts are never stored as separate records.

## Assumptions

- A new conversation starts with the title `New chat`; the user can rename it.
- Conversation history is retained until the user deletes it or deletes their
  account, consistent with the existing user-content retention policy.
- Existing chat history is in component memory, not a server history service;
  there is no prior server history to migrate.

## API contract

- `GET /api/chat/conversations?search=<title>&limit=<n>&offset=<n>` returns
  the authenticated user's paginated conversation list, newest updated first.
- `POST /api/chat/conversations` creates and returns a conversation.
- `GET /api/chat/conversations/{id}` returns that user's messages and citations.
- `PATCH /api/chat/conversations/{id}` accepts a validated title and returns
  the updated conversation.
- `DELETE /api/chat/conversations/{id}` deletes that user's conversation and
  its messages; unknown or other-user IDs return not found.
- The streaming chat request identifies its conversation; completed user and
  assistant messages are persisted with stable ordering.
- Titles are trimmed, non-empty, and length-limited. Unknown request fields are
  rejected where the existing API conventions support strict validation.

## Tech stack and structure

- FastAPI with the existing SQLite/PostgreSQL compatibility layer and
  append-only startup migrations.
- React 18.3, Vite 8, Axios, and existing Tailwind styling; no new dependency.
- Backend: `backend/app/database.py`, the chat router, and focused
  `backend/qa_*.py` tests.
- Frontend: `frontend/src/components/AIWingView.jsx` and a focused dialog
  component if needed.

## Code style

- Use parameterized SQL and authenticated ownership checks in the same
  database operation/path that reads or mutates a conversation.
- Keep API fields camelCase and database fields snake_case.
- Reuse the existing API client, auth helper, notification pattern, and
  AI-Wing visual tokens.

## Testing strategy

- Add migration and API QA for create/list/search/get/rename/delete, empty and
  invalid titles, pagination, and cross-account isolation.
- Verify chat messages and citations reload in order and deletion cascades.
- Run focused backend QA, then the backend QA suite; run the frontend build and
  mocked browser QA at 390, 425, 768, and 1024 px.

## Boundaries

- Always: enforce account ownership, parameterize SQL, show loading/empty/error
  states, and require confirmation before deletion.
- Ask first: changing chat retention, syncing chats to a different service, or
  adding a dependency.
- Never: store provider keys, expose another user's conversations, or log
  document text or credentials.

## Success criteria

- All CRUD operations work for the owner and do not expose another account's
  data.
- A conversation survives navigation/reload and can be reopened.
- The Recent Chats dialog matches the approved title/date/list/search behavior
  and works by keyboard and at the required mobile breakpoints.

## Open questions

- None from the approved requirements. The exact page size and title length are
  implementation details and will be documented in the API contract.
