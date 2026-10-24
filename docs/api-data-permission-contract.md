# Knoprix API, Data, and Permission Contract

**Status:** Target contract with contacts/sharing and extracted-text chat
implemented; historical provider-copy cleanup remains. Full-document provider
uploads and visual chat are retired; remaining deviations are listed below.
**Date:** 2026-10-20
**Scope:** Extraction, AI, mind-map, contacts, sharing, inbox, and notification
APIs. This document specifies behavior, not UI layout.

## 1. Compatibility and common rules

- New endpoints use `/api/v1`. Existing `/api/...` endpoints remain legacy
  routes and are not silently changed by this contract.
- **Authentication migration exception:** `POST /api/auth/firebase/session`
  remains under the existing legacy auth prefix so the current frontend can
  exchange a Firebase identity for its Knoprix account.
  This endpoint does not mint a second Knoprix token; subsequent API requests
  use the Firebase ID token.
- `POST /api/auth/firebase/session` requires
  `Authorization: Bearer <Firebase ID token>` and accepts
  `{"fullName": "Reader One"}` (`fullName` may be omitted or `null`).
  It returns the existing legacy user shape:
  `{"id": "user-id", "email": "reader@example.com", "full_name": "Reader One"}`.
  The backend verifies the configured Firebase project, token signature,
  expiry, issuer, and audience; identity and email are read from the signed
  token, never trusted from the request body.
- A new Firebase UID creates an independent Knoprix user, whether or not its
  email is verified. An already-linked UID remains usable if its email later
  becomes unverified. An unverified email cannot link an unlinked existing
  Knoprix account; it returns `403` without changing ownership. A verified
  email can link that Firebase UID to the existing row without changing its
  ID or owned records. Repeated session syncs return the same user. A
  UID/email conflict returns `409`; invalid tokens return `401`, and
  unavailable verification keys return `503`.
- When `FIREBASE_PROJECT_ID` is configured, legacy
  `POST /api/auth/register` returns `410`. Existing unlinked users may continue
  using legacy login/refresh; after linking, legacy login/refresh are rejected
  and the Firebase ID token is required.
- The current backend has owner-scoped authenticated routes, synchronous
  document extraction, persisted AI document grants and provider-file
  mappings, and implemented contact/share slices. It does not yet implement
  every `/api/v1` contract below.
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

### Implemented contacts/sharing slice (2026-10-12)

The current implementation is narrower than the full target contract above.
It exposes authenticated, unwrapped FastAPI JSON responses under `/api/v1`:

- `GET /profile`, `PATCH /profile/privacy`
- `GET /contacts/lookup/{knoprixId}`, `GET /contacts`,
  `GET /contact-requests/sent`, `POST /contact-requests`,
  `POST /contact-requests/{id}/accept|decline`,
  `DELETE /contact-requests/{id}`, `GET /inbox`
- `GET /blocks`, `POST /blocks`, `DELETE /blocks/{knoprixId}`,
  `DELETE /contacts/{knoprixId}`
- `POST /shares`, `GET /shares/sent`, `GET /shares/received`,
  `POST /shares/{id}/accept|decline|leave`, `DELETE /shares/{id}`,
  `GET /shared-resources/{shareId}`
- `PUT /bookmarks/{bookmarkId}/highlight`,
  `DELETE /bookmarks/{bookmarkId}/highlight`

Public identity and contact discovery use Knoprix IDs only; IDs have the
`KP-` + 10-character Crockford Base32 form. Email is not a lookup key.
Lookup is opt-in by privacy setting and rate-limited. Contact and share
requests are in-app only, per-recipient, expire after 30 days while pending,
and require recipient acceptance. Accepted shares last until revocation,
contact removal/block, recipient leave, or source deletion. Supported scopes
are one document, bookmark, or highlight; project snapshots are not supported.
Only accepted document shares unlock the existing document GET, slides, pages,
and stream routes. Those reads remain owner-owned; writes stay owner-only.
Bookmark/highlight shares are exposed only through their accepted
`/shared-resources/{shareId}` response. That response uses an allowlist and
omits internal user/project identifiers. For document shares, it returns
reader metadata only; the reader fetches content from the owner/share-checked
`GET /documents/{documentId}` route, whose shared response omits storage paths
and project identifiers while preserving the document text needed by the
read-only viewer. Highlight annotation shares include the saved character
anchors so the reader can jump precisely when the recipient separately has
accepted access to the source document. `GET /projects/{projectId}/documents`
also includes per-document `bookmark_count` and `highlight_count`, each scoped
to the authenticated user and requested project.

Email notification preferences are stored, but no delivery provider/outbox
is connected; the profile response explicitly reports email notifications as
unavailable. In-app request lists remain authoritative.

Not yet implemented from the target contract: response envelopes, strict
unknown-field rejection, cursor pagination, idempotency-key replay, durable
email delivery, sender/recipient auditing UI beyond request/share status, and
shared-resource integration with AI routes. Do not infer that these are
available from the broader target sections below.

## 2. Data model and relationships

Use relational rows for ownership, permissions, state transitions, and
many-to-many relationships. JSON is reserved for genuinely variable provider
metadata or bounded parser-specific details, not relationship lists.

| Entity | Relationship and required behavior |
|---|---|
| `users` | Existing account identity plus unique public Knoprix ID and privacy/notification preferences. Contact discovery uses Knoprix ID only. |
| `projects` | Owned by one user; has many documents. |
| `documents` | Belongs to one project; owner is derived through that project. Deletion removes live source and derived content. |
| `extraction_jobs` | Belongs to the initiating user and document; tracks one extraction attempt and optional `retryOfJobId`. Terminal job metadata expires 30 days after completion. |
| `document_blocks` | Belongs to a document and has a stable page/block order. Stores extracted text, table cells, or image/OCR references and optional extraction confidence. |
| `ai_grants` | One user/document/purpose grant. State is `active` or `revoked`; revocation prevents later AI retrieval. |
| `provider_consents` | Records one user's consent for document(s), provider, model, purpose, and provider terms version. It never contains a key. |
| `conversations` | One owner-scoped row per conversation; title and timestamps are stored for account sync. |
| `messages` | Ordered user/assistant turns owned through `conversation_id`; stores message content, provider/model metadata, and citation metadata. A unique `(conversation_id, sequence)` preserves order. Conversation and user deletion cascade. |
| `citations` | Evidence references embedded in generated messages/results: document, block/page, and excerpt. |
| `mind_map_pins` | User/project/normalized concept unique tuple. Nodes and edges are derived from current document blocks and are not treated as factual relationships beyond their labeled evidence. |
| `contact_requests` | Directed requester-to-recipient request with one pending request per canonical pair. Status is `pending`, `accepted`, `declined`, `canceled`, or `expired`. Accepted requests create a mutual contact relationship. |
| `contacts` | One canonical unordered user pair; both users see the relationship. |
| `shares` | One sender-to-recipient request per exact document, bookmark, or highlight. Status is `pending`, `accepted`, `declined`, `revoked`, `expired`, or `left`; each recipient accepts independently. No project/folder snapshot shares. |
| `bookmark_highlight_links` | Optional same-owner, same-document, same-page association; deleting either annotation clears only the link and leaves the other annotation intact. |
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
   resource or has an active, accepted share covering that exact document.
   Contact status alone never grants resource access.
2. A pending share grants no content access. A recipient gains access only
   after accepting that recipient's own share request.
3. Shared resources are read-only. Recipients cannot change or delete the
   sender's source, bookmarks, or highlights. Sharing a bookmark or highlight
   alone exposes only that annotation; it does not grant access to its source
   document or project.
4. Project/folder snapshots are not a supported share scope.
5. AI retrieval requires the caller's active per-document AI grant. For a
   shared document, the sender must also have explicitly enabled AI access in
   that share. If document content will be sent to an external provider, the
   caller additionally needs an active consent for that document, provider,
   model, and purpose. No one of these permissions substitutes for another.
6. BYOK keys stay in browser-local storage and are sent in request headers to
   Knoprix for backend-routed provider operations. Knoprix uses the raw key
   only in request memory; it must never be returned, logged, or persisted.
   NVIDIA uses only the backend-managed key.
7. Removing or blocking a mutual contact revokes pending and accepted shares
   between those users.
   Independently, the sender may revoke an accepted share and its recipient
   may leave it. Any of these actions immediately removes access and revokes
   share-scoped AI permission.
8. Deleting a document removes its live file, blocks, indexes, summaries,
   grants, provider consents, and share access. Encrypted backups may retain
   deleted data for up to 30 days, as recorded in `PRD.md`.
9. Conversation and message reads or mutations require authentication and an
   owner-scoped query. An unknown conversation and another user's conversation
   both return `404`; project membership, document grants, and chat context do
   not grant access to saved conversations.

## 4. Extraction jobs and document blocks

### `POST /api/v1/projects/{projectId}/documents`

Authenticated multipart upload; header `Idempotency-Key: <uuid>`. Accepted
initial formats: PDF, PPTX, DOCX, TXT, MD, PNG, JPG/JPEG, and static SVG.
Standalone images are preserved without OCR; legacy `.ppt` is rejected. The
current implementation and per-format signature/resource limits are recorded
in `docs/upload-support-matrix.md`. Return `202 Accepted` immediately after
durable job creation:

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
context is short-lived and not persisted as conversation history. The current
`POST /api/chat/ask` and `/api/chat/stream` routes still use their legacy
request shape; the unified target is specified below.

### Provider-copy cleanup routes and unified chat target

The cleanup routes below are implemented under `/api`, not `/api/v1`; the
unified chat and conversation routes are the approved target until their
implementation is complete. Existing chat currently uses the older
document-required request shape. Shared-document AI chat is not part of this
change.

- `GET /api/projects/{projectId}/provider-documents?providerId=...&model=...`
  lists existing provider-copy records without remote file IDs or credential
  fingerprints. It exists for copies created by the retired upload feature;
  new chat requests do not create provider copies.
- `DELETE /api/documents/{documentId}/provider-authorization?providerId=...&model=...`
  immediately blocks local use of a legacy provider copy and attempts
  provider-side deletion. Failed deletion remains retryable.
- `POST /api/provider-files/{documentId}/retry-delete` accepts
  `{"providerId":"...","model":"..."}` and retries pending deletion with the
  provider key in a header. The NVIDIA server key is used only if a legacy
  record requires cleanup.
- `POST /api/chat/ask` and `POST /api/chat/stream` use one general-chat
  contract; `mode` is not a public choice. Request:

  ```json
  {
    "conversationId": "uuid",
    "projectId": "uuid-or-null",
    "providerId": "groq-free",
    "model": "openai/gpt-oss-20b",
    "question": "Explain this idea.",
    "documentIds": [],
    "confirmed": false
  }
  ```

  `documentIds` may be empty for general chat. If non-empty, each ID must be
  owned by the caller, belong to `projectId`, and have an active AI grant;
  `confirmed` must be true before external transfer. The client discloses the
  provider/model, documents, and whether saved-chat context may be included.
  The backend selects bounded, relevant document passages and relevant
  messages only from conversations owned by the authenticated caller. It never
  reads another user's messages or dumps whole projects/accounts into context.
  Missing document evidence does not prevent a general model answer.

  Provider adapters receive native web-search tools only for verified
  provider/model combinations; the model/API decides whether to search.
  Unsupported combinations receive no search tool and report live search as
  unavailable. The adapter normalizes supported web citations into structured
  source records, accepting only `https:` URLs. Provider search can incur
  provider-defined usage charges.

  `POST /api/chat/stream` retains named SSE events (`meta`, `thought`,
  `token`, `citation`, `error`, `done`). `meta` reports provider/model, search
  availability, and included context classes; document and web citations are
  emitted separately from answer tokens. Completed user/assistant messages
  and citations are persisted to the conversation. No key or full prompt is
  logged. Retrieved passage text is not stored as a separate chat record.
- New provider uploads, provider-file creation, and full-document visual chat
  are removed. Existing provider file IDs/URIs and keyed credential
  fingerprints remain stored only so old copies can be revoked and deletion
  retried; raw provider keys are not stored.

### Conversation history routes

All routes below require authentication and scope reads/writes to
`current_user.id`. API fields use camelCase. Unknown and other-user IDs return
the same `404` response.

#### `GET /api/chat/conversations?search=&limit=20&offset=0`

Search is a case-insensitive substring match on title only. `limit` is 1–50
(default 20); `offset` is non-negative (default 0). Results are ordered by
`updatedAt DESC, id DESC` and include:

```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "Study session",
      "projectId": "uuid-or-null",
      "createdAt": "2026-10-25T00:00:00Z",
      "updatedAt": "2026-10-25T00:01:00Z"
    }
  ],
  "pagination": {"limit": 20, "offset": 0, "total": 1}
}
```

#### `POST /api/chat/conversations`

Creates an empty conversation. Body: `{"projectId":"uuid-or-null"}` (`projectId`
may be omitted or null). A provided project must belong to the caller. The
server assigns `New chat`; returns `201` with the conversation object above.

#### `GET /api/chat/conversations/{conversationId}`

Returns the conversation and ordered messages:

```json
{
  "conversation": {
    "id": "uuid",
    "title": "Study session",
    "projectId": "uuid-or-null",
    "createdAt": "2026-10-25T00:00:00Z",
    "updatedAt": "2026-10-25T00:01:00Z"
  },
  "messages": [
    {
      "id": "uuid",
      "sequence": 1,
      "role": "user",
      "content": "Explain this idea.",
      "createdAt": "2026-10-25T00:00:10Z",
      "citations": []
    },
    {
      "id": "uuid",
      "sequence": 2,
      "role": "assistant",
      "content": "Here is an explanation.",
      "createdAt": "2026-10-25T00:01:00Z",
      "providerId": "groq-free",
      "modelId": "openai/gpt-oss-20b",
      "citations": []
    }
  ]
}
```

Messages contain only `user` or `assistant` roles; system instructions are
never persisted or returned. Citations store source pointers/metadata, not a
second full copy of retrieved context.

#### `PATCH /api/chat/conversations/{conversationId}`

Accepts `{"title":"Study session"}` only. The title is trimmed, non-empty, and
at most 120 characters. Invalid input returns `422`; success returns the
updated conversation object.

#### `DELETE /api/chat/conversations/{conversationId}`

Deletes the conversation and cascades to its messages/citations; returns
`204`. Deleting the account cascades to all owned conversations.

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

## 7. Conversation, message, and citation contract

Conversation history is stored server-side for the authenticated Knoprix
account and is available across that account's devices. Browser storage is not
the source of truth. Provider keys remain browser-local and separate from
history. Logout/account switching must not display the prior account's chats.
Users can search titles, open, rename, and delete conversations; account
deletion removes all conversations and messages.

```json
{
  "id": "uuid",
  "title": "Study session",
  "projectId": "uuid-or-null",
  "createdAt": "2026-10-04T00:00:00Z",
  "updatedAt": "2026-10-04T00:00:10Z",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Explain this passage.",
      "createdAt": "2026-10-04T00:00:01Z",
      "citations": []
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "The cited passage says ...",
      "createdAt": "2026-10-04T00:00:10Z",
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

`role` is `user` or `assistant`; system instructions are not persisted or
shown as user messages. A document citation points to a source/page; a web
citation contains a provider citation title and validated HTTPS URL. The
Recent Chats dialog searches titles only and shows each title
and last-updated date. Selecting a row closes the dialog and opens the
conversation. New, rename, and confirmed delete are supported. Its approved
visual direction reuses the existing dark/gold tokens, with a full-width
dialog on mobile and a centered dialog on larger screens.

## 8. Contacts, resource shares, inbox, and notifications

> **Target design only:** This section describes the broader planned v1
> contract, not the currently shipped API. The implemented subset documented
> above is authoritative. In particular, email-based discovery, project
> snapshots, and email delivery are not supported.

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
| Conversation deletion | Owner-scoped server conversation and child messages/citations are deleted |
| Pagination across changing lists | Stable cursor ordering, no cross-user cursor reuse |

## 10. Legacy compatibility and implementation boundary

Existing routes such as `/api/projects`, `/api/documents/...`,
`/api/chat/ask`, and `/api/providers/allowlist` remain available. The current
document GET, slides, pages, and stream routes permit read-only access to an
accepted, active document share; document mutations remain owner-only. See
the implemented-slice section above for the exact contact/share routes and
known limits. Upload remains synchronous. Provider-copy cleanup routes are
owner-only; full-document upload/chat routes are not available. All other v1
contracts above remain design references, not shipped endpoints. Do not infer email delivery, project
snapshots, or the additional v1 behaviors from this document.
