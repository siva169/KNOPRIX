# Knoprix Final Project — Changes

## 2026-09-16 — Replaced Supabase S3 gateway with native Storage REST API

- Root cause evidence: the deployed backend failed in `put_object` with
  botocore's empty `ClientError` (no code, no message) — Supabase's S3
  gateway returned a response botocore cannot parse. In the newest deploy
  the S3 environment variables were absent, so uploads silently fell back
  to Render's ephemeral disk: the API returned 201 while files were wiped
  on every restart.
- Replaced the boto3 client with Supabase's native Storage REST API using
  stdlib `urllib` only (no new dependencies): POST upload streamed from
  disk with exact Content-Length, GET download, DELETE, GET streaming for
  the reader, and percent-encoded object keys so filenames with spaces
  survive the URL.
- Config simplified to three variables: `OBJECT_STORAGE_ENDPOINT` (project
  URL; also accepts `/storage/v1` or the old `/storage/v1/s3` form),
  `OBJECT_STORAGE_API_KEY` (service_role secret), `OBJECT_STORAGE_BUCKET`.
  Region and S3 access/secret key variables removed.
- Failures are now explicit: every storage HTTP error raises `StorageError`
  with the status code and the server's response body, replacing botocore's
  empty error.
- Removed `boto3` from requirements.
- Verification: 9/9 checks in `backend/qa_storage_rest.py` (fake Storage
  server over real HTTP: streamed upload byte-exactness, Bearer + apikey
  headers, download round-trip, stream reassembly, delete, 404 mapping,
  missing-key error, `/s3` endpoint normalization, space-containing keys);
  6/6 `qa_smoke.py` against a fresh database booted from the updated
  requirements; `compileall` clean.

## 2026-09-15 — Hardened Supabase S3 request compatibility

- Normalized a pooler hostname accidentally supplied as the storage region so
  signing uses the embedded AWS region instead.
- Added explicit upload length and disabled payload signing for Supabase's S3
  gateway while retaining SigV4 and path-style requests.
- Verification: backend compilation, region normalization checks, and
  `git diff --check` passed.

## 2026-09-15 — Use direct S3 PutObject for Supabase uploads

- Replaced boto3's high-level transfer manager with a direct `PutObject`
  request for document uploads.
- Kept path-style addressing, SigV4 signing, and optional checksum behavior
  disabled for compatibility with Supabase Storage's S3 endpoint.
- This removes the multipart/transfer wrapper from the failing upload path,
  while preserving content type metadata and the existing storage interface.

## 2026-09-15 — Disabled unsupported S3 upload checksums

- Configured boto3 to calculate request and validate response checksums only
  when the S3 operation requires them.
- This avoids checksum headers that Supabase Storage rejects during `PutObject`
  while preserving path-style addressing and checksum behavior for AWS APIs
  that explicitly require it.
- Verification: storage module compilation, boto3 `Config` construction, and
  `git diff --check` passed.

## 2026-09-15 — Fixed Supabase S3 upload addressing

- Configured boto3 to use path-style S3 addressing, which is required for
  reliable requests through the Supabase Storage S3 endpoint.
- Kept the change provider-neutral so other S3-compatible endpoints continue
  using the same storage boundary.

## 2026-09-15 — Prepared Supabase Storage and Render/Vercel configuration

- Updated the S3-compatible storage documentation and environment template for
  Supabase Storage.
- Added provider-neutral `s3://` document URIs while retaining compatibility
  with existing `r2://` records.
- Updated the Render blueprint to keep database and storage credentials as
  Render-managed secrets.
- Replaced the Oracle/Neon/R2 deployment guide with the Render, Vercel, and
  Supabase deployment workflow.

## 2026-09-15 — Prepared Oracle Always Free deployment foundation

- Added optional S3-compatible document storage with Cloudflare R2 support.
- Uploads use local disk in development and `r2://` object keys in production;
  PDF streaming, PPTX extraction, and document deletion work through the same
  storage boundary.
- Added strict object-storage configuration validation and a safe
  `backend/.env.example` containing placeholders only.
- Added a production Dockerfile and Oracle-oriented Docker Compose file.
- Replaced the stale deployment guide with the Oracle VM, Neon, R2, HTTPS,
  frontend, verification, and rollback workflow.
- Preserved local SQLite and local uploads as the default development path.
- Verification: backend `compileall` and frontend production build passed;
  the existing `pdfjs-dist` eval warning remains unrelated.

## 2026-09-14 — Added persistent precise-highlight preference

- Added an annotation-menu setting named `Highlight all matching occurrences`.
- The setting is disabled by default, so a new highlight paints only the
  selected occurrence instead of every matching word in the document.
- The preference persists in browser-local storage and can be enabled again
  when a user intentionally wants all matches.
- Existing saved highlights keep their stored behavior; changing this setting
  affects new highlights only.
- Verified with the frontend production build and the live reader toolbar.

## 2026-09-14 — Fixed PPTX reader crash from annotation range merge

- Root cause: the previous overlapping-highlight fix referenced
  `mergedPaintRanges` from `TextShape` even though it had accidentally been
  declared inside the unrelated `runSegments` helper.
- Moved the range merge into `TextShape`, where `paintRanges` is built, and
  restored `runSegments` to its table-cell rendering responsibility.
- This prevents `mergedPaintRanges is not defined` from crashing the reader
  when a PPTX contains text shapes.
- Verification: frontend production build and live PPTX reader reload.

## 2026-09-14 — Added approved Okular-inspired reader navigation

- Added compact first/previous/current/next/last page controls to the reader
  toolbar.
- Added explicit Browse and Text Selection modes.
- Added an annotation picker matching the supplied references with yellow and
  green highlighters, underline, strikethrough, inline text, inline note, and
  pop-up note entries plus visible keyboard shortcuts.
- Added a PDF thumbnail rail that renders small page previews and jumps to the
  selected page.
- Added Single Page and Continuous view-mode menus while preserving existing
  reader state, bookmarks, highlights, chat, print, and focus controls.
- Kept unsupported annotation persistence honest: currently persisted
  annotations remain highlights/bookmarks; selecting an unsupported annotation
  tool reports that its editor is not yet available for the document type.
- Verified with `npm run build` and `python -m compileall -q backend/app`.

## 2026-09-14 — Completed authenticated gold palette rollout

- Replaced the remaining warm-brown authenticated surfaces with near-black
  charcoal values matching the login screen.
- Removed amber utility accents from the sidebar, navbar, reader fallback,
  slides, chat status, and selection actions; those surfaces now use the
  shared champagne-gold tokens.
- Confirmed the original orange appearance was caused by a stale Vite process
  retaining the previous Tailwind-generated stylesheet. Restarted the local
  frontend on port 5173 and verified the live computed surface color is
  `rgb(9, 10, 12)`.
- Rechecked the live dashboard screenshot after restart. The intentional
  orange document-highlight option and unused legacy component comment were
  left unchanged.

## 2026-09-14 — Added continue-reading dashboard state

- Added a real continue-reading ledger sourced only from browser-local page
  progress; documents without saved progress stay out of the section.
- Shows the most recently updated documents, bounded page progress, and a
  direct resume action that reuses the reader's existing restoration flow.
- Labels the state as local device memory so users understand its scope.
- Verified in-browser with a real saved document state showing page 2 of 5 and
  40% progress; responsive widths 390, 425, 768, and 1024 had no horizontal
  overflow.

## 2026-09-14 — Added safe Undo feedback for highlight removal

- Extended the existing toast status surface with an optional Undo action.
- Highlight deletion now offers a real restoration path through the existing
  highlights API; failed restoration is reported instead of being swallowed.
- Kept Undo scoped to this safe, fully reconstructable action rather than
  implying unsupported rollback for destructive operations.
- Verified with `npm run build`; the existing `pdfjs-dist` eval warning remains
  unrelated.

## 2026-09-14 — Added reversible reader focus mode

- Added a reader-only focus mode that removes the navbar and folder rail while
  preserving the active document, page, zoom, bookmarks, and highlights.
- Added an accessible toolbar toggle and Escape-to-exit behavior; the normal
  shell returns without resetting reader state.
- Verified with `npm run build`; the existing `pdfjs-dist` eval warning remains
  unrelated.

## 2026-09-14 — Added keyboard-first command palette

- Added a real `Ctrl/Cmd+K` command palette with focus management, Escape
  close, arrow-key navigation, Enter activation, and an accessible modal
  dialog/listbox structure.
- Wired the palette to actual project documents and existing upload, bookmark,
  and index-visualizer actions; it does not fabricate results.
- Added a visible desktop entry point in the authenticated navbar while
  preserving the existing full-text search field.
- Verified with `npm run build`; the existing `pdfjs-dist` eval warning remains
  unrelated.

## 2026-09-14 — Added local reading progress and resume position

- Persisted each document's current page and total-page snapshot in browser
  storage, keyed by document ID, so reopening or reloading resumes safely.
- Restored saved positions with page bounds clamped to the current document and
  removed malformed stored entries instead of allowing them to break the
  reader.
- Added a restrained desktop-only reading percentage to the reader toolbar;
  mobile keeps the existing compact controls.
- Verified with `npm run build`; the existing `pdfjs-dist` eval warning remains
  unrelated.

## 2026-09-14 — Started authenticated gold reader redesign

- Added the approved reader redesign contract at
  `docs/reader-gold-redesign-spec.md`, including responsive acceptance criteria,
  reversibility requirements, and researched interaction sources.
- Replaced the authenticated app's orange/saffron tokens with the restrained
  gold system from the login screen: charcoal surfaces, ivory content, and
  pale-gold active/focus signals.
- Removed the login-only `BLACK MIRROR / 04` label from the top-right corner.
- Verified the frontend build and a localhost browser reload with no console
  errors. Reader behavior is unchanged in this first visual-token slice.

## 2026-09-14 — Added login credential autocomplete metadata

- Added `autocomplete="email"` and `autocomplete="current-password"` to the
  login fields so browsers and password managers can identify them correctly.
- Verified on localhost: the login warning disappeared, demo login reached the
  dashboard, and no browser errors were reported.

## 2026-09-14 — Fixed dashboard loading race on reload

- Kept the dashboard skeleton visible while the selected project's documents
  are loading, preventing a false `00 files` empty state during the API request.
- Verified on localhost: reload shows `Loading dashboard` first, then the
  selected project's real `13 files`; the frontend build passes.

## 2026-09-12 — Simplified active authentication screens

- Updated the live-project KNOPRIX wordmark to 18px.
- Removed the login footer strip and its editorial/team-style copy.
- Removed the registration DSA-powered tagline and set its heading to 18px.
- Applied this fix to `knoprix-final-project`, the project served on port 5173.

## 2026-09-12 — Fixed misleading login error + backend-down diagnosis (Bruce)

- Boss screenshot: correct demo creds showed "Login failed. Check your
  credentials." Root cause (proven by curl): backend on :8000 was DOWN, and
  the catch-all message blamed the credentials. Demo account itself verified
  working (200 + tokens, user Alex Mercer).
- Fix in `LoginPage.jsx` (login screen only): no-response AND proxy-HTML
  responses (Vite dev proxy answers 500 with an HTML page when :8000 is
  down — caught live during QA) now show "Can't reach the server. Start the
  backend on :8000 first, then try again." Real JSON errors (401 "Invalid
  email or password") still show truthfully.
- Verified in a real browser: wrong-password path shows the 401 text, killed-
  backend path shows the unreachable text, full `qa-goldauth.mjs` still
  45/45, `npm run build` pass. Backend restarted (SQLite, seed ran) and left
  running on :8000 — boss can log in now with demo@knoprix.io /
  Password123! (type by hand; no shortcut, per boss).

## 2026-09-12 — Black Mirror login (boss image ref 04, Anurati headline) (Bruce)

- Boss supplied the "04 / BLACK MIRROR" reference image and picked: breathe +
  follow-cursor mirror, NO passkey link, NO demo-fill button, Anurati font on
  the headline. Login only — RegisterPage untouched.
- `frontend/public/fonts/Anurati-Regular.otf` (copied from boss's
  `siva169-profile/assets/fonts/`, 8KB) + `@font-face` + `.font-anurati`
  utility in `index.css`. Headline "Enter quietly." renders in Anurati.
- New `BlackMirror.jsx`: black core with cursor-sliding sheen, thin gold ring
  + faint outer ring, 7s breathing scale, eased cursor parallax (GPU
  transforms, one rAF, CSS vars — same cheap pattern as GoldOrbs).
  `prefers-reduced-motion` disables the breathing. (Fixed own bug pre-QA:
  scale keyframes would have overridden the cursor translate — split onto
  nested elements.)
- Rewrote `LoginPage.jsx`: KNOPRIX wordmark + gold rule, BLACK MIRROR / 04
  tag, Anurati headline, EMAIL/PASSWORD dark fields, gold SIGN IN pill,
  quiet Create-account link (kept — only way to reach register), mirror +
  NO DISTRACTIONS caption, 04 footer strip. Auth logic identical. No passkey,
  no demo-fill, per boss.
- Verified: `npm run build` pass; `qa-goldauth.mjs` **45/45** at 390/768/1024
  incl. mirror visible, demo-fill/passkey absent, zero JS errors; font URL
  serves HTTP 200. Evidence `qa-artifacts/knoprix-gold-auth/` (gitignored).

## 2026-09-12 — Completed gold-theme auth (RegisterPage parity with LoginPage) (Bruce)

- RegisterPage was still on the old orange theme (ember canvas, primary/accent)
  while LoginPage had moved to gold (GoldOrbs + gold-glass card). Rewrote
  RegisterPage to mirror LoginPage: same `#0a0603` bg, GoldOrbs, K-mark,
  REGISTER tracking heading, gold inputs with labels, gold pill button,
  matching error card + footer divider. Logic untouched (register call,
  minLength 8); added password show/hide for parity (fix #16).
- Verified: `npm run build` pass (pre-existing pdfjs eval warning only);
  Playwright `frontend/qa-goldauth.mjs` **36/36** — login + register at
  390/768/1024, no h-overflow, zero JS errors. Evidence
  `qa-artifacts/knoprix-gold-auth/` (6 PNGs, gitignored).
- Note: `InteractiveBackground.jsx` is now unused (no imports). Left in place
  per surgical-change rule — say the word and it gets deleted.
- Unrelated uncommitted work left untouched: `database.py` legacy-name cleanup,
  `graph.py` glue words, `KnowledgeMap.jsx` Escape-close.

## 2026-09-11 — Implemented the foundation shell slice (Bruce)

### What was done
1. Loaded skills before coding: `frontend-management`, `react-best-practices`,
   `frontend-dev-guidelines` (its MUI/TanStack parts don't apply to this
   Tailwind project — universal rules were applied instead).
2. Read the full shell source first (App.jsx, contexts, Navbar, Sidebar,
   auth pages, index.css, index.html) and identified three real gaps — no
   scope creep beyond them.
3. **ErrorBoundary** (`frontend/src/components/ErrorBoundary.jsx`): class
   component with on-brand fallback (Try again / Reset session). Wired at the
   root in `main.jsx` and around the main content region in `App.jsx` so a
   viewer/dashboard crash can no longer white-screen the app.
4. **Skip-to-content link** + `main#main-content` landmark in `App.jsx`
   (polish checklist #11, keyboard a11y).
5. **Head hygiene** in `index.html`: added meta description (fix #2), added
   `public/favicon.svg` matching the K brand mark (fix #3), and removed the
   unused Inter/Outfit/JetBrains Mono Google-Fonts import (real fonts are
   Space Grotesk + IBM Plex Mono loaded via `index.css` — verified by code
   search that zero components used the other three).
6. Restored the backend dev environment: system Python 3.14 upgrade had wiped
   the previous global FastAPI/uvicorn install (verified). Boss approved a
   local `.venv` created from `requirements.txt` (gitignored).
7. Fixed an own bug pre-commit: ErrorBoundary initially hardcoded guessed
   token key names; corrected to import the real `ACCESS_KEY`/`REFRESH_KEY`
   constants from `api.js` (`knoprix_mr_*`).

### Verification
- `npm run build` passes (same pre-existing pdfjs eval warning only).
- Playwright QA (`frontend/qa/foundation-shell.spec.mjs`): **10/10 checks** —
  no horizontal overflow at 390/425/768/1024px, title, meta description,
  favicon served (HTTP 200), zero unexpected console errors on the real app,
  and a forced render crash caught by the ErrorBoundary with the recovery
  screen rendered (harness page, real component).
- Backend smoke (`backend/qa_smoke.py`): **9/9 checks** — health, demo login,
  /auth/me, projects, documents (10 docs), Trie autocomplete, inverted-index
  search, bookmarks, 401 auth guard.
- Evidence: `qa-artifacts/knoprix-foundation-shell/` (screenshots +
  results.json; folder gitignored).
- Commits: `ab88f5a` (foundation shell slice, 9 files) and the qa_smoke.py
  test commit, both as `siva169 <tvssphanindra@gmail.com>` (identity
  disclosed and approved per Rule 038). Local only, no push.
- Stale `tasks/todo.md` checkboxes updated with evidence dates.

### Honest notes
- The first backend boot appeared hung; it was a slow cold start (~15 s) and
  resolved without changes — health returned 200 afterwards.
- `vite preview` serves `dist/` only and cannot transform the JSX crash
  harness; the harness runs on a dev server (port 5176) instead. QA servers
  were stopped after evidence capture.
- QA smoke hit the copied mid-review DB (`knoprix.db`, 10 seeded docs);
  read-only checks except the demo login itself.

## 2026-09-09 — Made all reference links clickable (md + HTML version)

- Converted the 124 bare URLs in `UI-UX-updated.md` into titled markdown
  links (`[site › section](url)`), so they are clickable in any markdown
  preview. Zero bare URLs remain; original `UI-UX.md` untouched.
- Generated `UI-UX-updated.html`: a standalone, no-dependency page that opens
  directly in the browser with a jump-list of all 50 components (mobile
  collapsible list below 900px, sticky sidebar at 900px+), each reference one
  click away in a new tab.
- Verification: Chrome headless DOM dump shows 100 TOC anchors (2 navs x 50
  components); screenshots captured at 390x844 and 1280x900 show rendered
  content (Rule 018 evidence kept in `../AI-Rules-temp/uiux_links/`).
- Regeneration script kept at `../AI-Rules-temp/uiux_links/build_uiux.py` —
  re-run it after editing the markdown to rebuild the HTML.

## 2026-09-09 — Created isolated rebuild baseline

- Created `knoprix-final-project/` inside AI-Rules.
- Copied the current Knoprix source baseline without `.git`, dependency caches,
  generated build output, local database files, or uploaded documents.
- Preserved the existing backend behavior as the starting contract.
- Added the approved capability map, PRD, implementation plan, task list, and
  UI/UX component inventory.
- Approved AI direction: Z.AI GLM and OpenAI-compatible cloud providers,
  user-owned keys, encrypted backend storage, model allowlist, selected-document
  scope, and explicit provider privacy notice.
- No provider key was created, requested, stored, or used.

## 2026-09-09 — Verified frontend baseline and selected first UI surface

- Installed frontend dependencies with the existing lockfile using
  project-local `npm ci`.
- Production build passed with the existing `pdfjs-dist` eval warning.
- npm reported 6 dependency vulnerabilities (1 moderate, 4 high, 1 critical).
  No automatic audit fix was run because that could introduce breaking
  dependency changes and requires a separate review.
- Boss selected `DashboardOverview` as the first UI/UX surface.
- The full frontend component inventory remains in `UI-UX.md`; screenshot
  references are still pending boss input.

## Verification planned

- Backend health and Python compilation.
- Frontend production build.
- Browser and responsive checks after boss approves UI/UX decisions.

## 2026-09-09 — Implemented the first dashboard vertical slice

- Added `DashboardOverview` as the authenticated landing surface instead of
  auto-opening the first document.
- Used the approved editorial research-cockpit direction: project-first
  hierarchy, asymmetric reading ledger, line-separated metrics, and real
  loading/empty states.
- Boss selected `Space Grotesk + IBM Plex Mono`; added the pairing through CSS
  font variables without adding a dependency.
- Preserved explicit document navigation from the dashboard into the existing
  reader.
- Added a local comparison page at `frontend/public/font-preview.html` for the
  four candidate font pairings.
- Restored the API client's explicit Bearer authorization syntax in the copied
  baseline and verified the production build.

## 2026-09-09 — Completed responsive dashboard QA

- Installed Playwright locally in `frontend` and downloaded Chromium for
  browser verification.
- Started the rebuilt frontend on `5175` and backend on `8011` without
  touching the existing Knoprix server on `5173`/`8000`.
- Verified demo login, dashboard rendering, and the empty-project document
  state with no browser console errors.
- Verified viewport widths `390`, `425`, `768`, and `1024`: no horizontal
  overflow, correct dashboard heading, and stable page layout.
- Verified the mobile folder sidebar opens and closes through the `Toggle
  folders` control.
- Captured evidence in `../qa-artifacts/knoprix-dashboard/`.
- The isolated QA backend required `CORS_ORIGINS=http://127.0.0.1:5175`;
  this was a test-port runtime setting, not an application-code change.

# 2026-09-14 — Portable PDF resolution and workspace rail

- Fixed document streaming for database rows containing Windows paths when the API runs on Linux; the resolver now normalizes separators before checking the portable uploads directory.
- Replaced the flat sidebar emphasis with a context-aware workspace rail: project switcher, Continue reading, Saved sources, and a clearer source index.
- Research basis: Material Design navigation principles, WAI-ARIA navigation expectations, Apple HIG hierarchy, and the product-specific reader contract in `docs/reader-gold-redesign-spec.md`.
- Verification target: the known Neon PDF stream must return 200 when its binary exists in `backend/uploads`; otherwise the UI must continue to present the extracted text honestly.

# 2026-09-14 — Collapsible workspace rail

- Added a persistent desktop collapse control to the workspace sidebar.
- Collapsed mode preserves project switching and utility actions as an accessible icon rail with labels available through tooltips and ARIA names.
- Mobile navigation remains an expanded drawer so document names and touch targets stay usable.

# 2026-09-14 — Evidence-backed knowledge graph

- Added source-grounded concept evidence to the graph API: each concept now includes short excerpts and exact page numbers from the stored document pages.
- Upgraded the graph selection panel from a document list to an evidence workflow with page-level source links.
- Selecting an excerpt opens the existing reader at that document/page and preserves the concept as the reader context.
- Preserved original page-text casing for evidence excerpts while keeping the lowercased lookup text used by search and graph matching.

# 2026-09-14 — Explicit bookmark removal and slide highlight fix

- Page bookmark controls now clearly switch to `Remove` with an accessible removal label when a page is saved.
- Bookmark drawer deletion is always reachable on touch and desktop, rather than appearing only on hover.
- Merged overlapping slide highlight ranges so a phrase and word highlight cannot paint duplicate text.
