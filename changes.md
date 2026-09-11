# Knoprix Final Project — Changes

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
