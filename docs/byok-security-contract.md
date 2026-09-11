# BYOK Provider Security Contract — Knoprix Final Project

**Status:** Spec (implements `tasks/todo.md` → "Spec: design BYOK provider
security contract"). Boss decisions (2026-09-11): FREE providers only ·
keys BROWSER-LOCAL only · SELECTED documents only.
**Scope:** This contract covers the future document-chat slice. No keys,
no provider calls exist yet — this file is the rulebook first, code second.

## 1. Assumptions (explicit)

- A1. The user brings their OWN free-tier key (BYOK). Knoprix ships NO key.
- A2. Browsers are untrusted-shared environments (extensions CAN read
  localStorage) — keys are convenience-stored, not vault-stored. Stated
  openly in the privacy notice, not hidden.
- A3. Free-tier provider terms change fast. The allowlist is re-verified
  at implementation time and every release — a stale free endpoint MUST be
  removed, never grandfathered.
- A4. Backend NEVER needs the key. Any backend code path that receives,
  logs, or stores a key is a DEFECT, not a feature.

## 2. Out of scope (not promised)

- Paid providers, team/shared keys, server-side key vaults.
- Protection against malicious browser extensions (impossible client-side).
- Provider-side data retention (governed by each provider's own policy —
  linked in the privacy notice, not ours to enforce).

## 3. Data classes + handling

| Class | Examples | Handling |
|---|---|---|
| Provider keys | API keys/tokens | MUST live in browser localStorage ONLY. MUST NEVER be sent to backend, written to logs, or included in error reports. |
| Chat content | Selected doc text, questions, answers | MUST include selected documents ONLY. MUST NEVER include whole-project or unselected docs. |
| Chat history | Past Q/A pairs | SHOULD stay browser-local by default. CAN export/delete by user action. |
| Diagnostics | Error codes, latency, model name | CAN go to backend logs. MUST NEVER include keys or doc text. |

## 4. Trust boundaries + controls

1. **Browser → Provider (direct):** chat calls go straight from the browser
   to the allowlisted provider. Backend is NOT in this path and MUST NOT
   proxy keys.
2. **Browser → Backend:** backend serves the allowlist, model limits, and
   (later) chat-history sync. Backend MUST reject any request field that
   looks like a key (fail closed: `400 + "keys stay in browser"`).
3. **Backend → Provider:** no key-bearing calls exist. Build-time checks
   (docs, examples) MUST use placeholder keys only.

## 5. Auth / session policy

- App login stays as-is (current auth behavior unchanged — verified slice).
- Provider identity = the user's own key, entered once per provider, stored
  browser-local. No Knoprix account linkage to provider identity.

## 6. Allowlist policy (FREE only)

- MUST: backend publishes `/providers/allowlist` (name, base URL, free-tier
  note, per-model limits). Client MUST refuse any provider/model not on it.
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
- Chat history: user-deletable per chat + "delete all".
- Backend: retains NO key material by design (nothing to delete — verified
  by log-scan test in the implementation slice).

## 9. Provider errors (contract)

| Provider says | App MUST |
|---|---|
| 401/403 (bad key/quota dead) | Show "key or free quota" notice, link provider key page, NEVER retry silently. |
| 429 (rate limit) | Back off (retry ≤2 with delay), then tell user the free-limit state. |
| 5xx | One retry, then clean "provider is down" state. No key re-send tricks. |
| Unknown model | Block before send ("not on allowlist"). |

## 10. Privacy notice (shown BEFORE first key entry — exact promises)

> Your key stays in THIS browser only — it is never sent to Knoprix servers.
> Only documents YOU select are sent to the provider with each question.
> Free providers apply their own data policies (linked below). Clear your
> keys anytime: Settings → Clear keys.

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
