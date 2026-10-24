# Spec: Source-Aware AI Wing Chat

## Objective

Replace the Retrieval/Document text mode choice with one general chat. The
selected AI can answer from its general knowledge and, when relevant, use
authorized-document passages and relevant messages from the signed-in user's
saved chats. When the selected provider/model supports native web search, the
provider decides whether a query needs live web results.

### Acceptance criteria

- A question unrelated to the authorized documents still receives a normal
  model answer; the app does not require a matching passage or say it can only
  answer from documents.
- When relevant, only passages from active-grant documents in the active
  project and relevant messages from the same account's saved chats are
  supplied as context.
- Native web search is offered only for provider/model combinations verified
  against official provider documentation. The model/API decides whether to
  search; no separate search API/vendor is added.
- If the selected provider/model lacks native search, general chat and
  document-context chat still work and the UI clearly indicates that live web
  search is unavailable.
- Document citations retain their Reading Desk navigation. Web citations are
  visible, clickable, and validated before rendering.
- The app's document-only restriction is removed; provider safety safeguards
  remain in force.

## Assumptions

- The user has approved account-scoped saved-chat context and the provider-native
  search behavior documented in `AI-CHAT-CAPABILITY-MAP.md`.
- Document scope remains the active project's documents with active grants,
  matching the existing AI Wing.
- Relevant passages and chat messages are selected server-side with bounded
  retrieval; the provider may use or ignore those candidates when answering.
- Existing provider/model and per-send disclosure for external document
  context remain. The disclosure must also identify saved-chat context if any
  is sent to the provider.
- Provider search calls may incur provider-defined usage charges. No live call
  will be used to validate the implementation.

## API and provider contract

- Remove the public chat `mode` choice; the one chat endpoint accepts a
  general question and optional conversation ID. An empty document list is
  valid for general chat.
- Server validates provider/model allowlisting, account ownership, active
  document grants, and conversation ownership before reading any context.
- Gather a small, bounded set of relevant passages and prior messages; no
  whole-project or whole-account dump. The model receives a normal assistant
  instruction, optional evidence, and the current user query. It must not be
  instructed to reject questions merely because evidence is absent.
- Pass native search tools only to compatible provider APIs/models. Preserve
  streamed text and extract provider citation metadata where the documented
  response format supports it. Google Search is currently enabled only for
  Gemini 2.5 Flash and Gemini 2.5 Flash-Lite through the Interactions API;
  requests set `store: false`. Its non-streaming response is buffered before
  Knoprix emits SSE text chunks so documented web citations can be saved.
  Other models retain provider-token streaming.
- Persist user/assistant messages and citations in the conversation contract;
  never persist keys or log provider prompts, retrieved passages, or credentials.
- Keep legacy provider-copy cleanup and study-artifact behavior unchanged.

## Tech stack and structure

- FastAPI/Python provider adapters using the standard library, as in the
  existing backend; no new provider or search dependency.
- React 18.3, Vite 8, Axios, and current AI Wing components/styles.
- Backend: `backend/app/routers/chat.py`, `backend/app/services/rag.py`, and
  provider adapter tests.
- Frontend: `frontend/src/components/AIWingView.jsx`, recent-chat dialog, and
  existing citation rendering.

## Code style

- Keep provider-specific request and response parsing at the adapter boundary;
  do not leak provider payloads into the UI contract.
- Treat retrieved document/chat text and provider results as untrusted content.
- Keep citations as typed-by-shape data separate from answer text; allow only
  safe `https:` links for web sources.
- Reuse existing document grant checks, SSE event framing, and citation
  navigation.

## Testing strategy

- Unit/QA tests: general questions work with no documents; relevant authorized
  excerpts are used; unauthorized documents and foreign conversations are
  never read; unsupported models do not receive search tools.
- Provider tests use mocked HTTP responses and cover tool requests, streaming,
  provider errors, and citations. No real provider request is made.
- Frontend browser QA covers the unified chat, source disclosure, web citations,
  and Recent Chats integration at 390, 425, 768, and 1024 px.
- Run backend focused QA and full QA suite, frontend production build, and
  available mocked browser QA.

## Verified provider support

- Google documents Google Search grounding for Gemini 2.5 Flash and
  Gemini 2.5 Flash-Lite, including `google_search_call` steps and
  `url_citation` annotations:
  <https://ai.google.dev/gemini-api/docs/google-search>.
- The Interactions API supports `store: false` and the `system_instruction`
  and `tools` request fields:
  <https://ai.google.dev/gemini-api/docs/interactions-overview>.
- Search grounding may incur provider-defined usage charges. No live provider
  request is used by implementation QA.

## Boundaries

- Always: enforce active grants server-side, limit included context, preserve
  provider allowlists, surface provider errors, and keep provider safety
  safeguards.
- Ask first: adding a separate search vendor/API, changing provider billing,
  or sending unselected documents or chats.
- Never: disable safety safeguards, fetch arbitrary URLs server-side, broaden
  document access beyond active grants, or claim online search works for an
  unsupported model.

## Success criteria

- The user sees one chat mode and can ask both document-related and general
  questions.
- Responses can combine general model knowledge with authorized evidence and
  relevant past chats; source citations remain distinguishable.
- Supported provider APIs decide whether to search; unsupported models remain
  usable with an explicit no-live-search status.
- No test performs a live provider/web-search request.

## Open questions

- Remaining Recent Chats and citation presentation choices must be confirmed
  before frontend implementation.
- Verify more provider/model pairs against official documentation before
  enabling their native search tools.
