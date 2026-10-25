# BYOK Provider Security Contract — Knoprix Final Project

**Status:** Approved contract for general, source-aware chat and account-synced
history. Existing chat currently has Retrieval and consented extracted-text
modes; implementation of the unified contract is pending. Full-document
uploads are retired. Legacy provider-copy cleanup remains.
**Decisions (2026-10-04; NVIDIA relay approved 2026-10-17):** user-supplied
trial/free-tier providers plus one deployment-managed NVIDIA key
· selected documents only · Knoprix backend processing and third-party AI
transfer are separate consent boundaries.
**Scope:** This contract covers general/source-aware chat, synced conversation
history, legacy provider-copy cleanup, and AI study tools. The frontend stores user-supplied provider keys in browser
localStorage and sends them in request headers to Knoprix for provider
operations. Keys are used only in request memory. NVIDIA calls use the
server-managed key. Do not treat this backend slice as proof that all consent
controls are implemented in the UI.

## 1. Assumptions (explicit)

- A1. Users bring their own keys for BYOK providers. NVIDIA's key is supplied
  privately by the deployment operator, not shipped in source code.
- A2. Browsers are untrusted-shared environments (extensions CAN read
  localStorage) — keys are convenience-stored, not vault-stored. Stated
  openly in the privacy notice, not hidden.
- A3. Free-tier provider terms change fast. The allowlist is re-verified
  at implementation time and every release — a stale free endpoint MUST be
  removed, never grandfathered.
- A4. The backend may use the NVIDIA environment key, but MUST NOT log, return,
  persist, or accept a client-supplied NVIDIA key.
- A5. Current deployment direction is Render + Vercel + Supabase. "Knoprix
  processing" means the service's controlled backend/storage, not processing
  on the user's device.
- A6. User content remains until the user deletes it. Encrypted backups may
  retain deleted data for up to 30 days before purge.

## 2. Out of scope (not promised)

- Paid provider plans, key-vault features, and on-device LLM execution in the
  initial release. The shared NVIDIA key may incur usage charges.
- Protection against malicious browser extensions (impossible client-side).
- Provider-side data retention (governed by each provider's own policy —
  linked in the privacy notice, not ours to enforce).

## 3. Data classes + handling

| Class | Examples | Handling |
|---|---|---|
| Provider keys | User BYOK keys; shared NVIDIA API key | BYOK keys are browser-local and sent in request headers to backend-routed provider operations; only volatile request memory is allowed. NVIDIA key MUST be configured only in the deployment secret environment. No raw key may be logged, returned, or persisted. |
| Knoprix document processing | Uploaded source files, extracted text, indexes | Stored/processed by Knoprix-controlled backend and storage after upload; disclose this at upload. Derived records must be deleted with their source, subject to the documented backup purge window. |
| AI access grant | User, document, purpose, state, expiry/revocation | MUST be checked for every AI content read. A frontend checkbox alone is not authorization. |
| Third-party AI content | Current question, answer, relevant passages, relevant saved-chat messages, provider web-search request/results | Document context requires an active grant and per-request provider/model/document confirmation. Saved-chat context is limited to relevant messages from the authenticated user's own conversations and must be disclosed when included. Original files, visual content, whole-project dumps, and other users' chats are forbidden. |
| Chat history | User/assistant messages and citations | Stored server-side under the authenticated account for sync. Every read/write/delete is owner-scoped; conversation/account deletion cascades. Provider keys, system instructions, full prompts in logs, and retrieved passages as separate records are forbidden. |
| Diagnostics | Error codes, latency, model name | CAN go to backend logs. MUST NEVER include keys or doc text. |

## 4. Trust boundaries + controls

1. **Browser → Knoprix backend:** document upload implies storage and routine
   parsing/indexing by Knoprix services, which must be disclosed. Any AI
   operation must separately have an active per-document grant. The backend
   must authorize content reads before returning chunks.
2. **Browser → Knoprix → Provider (BYOK):** for backend-routed chat, the
   browser sends the selected provider key in a request header. Knoprix uses
   it only in volatile request memory and MUST NOT log or persist the raw key.
   Before each request that includes document text, the UI MUST show the
   provider, model, and authorized document names and ask for confirmation.
   It MUST disclose if relevant saved-chat messages are also included. Only
   bounded extracted text and relevant owner-authored chat messages may be
   included; original files and visual content are excluded. The provider
   decides whether to use its documented native web-search capability; usage
   may incur provider charges. The old provider-copy cleanup routes may use a
   key to delete a previously uploaded copy.
3. **Browser → Backend chat metadata:** backend may validate provider/model,
   authorization, scope, and retrieve citation metadata, but MUST reject
   key-like request fields (fail closed: `400 + "keys stay in browser"`).
4. **Backend → NVIDIA:** the backend may use `NVIDIA_API_KEY` from its private
   environment for chat. Document chat sends only extracted text, not rendered
   pages or image batches. The key MUST never be returned or logged. No
   client-supplied NVIDIA key may be accepted.

## 4a. Unified chat and legacy provider-copy cleanup

- `/api/chat/ask` and `/api/chat/stream` provide one general chat. The
  Retrieval/Document text mode selector is removed; passage retrieval remains
  an internal context-gathering mechanism. General questions are not refused
  just because no document passage matches.
- The server may include bounded, relevant passages only from active-project
  documents with active grants and bounded, relevant messages only from the
  authenticated user's saved conversations. It does not send whole projects
  or whole account histories. Retrieved content is untrusted evidence, never
  instructions.
- The UI discloses provider/model and any included document or saved-chat
  context before sending. Document context requires per-request confirmation;
  cancel sends nothing. This is separate from the persistent Knoprix document
  grant.
- Only provider/model combinations verified against official provider
  documentation receive a native web-search tool. The provider/model chooses
  when to search. Unsupported models remain usable and clearly show that live
  search is unavailable; no separate search service is used.
- Provider safety safeguards, provider/model allowlists, grant checks, and key
  handling remain enabled. “No restrictions” means removing Knoprix's
  document-only answer limitation, not disabling provider safeguards.
- New provider-file uploads and full-document visual chat are removed.
  Existing provider file mappings remain available through
  `GET /api/projects/{projectId}/provider-documents` for status and cleanup.
  `DELETE /api/documents/{documentId}/provider-authorization` blocks local use
  and attempts provider deletion; `POST /api/provider-files/{documentId}/retry-delete`
  retries pending deletion. Neither route creates a provider copy.
- Raw keys are not stored. Existing keyed fingerprints and remote file IDs
  remain only to manage prior uploads and are never returned to clients.

## 5. Auth / session policy

- App login is distinct from document access and AI consent.
- BYOK provider identity uses the user's own key, entered per provider. NVIDIA
  uses one shared deployment account and is not individually attributable.
- `localStorage` is convenience storage, not a secure vault. Browser extensions
  or anyone with access to the browser profile may read it; state this clearly.
  BYOK keys are sent to Knoprix request handlers for backend-routed streaming
  and cleanup of old provider files, not directly from the browser to providers.

## 6. Provider allowlist policy

- MUST: current backend publishes `GET /api/providers/allowlist`; the v1
  contract publishes `GET /api/v1/providers/allowlist` (name, base URL,
  free-tier note, and models). Client MUST refuse any provider/model not on
  the server allowlist.
- MUST: server re-validates `model` on every chat-related call (client
  enforcement alone is decoration).
- Provider/model availability and pricing must be verified against official
  provider docs; clearly disclose when usage may consume credits or incur
  charges. Free tiers, trials, terms, and limits change; do not promise
  unlimited or permanently free access.
- Sarvam AI is available with `sarvam-105b-conversations` through its V1 Chat
  Completion endpoint. Users can provide their own key; deployments may
  optionally configure `SARVAM_API_KEY` as a shared backend key. Sarvam usage
  may consume account credits or incur charges.
- NVIDIA uses `NVIDIA_API_KEY` configured privately in the backend environment.
  The browser MUST NOT send a key in headers or body and MUST NOT call NVIDIA
  directly. The allowlist reports only whether the server key exists; the UI
  MUST disable NVIDIA when the key is absent.
- NVIDIA chat and study artifacts MUST use Knoprix backend routes. The backend
  re-validates the provider/model and document grants, retrieves only
  authorized passages, and normalizes artifact citations before persistence.
- NVIDIA's key is shared across users of a deployment; operators MUST consider
  quota and billing exposure. NVIDIA terms and limits can change; do not promise
  unlimited or permanently free access.
- SHOULD: per-day app-side call budget per provider (protects the user's
  quota from runaway loops — agents retry, quotas don't).

## 7. Logging / audit policy

- MUST NOT log: keys, doc text, full prompts.
- MUST log: model name, error code class, latency bucket, timestamp.
- SHOULD: client-side "last 20 calls" panel (model, ms, status) for the
  user's own debugging — browser-local, deletable.

## 8. Retention / deletion

- BYOK keys: deleted by the user via "Clear keys" (wipes localStorage entries).
  Obsolete browser-saved NVIDIA keys can be removed from the NVIDIA provider
  panel. The deployment operator manages `NVIDIA_API_KEY` in the hosting
  provider's secret settings and must rotate/revoke it there.
- Chat history: retained server-side until the user deletes a conversation or
  account. Conversation deletion cascades to messages/citations; account
  deletion cascades to all conversations. No provider keys or retrieved
  passage records are stored in chat history.
- Documents and derived data: retained until user deletion; deleting a source
  must delete its extracted blocks, indexes, embeddings, summaries, and other
  derived content.
- Backups: encrypted backups may retain deleted data for up to 30 days before
  purge; this window must be disclosed and purge behavior tested.
- Backend: retains no raw provider key material. It retains keyed fingerprints
  and remote file identifiers only for legacy provider copies; revoke/retry
  deletion remains available and new chat requests create no provider files.

## 9. Provider errors (contract)

| Provider says | App MUST |
|---|---|
| 401/403 (bad key/quota dead) | Show "key or free quota" notice, link provider key page, NEVER retry silently. |
| 429 (rate limit) | Back off (retry ≤2 with delay), then tell user the free-limit state. |
| 5xx | One retry, then clean "provider is down" state. No key re-send tricks. |
| Unknown model | Block before send ("not on allowlist"). |

## 10. Privacy notice (shown BEFORE first key entry — exact promises)

> Your provider key is stored in this browser and sent in a request header to
> Knoprix when a provider operation is made. Knoprix uses it only in memory and
> does not store or log the raw key. If you approve document context, only
> relevant extracted text from documents with an active Knoprix AI grant is
> sent to the named provider. Relevant messages from your own saved chats may
> also be included and will be disclosed before sending. Original files and
> visual content are not sent. The selected provider may use its native web
> search and apply its own usage charges and data policies. Clear
> browser-stored keys anytime in Settings.

## 11. Incident mini-runbook

1. Suspected key leak (key appears in a log/report): rotate the key at the
   provider FIRST, then find the logging path and remove it.
2. Provider breach news: push allowlist update removing that provider until
   reviewed; notice in-app.
3. Malicious/broken model output with citations: treat as untrusted text
   (citations are pointers, not proof) — surface, don't auto-act.

## 12. Security gates (go / no-go for the chat slice)

- [ ] No key string in backend logs (log-scan test passes).
- [ ] Backend rejects key-like fields with 400.
- [ ] Non-allowlisted model blocked client AND server side.
- [ ] Documents without an active AI grant are never sent to a provider.
- [ ] Privacy notice shown before first key entry.
- [ ] "Clear keys" wipes all stored key material (verified in browser).
- [ ] Free-tier candidates re-verified at build time (each link checked).
- [ ] Per-document AI grants are enforced by the backend on every content
  retrieval.
- [ ] Third-party provider consent is separate from Knoprix backend processing
  and names the provider/model on every extracted-text request.
- [ ] User deletion removes live source and derived data; backup purge is
  completed within the documented 30-day window.
