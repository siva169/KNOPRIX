# BYOK Provider Security Contract — Knoprix Final Project

**Status:** Approved policy. Chat and study-artifact routes enforce persisted
per-document grants. The backend full-document transfer routes are implemented;
provider-consent UI and live-provider verification remain pending.
**Decisions (2026-10-04; NVIDIA relay approved 2026-10-17):** user-supplied
trial/free-tier providers plus one deployment-managed NVIDIA key
· selected documents only · Knoprix backend processing and third-party AI
transfer are separate consent boundaries.
**Scope:** This contract covers document chat, full-document transfers, and AI
study tools. The frontend stores user-supplied provider keys in browser
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
| Third-party AI content | Selected PDF files/pages, question, answer | Requires a separate provider/model-specific opt-in and active document grant. MUST contain selected, authorized documents only; MUST NEVER include whole-project or unselected docs. |
| Chat history | Past Q/A pairs | MUST remain browser-local in v1. CAN export/delete by user action; MUST NOT sync to Knoprix servers under the approved v1 policy. |
| Diagnostics | Error codes, latency, model name | CAN go to backend logs. MUST NEVER include keys or doc text. |

## 4. Trust boundaries + controls

1. **Browser → Knoprix backend:** document upload implies storage and routine
   parsing/indexing by Knoprix services, which must be disclosed. Any AI
   operation must separately have an active per-document grant. The backend
   must authorize content reads before returning chunks.
2. **Browser → Knoprix → Provider (BYOK):** for backend-routed chat and
   full-document file operations, the browser sends the selected provider key
   in a request header. Knoprix uses it only in volatile request memory and
   MUST NOT log or persist the raw key. The UI MUST describe that path and ask
   for separate consent naming the provider and model before document content
   is uploaded or sent.
3. **Browser → Backend chat metadata:** backend may validate provider/model,
   authorization, scope, and retrieve citation metadata, but MUST reject
   key-like request fields (fail closed: `400 + "keys stay in browser"`).
4. **Backend → NVIDIA:** the backend may use `NVIDIA_API_KEY` from its private
   environment. Full-document chat renders all selected pages and sends visual
   batches of four pages, then synthesizes the answer from the page evidence.
   The key MUST never be returned or logged. No client-supplied NVIDIA key may
   be accepted.

## 4a. Full-document transfer and chat

- `POST /api/documents/{documentId}/provider-authorization` requires
  `{"providerId":"...","model":"...","confirmed":true}`, an active Knoprix AI
  grant, an allowlisted visual-capable model, ownership, and a provider key
  (except NVIDIA, which uses the server key). A confirmation is not inferred
  from the internal AI grant.
- PDFs are sent as ordered 20-page PDF parts, each limited to 50 MB.
  PPTX/DOCX/TXT/MD/images/SVG are converted to PDF first. Conversion preserves
  rendered content but cannot promise perfect fidelity for every source file.
- OpenAI and Anthropic file references are reused. Gemini files are refreshed
  automatically after their 48-hour expiry. NVIDIA has no reusable remote
  upload: each question renders and sends every selected page in four-page
  image batches and synthesizes the result across batches.
- `/api/chat/ask` and `/api/chat/stream` accept optional `mode`. The default
  remains `retrieval`; `full-document` requires a ready provider/model/key-
  scoped file mapping for every selected document and never falls back to RAG.
- `GET /api/projects/{projectId}/provider-documents` returns `ready`, `failed`,
  `revoked`, and `delete_pending` statuses without exposing remote IDs or
  credential fingerprints. Revoke blocks local use
  immediately; failed provider deletion is retained as `delete_pending` for
  retry with the same provider key. Gemini expiry/re-upload and provider-side
  retention remain subject to the provider's own policy.
- Raw keys are not stored. A keyed HMAC fingerprint scopes reusable provider
  file references to the provider account/key; provider file IDs and URIs are
  stored server-side and never returned to clients.

## 5. Auth / session policy

- App login is distinct from document access and AI consent.
- BYOK provider identity uses the user's own key, entered per provider. NVIDIA
  uses one shared deployment account and is not individually attributable.
- `localStorage` is convenience storage, not a secure vault. Browser extensions
  or anyone with access to the browser profile may read it; state this clearly.
  BYOK keys are sent to Knoprix request handlers for backend-routed provider
  file operations and streaming, not directly from the browser to providers.

## 6. Allowlist policy (FREE only)

- MUST: current backend publishes `GET /api/providers/allowlist`; the v1
  contract publishes `GET /api/v1/providers/allowlist` (name, base URL,
  free-tier note, and models). Client MUST refuse any provider/model not on
  the server allowlist.
- MUST: server re-validates `model` on every chat-related call (client
  enforcement alone is decoration).
- Initial candidates (VERIFY each at implementation — free tiers move):
  free-tier endpoints of Gemini, Groq, OpenAI-compatible `:free` models via
  OpenRouter, Z.AI GLM free tier, and NVIDIA NIM hosted trial endpoints. NVIDIA
  API terms, model availability, and usage limits can change; do not promise
  unlimited or permanently free access.
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
  free quota from runaway loops — agents retry, quotas don't).

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
- Chat history: browser-local only in v1; user-deletable per chat + "delete
  all". The API/data/permission contract defines the local conversation shape.
- Documents and derived data: retained until user deletion; deleting a source
  must delete its extracted blocks, indexes, embeddings, summaries, and other
  derived content.
- Backups: encrypted backups may retain deleted data for up to 30 days before
  purge; this window must be disclosed and purge behavior tested.
- Backend: retains no raw provider key material. It stores a keyed credential
  fingerprint plus remote file identifiers for provider lifecycle management;
  provider file deletion is available through revoke/retry routes.

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
> does not store or log the raw key. Selected documents are sent to the named
> provider only after separate provider/model consent and an active Knoprix
> document grant. Providers apply their own data policies (linked below).
> Clear browser-stored keys anytime in Settings.

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
- [ ] Unselected documents are never uploaded or sent to a provider.
- [ ] Privacy notice shown before first key entry.
- [ ] "Clear keys" wipes all stored key material (verified in browser).
- [ ] Free-tier candidates re-verified at build time (each link checked).
- [ ] Per-document AI grants are enforced by the backend on every content
  retrieval.
- [ ] Third-party provider consent is separate from Knoprix backend processing
  and is provider/model-specific.
- [ ] User deletion removes live source and derived data; backup purge is
  completed within the documented 30-day window.
