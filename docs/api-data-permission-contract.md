# Knoprix API, Data, and Permission Contract

**Status:** Approved target contract; implementation has not started.
**Date:** 2026-10-04
**Scope:** New extraction, AI, mind-map, contacts, sharing, inbox, and
notification APIs. This document specifies behavior, not UI layout.

## 1. Compatibility and common rules

- New endpoints use `/api/v1`. Existing `/api/...` endpoints remain legacy
  routes and are not silently changed by this contract.
- **Authentication migration exception:** `POST /api/auth/firebase/session`
  remains under the existing legacy auth prefix so the current frontend can
  exchange a verified Firebase identity for its existing Knoprix account.
  This endpoint does not mint a second Knoprix token; subsequent API requests
  use the Firebase ID token.
- `POST /api/auth/firebase/session` requires
  `Authorization: Bearer <Firebase ID token>` and accepts
  `{"fullName": "Reader One"}` (`fullName` may be omitted or `null`).
  It returns the existing legacy user shape:
  `{"id": "user-id", "email": "reader@example.com", "full_name": "Reader One"}`.
  The backend verifies the configured Firebase project, token signature,
  expiry, issuer, audience, and verified email; identity and email are read
  from the verified token, never trusted from the request body.
- A verified email matching an existing Knoprix user links that Firebase UID
  to the existing row without changing its ID or owned records. Repeated
  session syncs return the same user. A UID/email conflict returns `409`;
  invalid tokens return `401`, unverified email returns `403`, and unavailable
  verification keys return `503`.
- When `FIREBASE_PROJECT_ID` is configured, legacy
  `POST /api/auth/register` returns `410`. Existing unlinked users may continue
  using legacy login/refresh; after linking, legacy login/refresh are rejected
  and the Firebase ID token is required.
- The current backend has owner-scoped JWT routes, synchronous document
  extraction, a mocked `/api/chat/ask`, and no persisted AI grants,
  conversations, contacts, or shares. It does not yet enforce this contract.
- All new endpoints except public health checks require
  `Authorization: Bearer <accessToken>`. The authenticated user is derived
  from the token; callers cannot choose an `ownerId` or `userId` in a body.
- IDs are opaque UUID strings. Timestamps are RFC 3339 UTC strings.
  JSON field names use `camelCase`.
- New JSON responses use `{"data": ...}`. `204 No Content` responses have no
  body. Multipart upload responses use the same JSON envelope.
- Request schemas reject unknown fields. Key-like fields (`apiKey`, `token`,
  `secret`, and equivalent spellings) are rejected with `400
  SENSITIVE_FIELD_FORBIDDEN` before request-body logging. Other invalid fields
  return `422 VALIDATION_ERROR`.
- Error responses use one shape:

  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "The request is invalid.",
      "details": {},
      "requestId": "opaque-request-id"
    }
  }
  ```

  `details` is optional. Never include stack traces, provider credentials,
  document text, or full prompts in error responses or logs.
- Status mapping: `400` malformed/sensitive input, `401` missing or invalid
  authentication, `403` disallowed action, `404` absent or inaccessible
  resource, `409` state/idempotency conflict, `413` file too large, `415`
  unsupported file type, `422` schema/content validation, `429` rate limit,
  and `5xx` unexpected service failure.
- Object lookups return `404` for both nonexistent and unauthorized resources
  to avoid confirming another user's resource IDs.
- Cursor-paginated lists accept `cursor` (omitted for the first page) and
  `pageSize` (default 25, maximum 100), and return:

  ```json
  {
    "data": [],
    "pageInfo": {
      "nextCursor": "opaque-or-null",
      "hasMore": false
    }
  }
  ```

  Ordering is stable and documented per resource. Cursors are opaque and
  scoped to the authenticated user and query.
- Mutating `POST` endpoints require an `Idempotency-Key` UUID. The server
  scopes it to user, method, and route, stores a request hash, and retains
  results for 7 days. Same key + same request replays the original status and
  body; same key + different request returns `409 IDEMPOTENCY_CONFLICT`.
  Concurrent in-flight duplicates return `409 REQUEST_IN_PROGRESS` with
  `Retry-After`. Database uniqueness constraints separately prevent duplicate
  pending contact/share relationships. For multipart upload, the request hash
  covers file bytes and normalized metadata, not multipart boundaries.

## 2. Data model and relationships

Use relational rows for ownership, permissions, state transitions, and
many-to-many relationships. JSON is reserved for genuinely variable provider
metadata or bounded parser-specific details, not relationship lists.

| Entity | Relationship and required behavior |
|---|---|
| `users` | Existing account identity. A verified email or public Knoprix ID may identify a contact target. |
| `projects` | Owned by one user; has many documents. |
| `documents` | Belongs to one project; owner is derived through that project. Deletion removes live source and derived content. |
| `extraction_jobs` | Belongs to the initiating user and document; tracks one extraction attempt and optional `retryOfJobId`. Terminal job metadata expires 30 days after completion. |
| `document_blocks` | Belongs to a document and has a stable page/block order. Stores extracted text, table cells, or image/OCR references and optional extraction confidence. |
| `ai_grants` | One user/document/purpose grant. State is `active` or `revoked`; revocation prevents later AI retrieval. |
| `provider_consents` | Records one user's consent for document(s), provider, model, purpose, and provider terms version. It never contains a key. |
| `conversations` and `messages` | Browser-local only; there are no server persistence or history endpoints in v1. Their JSON shape is defined in section 7. |
| `citations` | Evidence references embedded in generated messages/results: document, block/page, and excerpt. |
| `mind_map_pins` | User/project/normalized concept unique tuple. Nodes and edges are derived from current document blocks and are not treated as factual relationships beyond their labeled evidence. |
| `contact_requests` | Directed requester-to-recipient request with one pending request per canonical pair. Status is `pending`, `accepted`, `declined`, `canceled`, or `expired`. Accepted requests create a mutual contact relationship. |
| `contacts` | One canonical unordered user pair; both users see the relationship. |
| `shares` | One sender-to-recipient request per recipient, even for a multi-recipient send. Status is `pending`, `accepted`, `declined`, `revoked`, `expired`, or `left`; each has its own acceptance. |
| `share_resources` | Normalized child rows listing exact resources captured by a share; a project snapshot records its included project, documents, bookmarks, and highlights at creation time. |
| `inbox_items` | Per-recipient in-app events for contact/share requests and state changes. Hiding an inbox item does not change the underlying request or share. |
| `notification_preferences` | Per-user opt-in settings for email notices. In-app events are always available; email never carries a file or document content. |
| `idempotency_records` | Unique key per user/method/route, request hash, response status/body, and expiry. |

Required uniqueness/lookup constraints include normalized email and public
Knoprix ID, unordered contact pair, one pending contact request per canonical
user pair (including opposite-direction duplicates),
share-recipient pair plus active resource scope, one active AI grant per
user/document/purpose, one active provider consent per
user/document/provider/model/purpose, and idempotency key scope. Revoked
grants/consents may remain as history; re-grant/re-consent creates a new
active record. Add indexes for document-to-project, blocks by
document/page/order,
jobs by user/status/created time, incoming inbox by recipient/created time,
pending requests by recipient/status/expiry, and shares by sender/recipient/
status/expiry. Schema rollout and SQL migrations are Task 0.3, not part of
this document-only task.

## 3. Authorization invariants

1. Every request is authenticated, then checks that the caller owns the
   resource or has an active, accepted, unexpired share covering that exact
   resource. Contact status alone never grants resource access.
2. A pending share grants no content access. A recipient gains access only
   after accepting that recipient's own share request.
3. Shared resources are read-only. Recipients cannot change or delete the
   sender's source, bookmarks, or highlights. Sharing a bookmark or highlight
   alone exposes only that annotation and its excerpt, not the full document.
4. A project share is a read-only snapshot taken when the sender creates the
   request. It includes that project's then-current documents, bookmarks, and
   highlights. Later additions/changes are not included automatically.
   Project/document listing endpoints must filter to the exact snapshot
   resources; a shared project ID must never expose later or unshared items.
5. AI retrieval requires the caller's active per-document AI grant. For a
   shared document, the sender must also have explicitly enabled AI access in
   that share. If document content will be sent to an external provider, the
   caller additionally needs an active consent for that document, provider,
   model, and purpose. No one of these permissions substitutes for another.
6. The provider key stays in browser-local storage and is sent directly to
   the provider. It must never be accepted, returned, proxied, logged, or
   stored by Knoprix.
7. Removing a mutual contact revokes pending and accepted shares between
   those users.
   Independently, the sender may revoke an accepted share and its recipient
   may leave it. Any of these actions immediately removes access and revokes
   share-scoped AI permission.
8. Deleting a document removes its live file, blocks, indexes, summaries,
   grants, provider consents, and share access. Encrypted backups may retain
   deleted data for up to 30 days, as recorded in `PRD.md`.

## 4. Extraction jobs and document blocks

### `POST /api/v1/projects/{projectId}/documents`

Authenticated multipart upload; header `Idempotency-Key: <uuid>`. Accepted
initial formats: PDF, PPTX, DOCX, TXT, and MD. English OCR is the initial
target. Return `202 Accepted` immediately after durable job creation:

```json
{
  "data": {
    "documentId": "uuid",
    "job": {
      "id": "uuid",
      "status": "queued",
      "progress": 0,
      "createdAt": "2026-10-04T00:00:00Z",
      "expiresAt": null
    }
  }
}
```

The job status is one of `queued`, `running`, `cancel_requested`, `succeeded`,
`failed`, or `canceled`. Progress is an integer from 0 to 100. `expiresAt` is
set to 30 days after a terminal state; this expires job metadata, not a
successfully extracted document. Failed jobs include a stable error code and
safe message, not parser internals or document text.

### `GET /api/v1/extraction-jobs/{jobId}`

Returns the caller's job or `404`:

```json
{
  "data": {
    "id": "uuid",
    "documentId": "uuid",
    "status": "running",
    "progress": 45,
    "stage": "extracting_text",
    "createdAt": "2026-10-04T00:00:00Z",
    "updatedAt": "2026-10-04T00:00:10Z",
    "expiresAt": null,
    "error": null
  }
}
```

### `POST /api/v1/extraction-jobs/{jobId}/cancel`

Idempotent for queued/running jobs. Queued jobs become `canceled`; running
jobs become `cancel_requested` and then `canceled` when the worker stops.
Return `200` with the updated `{id, status, progress, updatedAt}`. Successful,
failed, or already canceled jobs return `409 JOB_NOT_CANCELABLE`.

### `POST /api/v1/extraction-jobs/{jobId}/retry`

Requires `Idempotency-Key`; only a failed job can be retried. Returns
`202` with a new job whose `retryOfJobId` points to the failed attempt.
Retrying an active or successful job returns `409 JOB_NOT_RETRYABLE`.
Workers heartbeat active jobs; a job whose lease expires becomes failed with
`JOB_TIMEOUT`, never remains silently `running` forever. The concrete lease
duration is an operational setting, not a user-visible completion guarantee.

### `GET /api/v1/documents/{documentId}/blocks?cursor=&pageSize=25`

Requires owner access or a share explicitly containing the document or a
project snapshot containing it. Sharing only an annotation does not grant
document-block access. Returns blocks in stable
`pageNumber, blockIndex, id` order:

```json
{
  "data": [
    {
      "id": "uuid",
      "documentId": "uuid",
      "pageNumber": 1,
      "blockIndex": 0,
      "type": "paragraph",
      "text": "Extracted source text.",
      "table": null,
      "assetId": null,
      "bounds": {"x": 0.1, "y": 0.2, "width": 0.7, "height": 0.1},
      "confidence": null
    }
  ],
  "pageInfo": {"nextCursor": null, "hasMore": false}
}
```

`type` is `paragraph`, `table`, `image`, or `ocr`. `table` is a rectangular
array of strings; `assetId` is an opaque protected reference, never a data URL
or raw image payload. `bounds` uses normalized page coordinates and may be
null. `confidence` is optional and only describes the extraction engine's
estimate; it is not a guarantee of accuracy.

### `DELETE /api/v1/documents/{documentId}`

Owner-only; accepted shares/AI access are revoked in the same logical
operation. Returns `204`. Repeat deletion returns `404`. Live data deletion
must complete or return an error; do not return success while silently
leaving live derived content.

## 5. AI grants, provider consent, retrieval, and citations

### `GET /api/v1/providers/allowlist`

Returns only server-approved providers and models, with public metadata and no
credentials:

```json
{
  "data": {
    "providers": [
      {
        "id": "groq-free",
        "name": "Groq (free tier)",
        "baseUrl": "https://api.groq.com/openai/v1",
        "models": [{"id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B"}],
        "freeNote": "Verify limits at implementation time."
      }
    ]
  }
}
```

The client must still treat provider metadata as untrusted and the server
must validate provider/model identifiers on every relevant request. The
current `/api/providers/allowlist` is a legacy route.

### `POST /api/v1/documents/{documentId}/ai-grants`

Creates an active grant for the authenticated user. Body:

```json
{"purposes": ["chat", "summary"]}
```

Purposes are `chat`, `summary`, `flashcards`, `quiz`, and `storytelling`. The
server returns `201` with `{id, documentId, purposes, status, grantedAt}`.
The document must be owner-readable or shared with the caller and explicitly
AI-enabled by its owner when accessed through a share. For the document
owner, creating this grant is the explicit AI-access action.

### `DELETE /api/v1/ai-grants/{grantId}`

Owner of the grant only; returns `204`. Revocation is immediate and is
idempotent. Any retrieval started after revocation fails with
`403 AI_GRANT_REQUIRED`.

### `POST /api/v1/provider-consents`

Records external-transfer consent. Body:

```json
{
  "documentIds": ["uuid"],
  "providerId": "groq-free",
  "modelId": "openai/gpt-oss-20b",
  "purpose": "chat",
  "termsVersion": "provider-policy-version",
  "accepted": true
}
```

`accepted` must be true; provider/model must be in the current server
allowlist. `documentIds` contains 1–10 unique documents. Return `201` with a
consent ID and server `consentedAt`. There is no key field in this schema.
The caller must also have an active AI grant and current owner/share AI
permission for every listed document.

### `DELETE /api/v1/provider-consents/{consentId}`

Revokes that user's consent; returns `204`. Future external retrieval using
that consent fails. Re-consent creates a new record; it does not reactivate a
revoked consent.

### `POST /api/v1/ai/retrieval`

Returns selected source chunks to the browser so an approved BYOK provider
call can be made directly from the browser. Body:

```json
{
  "documentIds": ["uuid"],
  "purpose": "chat",
  "query": "Explain the selected concept.",
  "provider": {"id": "groq-free", "modelId": "openai/gpt-oss-20b"},
  "maxChunks": 8
}
```

`provider` is null only for a Knoprix-controlled operation that does not
transfer text externally. Require an active AI grant for every requested
document. If `provider` is present, require an active matching provider
consent for every document. Return only those documents' authorized blocks,
with `citation` references; never widen to the whole project. Limits:
1–10 unique documents, query 1–1,000 characters, `maxChunks` 1–20. Unknown
provider/model or any key-like field is rejected before retrieval.

```json
{
  "data": {
    "chunks": [
      {
        "text": "Selected source passage.",
        "citation": {
          "documentId": "uuid",
          "blockId": "uuid",
          "fileName": "notes.pdf",
          "pageNumber": 4,
          "excerpt": "Selected source passage."
        }
      }
    ],
    "provider": {"id": "groq-free", "modelId": "openai/gpt-oss-20b"},
    "expiresAt": "2026-10-04T00:05:00Z"
  }
}
```

If the provider is null, `provider` in the response is null. Retrieved
context is short-lived and not persisted as conversation history. Existing
`POST /api/chat/ask` remains a legacy mock and is not the v1 authorization
contract.

### `POST /api/v1/documents/{documentId}/summary`

Runs Knoprix's deterministic extractive summary over that document only.
Requires the caller's active `summary` AI grant and owner/share read access;
it does not call an external provider. Request:

```json
{"maxSentences": 5}
```

`maxSentences` is 1–10, default 5. Return `200`:

```json
{
  "data": {
    "documentId": "uuid",
    "method": "extractive",
    "summary": [
      {
        "text": "A selected source sentence.",
        "citation": {
          "documentId": "uuid",
          "blockId": "uuid",
          "fileName": "notes.pdf",
          "pageNumber": 4,
          "excerpt": "A selected source sentence."
        }
      }
    ]
  }
}
```

No readable blocks returns `422 DOCUMENT_HAS_NO_READABLE_TEXT`. A
provider-generated summary uses `/api/v1/ai/retrieval` with `purpose:"summary"`
and direct browser-to-provider BYOK only after provider consent.

## 6. Mind-map nodes and edges

### `GET /api/v1/projects/{projectId}/mind-map/nodes?cursor=&pageSize=25`

Owner or active project-share reader only. Returns derived concepts ordered by
normalized label. Each node contains `{id, label, pinned, documentCount,
evidence[]}`. Each evidence item contains `{documentId, blockId, pageNumber,
excerpt}` and is subject to the same read authorization.

### `GET /api/v1/projects/{projectId}/mind-map/edges?cursor=&pageSize=25`

Returns derived `{id, sourceNodeId, targetNodeId, relationType, strength,
evidence[]}`. `relationType` is explicitly `co_occurs_in_documents`; it
describes shared source evidence, not a causal or factual assertion. Every
edge's cited documents must be readable by the caller.

### `PUT /api/v1/projects/{projectId}/mind-map/pins/{normalizedTerm}` and
`DELETE` on the same path

Owner-only; pin/unpin is idempotent. Pin body is not accepted; the path term
must be a normalized plain word of at most 40 characters. `PUT` returns
`200 {"data":{"term":"...","pinned":true}}`; `DELETE` returns `204`.

## 7. Conversation, message, and citation client contract

Conversation history is browser-local only in v1. It is not submitted as
history to Knoprix, synchronized across browsers, or backed up by the service.
Store it under an account-scoped browser key so accounts on a shared browser
do not see each other's history. Logout/account switching must hide the prior
account's history. Users can delete one conversation or clear all local
conversations; clearing site data may also remove them. Browser storage is
not a secure vault. Provider keys and history remain separate.

```json
{
  "id": "uuid",
  "title": "Study session",
  "projectId": "uuid-or-null",
  "sourceDocumentIds": ["uuid"],
  "createdAt": "2026-10-04T00:00:00Z",
  "updatedAt": "2026-10-04T00:00:10Z",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Explain this passage.",
      "createdAt": "2026-10-04T00:00:01Z",
      "status": "complete",
      "citations": []
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "The cited passage says ...",
      "createdAt": "2026-10-04T00:00:10Z",
      "status": "complete",
      "providerId": "groq-free",
      "modelId": "openai/gpt-oss-20b",
      "citations": [
        {
          "documentId": "uuid",
          "blockId": "uuid",
          "fileName": "notes.pdf",
          "pageNumber": 4,
          "excerpt": "Source text used for this answer."
        }
      ]
    }
  ]
}
```

`role` is `user`, `assistant`, or `system`; system instructions are not shown
as user messages. A citation always points to an authorized source block/page.
No v1 server conversation/message CRUD endpoints are defined. Any later sync
proposal requires a separate retention and privacy decision.

## 8. Contacts, resource shares, inbox, and notifications

### Contacts

- `POST /api/v1/contact-requests` requires `Idempotency-Key` and accepts
  `{"recipient":{"email":"verified@example.com"}}` or
  `{"recipient":{"knoprixId":"public-id"}}`; only exact verified-email or
  public-ID lookup is allowed. The caller cannot request themselves. This
  contract does not read Gmail, import Google Contacts, or request mailbox
  scopes; any such integration needs a separate privacy/OAuth decision.
- Return `201` with:

  ```json
  {"data":{"id":"uuid","status":"pending","createdAt":"2026-10-04T00:00:00Z","expiresAt":"2026-11-03T00:00:00Z"}}
  ```

  Requests expire after 30 days. `GET /api/v1/contact-requests?direction=incoming|outgoing`
  is cursor-paginated.
- `POST /api/v1/contact-requests/{id}/accept` creates the mutual contact and
  returns `200 {"data":{"id":"uuid","status":"accepted","contactId":"uuid"}}`;
  `POST .../{id}/decline` returns
  `200 {"data":{"id":"uuid","status":"declined"}}`; sender `DELETE .../{id}`
  cancels it and returns `204`.
  These transitions are idempotent for the same completed state and return
  `409` for incompatible state transitions. If the opposite-direction
  request is already pending, do not create a duplicate; return
  `409 CONTACT_REQUEST_EXISTS` so the recipient can accept the existing
  incoming request.
- `GET /api/v1/contacts` returns mutual contacts. Private email is revealed
  only after acceptance. `DELETE /api/v1/contacts/{contactId}` removes the
  mutual relationship and revokes shares between those users.

### Resource shares

`POST /api/v1/shares` requires `Idempotency-Key`. It accepts one or more
already-mutual recipients and one or more resources:

```json
{
  "recipientContactIds": ["uuid", "uuid"],
  "resources": [
    {"type": "projectSnapshot", "resourceId": "uuid", "allowAi": false},
    {"type": "document", "resourceId": "uuid", "allowAi": true},
    {"type": "bookmark", "resourceId": "uuid"}
  ]
}
```

The other resource type is `highlight`, with its matching resource ID.
`allowAi` is valid only for `document` and `projectSnapshot`, and defaults to
false. It is the sender's explicit permission for a recipient to use AI on
that document or every document in that snapshot; the recipient still needs
their own per-document AI grant and any required provider/model consent. A
project snapshot is fixed at request creation and captures then-current
documents, bookmarks, and highlights. Sharing only a bookmark or highlight
exposes that annotation and excerpt, not the full source document. New
resources are not included later.

All recipients receive separate share records and must separately accept. If
any recipient is not a mutual contact or any resource is inaccessible, the
whole batch fails without partial shares. Limits are 1–20 recipients and
1–20 resources per request; duplicate resources are rejected.

Return `201` with `data.shareRequests[]`, one per recipient; each contains
`{id, recipient, resources, status:"pending", createdAt, expiresAt}`.
Pending requests expire after 30 days. `GET /api/v1/shares?direction=sent|received`
is cursor-paginated.

- `POST /api/v1/shares/{shareId}/accept` grants read-only access after
  acceptance and returns `200` with
  `{"data":{"id":"uuid","status":"accepted","acceptedAt":"2026-10-04T00:00:00Z"}}`.
  Accepted shares do not expire automatically.
- `POST /api/v1/shares/{shareId}/decline` rejects a pending share and returns
  `200` with `{"data":{"id":"uuid","status":"declined"}}`.
- Sender `DELETE /api/v1/shares/{shareId}` revokes it immediately.
- Recipient `POST /api/v1/shares/{shareId}/leave` ends their access.
- Contact removal revokes pending and accepted shares; pending share requests
  can no longer be accepted. Deleting the source resource also removes access.
  Repeated revocation/leave is idempotent.

An unaccepted share never exposes content. A share does not create a new
recipient-owned copy, and recipient edits/deletes are not permitted.

### Protected file assets

`GET /api/v1/documents/{documentId}/assets/{assetId}` streams an image or
other extracted file asset only when the caller has owner access or a share
explicitly containing the document or a containing project snapshot. An
annotation-only share is insufficient. It never accepts a caller-supplied
storage path. An external AI operation can receive an asset or its OCR text
only through the same sender AI opt-in, recipient AI grant, and
provider-consent checks as text blocks.

### Inbox and notifications

- `GET /api/v1/inbox/items?cursor=&pageSize=25` lists in-app notification
  items, newest first. Each item has `{id, type, actor, resourceRef, createdAt,
  isRead}`. Item types include `contact_request`,
  `share_request`, `share_accepted`, `share_revoked`, `extraction_completed`,
  and `extraction_failed`.
- `PATCH /api/v1/inbox/items/{itemId}` accepts `{"isRead":true}` and only
  updates that user's item, returning `200` with
  `{"data":{"id":"uuid","isRead":true}}`. `DELETE` hides that item only and
  returns `204`; it does not accept, decline, revoke, or delete the resource.
- In-app notifications are the source of truth. Email notifications are
  optional and preference-controlled; email contains no attachment, document
  text, prompt, or provider key. Email can contain a generic event notice and
  a link back to the authenticated Knoprix inbox.
- `GET /api/v1/notification-preferences` and
  `PATCH /api/v1/notification-preferences` use
  `{"emailNotificationsEnabled":true}` or `false` for explicit email
  opt-in/out, returning `200` with the stored preference. Email is disabled
  until enabled. Detailed notification-category preferences remain a product
  decision.

## 9. Contract verification cases

Contract tests must cover these behaviors before claiming implementation:

| Case | Expected result |
|---|---|
| Valid upload | `202`, stable job ID, progress/status pollable, no synchronous parse wait |
| Invalid type, empty file, oversized file | `415`, `422`, or `413`; no orphaned file/job |
| Same idempotency key and same upload/request | Original status/body replayed; no duplicate job/share/request |
| Same key with different payload | `409 IDEMPOTENCY_CONFLICT` |
| Concurrent retry while operation is in progress | `409 REQUEST_IN_PROGRESS`, safe retry guidance |
| Missing/expired JWT | `401`; no resource details |
| Other user's project/document/job/block/grant/share ID | `404`; no cross-account content leak |
| Accepted share | Recipient reads only enumerated, snapshotted resources; mutations remain forbidden |
| Pending/declined/expired/revoked share | `404` for content; no access from contact status alone |
| Shared document AI, sender did not enable AI | `403 SHARE_AI_NOT_ALLOWED` |
| Shared document AI, missing recipient grant/provider consent | `403`; provider receives no text |
| External provider consent revoked or model not allowlisted | `403` / `400`; provider receives no text |
| Key-like request field or unknown secret field | `400 SENSITIVE_FIELD_FORBIDDEN`; value absent from logs |
| Contact/share pending past 30 days | Transition to `expired`; acceptance returns `409 REQUEST_EXPIRED` |
| Sender revokes or recipient leaves accepted share | Immediate content and AI-share access removal |
| Contact removed with pending/accepted shares | Pending requests become revoked; accepted access is revoked immediately |
| Delete source document | Live source/blocks/indexes/grants/consents/share access removed; backup window disclosed |
| Conversation deletion | Browser-local data removed; no backend conversation row exists |
| Pagination across changing lists | Stable cursor ordering, no cross-user cursor reuse |

## 10. Legacy compatibility and implementation boundary

The current routes such as `/api/projects`, `/api/documents/...`,
`/api/chat/ask`, and `/api/providers/allowlist` remain unchanged until a
separate implementation/migration task. In particular, current document
content routes are owner-scoped but do not yet implement accepted-share or
AI-grant checks; current upload is synchronous; and current chat is mocked.
Do not advertise the v1 behaviors as available until backend authorization,
database migrations, frontend wiring, and the cases above are implemented
and verified.
