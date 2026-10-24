# Capability Map: Knoprix AI Wing Chat

| Module | Responsibility | Depends on |
|---|---|---|
| `synced-chat-history` | Account-scoped conversation storage and CRUD, with the approved Recent Chats dialog. | Existing identity/authentication |
| `source-aware-chat` | General AI chat that can use relevant granted-document passages and the user's relevant saved-chat messages; the selected provider decides whether to use its native web search when supported. | Existing auth, document grants, provider adapters; `synced-chat-history` |

Build order: `synced-chat-history` → `source-aware-chat`.

## Approved product decisions

- Remove the Retrieval/Document text mode selector. Keep passage retrieval as an internal way to gather relevant authorized-document evidence.
- Answer general questions from the selected model; do not refuse solely because a question is outside the documents.
- Automatically expose native provider web search where officially supported, allowing that model/API to decide when to search. Do not add a separate search vendor.
- Keep models without native web search usable for general chat and document context, and clearly indicate that live web search is unavailable for the selected model.
- Use only the signed-in user's own saved chats as possible context.
- Store conversations server-side for account sync. Recent Chats is a searchable dialog, searches titles only, shows title and updated date, and supports new/open/rename/confirmed delete.
- Recent Chats reuses the existing AI Wing dark/gold tokens and modal styling;
  it is full-width on mobile and centered on larger screens.
- Preserve document grants, provider/key allowlisting, and provider safeguards. “No restrictions” means no document-only answer restriction; it does not disable provider safety safeguards.

## Boundaries

- Document context is limited to active-project documents with active AI grants.
- Chat context is limited to relevant messages from the signed-in user's saved conversations; do not send every conversation wholesale.
- Persist conversation messages and citations, not provider keys or retrieved document passages as separate chat records.
- Provider calls may send the current question and selected context to that provider; native web-search usage is governed by that provider's API and billing terms.
- Current verified native search support is Gemini 2.5 Flash and Gemini 2.5 Flash-Lite through the Google Interactions API; those requests set `store: false`. Search answers are buffered so provider citations are preserved before Knoprix sends answer chunks to the client.
- No live provider requests, deployment, or remote Git operation are part of local implementation verification.
