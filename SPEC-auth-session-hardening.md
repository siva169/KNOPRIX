# Spec: Legacy Account Session Hardening

**Module:** `auth`
**Status:** Implemented and verified locally
**Backlog:** `tasks/todo.md`, Phase 1, Task 1.1
**Capability map:** `capability-map.md`

## Objective

Harden Knoprix's legacy password/JWT account sessions while preserving Firebase
authentication as Firebase-managed. Legacy password accounts receive
short-lived access tokens, rotating and revocable refresh sessions, safe
browser transport, production secret checks, and shared database-backed
authentication rate limits.

## Approved Decisions

- Access tokens expire after 15 minutes.
- Refresh sessions rotate on every successful refresh and expire no later than
  7 days after session creation. Reuse of a rotated token revokes that session.
- Users may hold multiple active device sessions. Logging out revokes the
  current session; a separate logout-all action revokes all sessions.
- The browser keeps access tokens in memory and receives refresh tokens only
  in an HttpOnly cookie. Tokens are not stored in localStorage or
  sessionStorage.
- Rate-limit state uses the configured application database; no Redis service
  or new dependency is introduced.
- Firebase ID tokens and Firebase refresh behavior remain under Firebase Auth.

## Tech Stack

- FastAPI/Pydantic backend; existing SQLite/PostgreSQL compatibility layer.
- React/Axios frontend.
- Existing PyJWT and bcrypt dependencies; standard-library UUID, hashing, and
  time utilities where appropriate.
- Versioned schema migrations from the `database-foundation` module.

## Commands

Run from `knoprix-final-project/backend`:

```sh
.venv/bin/python -m unittest qa_auth_sessions qa_firebase_auth
.venv/bin/python -m unittest qa_database_migrations qa_bookmarks qa_file_formats
.venv/bin/python -m py_compile app/config.py app/security.py app/routers/auth.py
```

Run from `knoprix-final-project/frontend`:

```sh
npm run build
```

Use only disposable local databases and synthetic credentials for tests.

## Project Structure

- `backend/app/database.py` and versioned migration definitions — session and
  rate-limit persistence.
- `backend/app/config.py` — environment selection and production secret
  validation.
- `backend/app/security.py` — token expiry/validation and shared rate limiting.
- `backend/app/routers/auth.py` — session creation, rotation, logout/revocation.
- `backend/qa_auth_sessions.py` — isolated auth lifecycle and rate-limit tests.
- `frontend/src/api.js` — in-memory access token and cookie-based refresh.
- `frontend/src/context/AuthContext.jsx` — restore, login, logout state.
- `frontend/src/components/ErrorBoundary.jsx` and direct token consumers —
  remove obsolete local token handling.
- `docs/` and `changes.md` — auth storage and session behavior documentation.

## Code Style

Keep auth state transitions explicit and fail closed. Refresh rotation and
revocation update the database transactionally; never log tokens or include
them in error details. Frontend API requests use credentials only where needed
and retry a failed request at most once after refresh.

## Testing Strategy

- Backend tests use disposable SQLite databases for expired, invalid, rotated,
  reused, logged-out, and cross-user session tokens.
- Verify multiple device sessions work independently, while logout-all
  invalidates each active legacy session.
- Verify database-backed rate limits are shared across separate limiter
  instances and reset after their defined window.
- Verify production configuration rejects missing/default JWT secrets, while
  local development remains usable without production secrets.
- Verify Firebase token/session behavior remains unchanged.
- Frontend tests/build verify no legacy auth token is written to browser
  storage; refresh uses the HttpOnly cookie and clears auth state after a
  rejected refresh.
- Run the migration, Firebase, bookmark, and parser regression suites.
- Do not claim PostgreSQL runtime coverage unless tested against a disposable
  PostgreSQL instance.

## Boundaries

- **Always:** keep provider API keys separate from auth credentials; do not
  store auth tokens in browser web storage; hash persisted refresh identifiers;
  preserve Firebase-managed sessions; avoid credential/token logging; keep
  login errors non-enumerating.
- **Ask first:** production/staging deployment, new external identity/mail/
  CAPTCHA services, changes to approved session policy, or tests against a
  shared database.
- **Never:** commit secrets; log raw tokens; silently fall back to persistent
  web storage; invalidate Firebase sessions through Knoprix JWT controls.

## Success Criteria

1. Legacy access tokens expire after 15 minutes and refresh sessions rotate
   and expire within the approved 7-day maximum.
2. Refresh-token replay and logout revoke the appropriate session; logout-all
   revokes all legacy sessions without affecting other users.
3. Multiple active device sessions operate independently.
4. Production startup fails closed for missing/default JWT secrets.
5. Authentication rate limits are database-backed and shared across
   application instances using the same database.
6. Legacy auth credentials are not persisted in browser localStorage or
   sessionStorage; refresh credentials are HttpOnly cookies.
7. Existing Firebase auth, database migration, bookmark, and parser tests pass.
8. Local browser/API flows pass without deployment; deployment remains a
   separate user-approved step.

## Open Questions

- The eventual deployment must provide a first-party/same-site API origin (or
  equivalent proxy) for reliable HttpOnly-cookie behavior across browsers.
  Local localhost verification can proceed, but no production host/domain is
  selected or configured by this spec.
- CAPTCHA provider and account-recovery email provider remain separate,
  explicitly gated backlog tasks (1.4 and 1.3).
