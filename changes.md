# Knoprix Final Project — Changes

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
