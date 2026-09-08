# Knoprix Final Project — Changes

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
