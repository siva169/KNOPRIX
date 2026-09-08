# Knoprix Final Project — Tasks

- [ ] Baseline: verify copied backend and frontend independently
  - Acceptance: health endpoint responds and frontend build passes.
  - Verify: backend smoke check and `npm run build`.
  - Files: `backend/`, `frontend/`

- [ ] Contract: approve DashboardOverview UI/UX decisions
  - Acceptance: `UI-UX.md` has selected layout, navigation, states, and
    responsive behavior for the dashboard.
  - Verify: boss approval recorded in `UI-UX.md`.
  - Files: `UI-UX.md`

- [ ] Slice: implement approved foundation shell
  - Acceptance: signed-in and signed-out shells work at all required widths.
  - Verify: browser verification at 390/425/768/1024px.
  - Files: `frontend/src/`

- [ ] Slice: preserve and verify core backend routes
  - Acceptance: current authentication, project, document, search, DSA,
    bookmark, and highlight behavior remains available.
  - Verify: focused API smoke tests.
  - Files: `backend/app/`

- [ ] Spec: design BYOK provider security contract
  - Acceptance: key storage, authorization, allowlist, privacy notice, limits,
    deletion, and provider errors are specified.
  - Verify: security review before implementation.
  - Files: `docs/`

- [ ] Slice: implement first AI document-chat capability
  - Acceptance: user selects documents, chooses approved provider/model, chats,
    and receives cited answers without exposing the key.
  - Verify: mocked provider tests plus approved live-provider test only after
    boss supplies credentials and authorizes use.
  - Files: `backend/`, `frontend/src/`
