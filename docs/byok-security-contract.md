# BYOK Provider Security Contract — Knoprix Final Project

**Status:** Approved policy; implementation is partial and does not yet enforce
persisted per-document AI grants.
**Decisions (2026-10-04):** free-tier providers only · keys browser-local only
· selected documents only · Knoprix backend processing and third-party AI
transfer are separate consent boundaries.
**Scope:** This contract covers document chat and future AI study tools. The
current frontend stores keys in browser localStorage and calls some providers
directly; the backend returns mocked citation-based chat data. Do not treat
this partial implementation as proof that all consent and grant checks exist.

## 1. Assumptions (explicit)

- A1. The user brings their OWN free-tier key (BYOK). Knoprix ships NO key.
- A2. Browsers are untrusted-shared environments (extensions CAN read
  localStorage) — keys are convenience-stored, not vault-stored. Stated
  openly in the privacy notice, not hidden.
- A3. Free-tier provider terms change fast. The allowlist is re-verified
  at implementation time and every release — a stale free endpoint MUST be
  removed, never grandfathered.
- A4. Backend NEVER needs the provider key. Any backend code path that receives,
  logs, or stores a key is a DEFECT, not a feature.
- A5. Current deployment direction is Render + Vercel + Supabase. "Knoprix
  processing" means the service's controlled backend/storage, not processing
  on the user's device.
- A6. User content remains until the user deletes it. Encrypted backups may
  retain deleted data for up to 30 days before purge.

## 2. Out of scope (not promised)

- Paid providers, team/shared keys, server-side key vaults, and on-device LLM
  execution in the initial release.
- Protection against malicious browser extensions (impossible client-side).
- Provider-side data retention (governed by each provider's own policy —
  linked in the privacy notice, not ours to enforce).

## 3. Data classes + handling

| Class | Examples | Handling |
|---|---|---|
| Provider keys | API keys/tokens | MUST live in browser localStorage ONLY. MUST NEVER be sent to backend, written to logs, or included in error reports. |
| Knoprix document processing | Uploaded source files, extracted text, indexes | Stored/processed by Knoprix-controlled backend and storage after upload; disclose this at upload. Derived records must be deleted with their source, subject to the documented backup purge window. |
| AI access grant | User, document, purpose, state, expiry/revocation | MUST be checked for every AI content read. A frontend checkbox alone is not authorization. |
| Third-party AI content | Selected document chunks, question, answer | Requires a separate provider/model-specific opt-in and active document grant. MUST contain selected, authorized documents only; MUST NEVER include whole-project or unselected docs. |
| Chat history | Past Q/A pairs | MUST remain browser-local in v1. CAN export/delete by user action; MUST NOT sync to Knoprix servers under the approved v1 policy. |
| Diagnostics | Error codes, latency, model name | CAN go to backend logs. MUST NEVER include keys or doc text. |

## 4. Trust boundaries + controls

1. **Browser → Knoprix backend:** document upload implies storage and routine
   parsing/indexing by Knoprix services, which must be disclosed. Any AI
   operation must separately have an active per-document grant. The backend
   must authorize content reads before returning chunks.
2. **Browser → Provider (direct BYOK):** only after the user selects the
   documents and separately consents to sending their content to the named
   provider/model. The browser sends the user's key directly to that provider;
   the Knoprix backend MUST NOT proxy or receive the key.
3. **Browser → Backend chat metadata:** backend may validate provider/model,
   authorization, scope, and retrieve citation metadata, but MUST reject
   key-like request fields (fail closed: `400 + "keys stay in browser"`).
4. **Backend → Provider:** no key-bearing provider calls are permitted under
   this contract. Build-time checks and examples MUST use placeholder keys.

## 5. Auth / session policy

- App login is distinct from document access and AI consent.
- Provider identity = the user's own key, entered once per provider, stored
  browser-local. No Knoprix account linkage to provider identity.
- `localStorage` is convenience storage, not a secure vault. Browser extensions
  or anyone with access to the browser profile may read it; state this clearly.

## 6. Allowlist policy (FREE only)

- MUST: current backend publishes `GET /api/providers/allowlist`; the v1
  contract publishes `GET /api/v1/providers/allowlist` (name, base URL,
  free-tier note, and models). Client MUST refuse any provider/model not on
  the server allowlist.
- MUST: server re-validates `model` on every chat-related call (client
  enforcement alone is decoration).
- Initial candidates (VERIFY each at implementation — free tiers move):
  free-tier endpoints of Gemini, Groq, OpenAI-compatible `:free` models via
  OpenRouter, Z.AI GLM free tier.
- SHOULD: per-day app-side call budget per provider (protects the user's
  free quota from runaway loops — agents retry, quotas don't).

## 7. Logging / audit policy

- MUST NOT log: keys, doc text, full prompts.
- MUST log: model name, error code class, latency bucket, timestamp.
- SHOULD: client-side "last 20 calls" panel (model, ms, status) for the
  user's own debugging — browser-local, deletable.

## 8. Retention / deletion

- Keys: deleted by the user via "Clear keys" (wipes localStorage entries).
  Uninstalling/clearing site data removes them implicitly — stated in notice.
- Chat history: browser-local only in v1; user-deletable per chat + "delete
  all". The API/data/permission contract defines the local conversation shape.
- Documents and derived data: retained until user deletion; deleting a source
  must delete its extracted blocks, indexes, embeddings, summaries, and other
  derived content.
- Backups: encrypted backups may retain deleted data for up to 30 days before
  purge; this window must be disclosed and purge behavior tested.
- Backend: retains NO provider key material by design; nothing to delete.

## 9. Provider errors (contract)

| Provider says | App MUST |
|---|---|
| 401/403 (bad key/quota dead) | Show "key or free quota" notice, link provider key page, NEVER retry silently. |
| 429 (rate limit) | Back off (retry ≤2 with delay), then tell user the free-limit state. |
| 5xx | One retry, then clean "provider is down" state. No key re-send tricks. |
| Unknown model | Block before send ("not on allowlist"). |

## 10. Privacy notice (shown BEFORE first key entry — exact promises)

> Your provider key stays in this browser and is sent directly to the provider,
> never to Knoprix servers. Knoprix stores and processes uploaded files using
> its service infrastructure. AI may read only documents you explicitly
> approve. Before document text is sent to an external AI provider, Knoprix
> will show you the provider/model and ask for separate consent. Providers
> apply their own data policies (linked below). Clear browser-stored keys
> anytime in Settings.

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
- [ ] Unselected docs never leave the browser (request-body test).
- [ ] Privacy notice shown before first key entry.
- [ ] "Clear keys" wipes all stored key material (verified in browser).
- [ ] Free-tier candidates re-verified at build time (each link checked).
- [ ] Per-document AI grants are enforced by the backend on every content
  retrieval.
- [ ] Third-party provider consent is separate from Knoprix backend processing
  and is provider/model-specific.
- [ ] User deletion removes live source and derived data; backup purge is
  completed within the documented 30-day window.
