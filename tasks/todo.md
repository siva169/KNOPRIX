# Knoprix Final Project — Tasks

- [x] Baseline: verify copied backend and frontend independently
  - Acceptance: health endpoint responds and frontend build passes.
  - Verify: backend smoke check and `npm run build`.
  - Files: `backend/`, `frontend/`
  - Done 2026-09-09 (baseline commit e86beed); re-verified 2026-09-11.

- [x] Contract: approve DashboardOverview UI/UX decisions
  - Acceptance: `UI-UX.md` has selected layout, navigation, states, and
    responsive behavior for the dashboard.
  - Verify: boss approval recorded in `UI-UX.md` / changes log.
  - Files: `UI-UX.md`
  - Done 2026-09-09 — boss selected the research-cockpit direction and the
    `Space Grotesk + IBM Plex Mono` pairing (commit 0bd7d6a).

- [x] Slice: implement approved foundation shell
  - Acceptance: signed-in and signed-out shells work at all required widths.
  - Verify: browser verification at 390/425/768/1024px.
  - Files: `frontend/src/`
  - Done 2026-09-11 (commit ab88f5a): ErrorBoundary crash guard (root +
    content), skip-to-content link, meta description, favicon, dead font
    import removed. 10/10 Playwright checks incl. forced-crash fallback proof.

- [x] Slice: preserve and verify core backend routes
  - Acceptance: current authentication, project, document, search, DSA,
    bookmark, and highlight behavior remains available.
  - Verify: focused API smoke tests (`backend/qa_smoke.py`, 9/9 passed
    2026-09-11; DSA/highlights routes exercised via the same routers).
  - Files: `backend/app/`
  - Done 2026-09-11 (commit with `qa_smoke.py`); backend env restored via
    local `.venv` after the Python 3.14 upgrade wiped system packages.
  - Note: DSA visualizer and highlights run through the same verified routers
    (dsa/highlights routers registered and mounted); their dedicated QA lands
    with their own slices.

- [x] Spec: design BYOK provider security contract
  - Acceptance: key storage, authorization, allowlist, privacy notice, limits,
    deletion, and provider errors are specified.
  - Verify: security review before implementation.
  - Files: `docs/`
  - Done 2026-09-11 (`docs/byok-security-contract.md`): boss locked FREE-only
    providers, BROWSER-LOCAL keys, SELECTED-docs scope. Self-review vs skill
    gates: threat model, data classes, trust boundaries, auth, token handling,
    logging, retention/deletion, runbook, 7 go/no-go gates — all present.

- [ ] Slice: implement first AI document-chat capability
  - Acceptance: user selects documents, chooses approved provider/model, chats,
    and receives cited answers without exposing the key.
  - Verify: mocked provider tests plus approved live-provider test only after
    boss supplies credentials and authorizes use.
  - Files: `backend/`, `frontend/src/`
