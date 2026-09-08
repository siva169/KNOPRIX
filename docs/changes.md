# 📝 Knoprix — Mid Review Build · Change Log

## Sep 09, 2026 — Replaced bookmark Stack with Hash Table + Doubly Linked List

### What changed

- Added `backend/app/dsa/bookmark_collection.py`, combining a hash table
  (`bookmark_id → node`) with a doubly linked list ordered newest-first.
- Rewired bookmark listing and DSA statistics to use the collection.
- Preserved arbitrary bookmark deletion by ID while keeping newest-first
  ordering.
- Added microsecond-precision UTC timestamps when creating bookmarks so rapid
  inserts cannot be misordered by SQLite's second-level default timestamp.
- Updated frontend labels, API metadata, README, workflow documentation, and
  DSA descriptions to remove the inaccurate Stack/LIFO claims.
- Kept the legacy `dsa/stack.py` file untouched; it is no longer imported by
  bookmark code and was not deleted.

### Verification

- Local backend health endpoint passed.
- Focused collection checks passed.
- Local API test passed: create three bookmarks → `[3, 2, 1]`, delete the
  middle bookmark by ID → `[3, 1]`, DSA stats expose `bookmarkCollection`.
- Frontend `npm run build` passed.

**Date:** Aug 12, 2026
**Status:** ✅ Built & verified (backend API-tested, frontend builds clean)

---

## Purpose

Mid-semester review build of the DSA project. Shows **~50% of the project**:
3 of 5 data structures live, no AI agent, no read-aloud. The completed project
lives on as `../knoprix-v2` — this folder is the review copy.

## What changed vs. knoprix-v2

### 🧠 Scope (per user instructions)
| Removed | Kept |
|---|---|
| AI agent chat (GLM) + chat history | **Stack** → bookmarks (visual LIFO) |
| Read-aloud (speechSynthesis) | **Trie** → autocomplete search |
| Knowledge Graph (DSA) | **Inverted Index** → ranked full-text search |
| Min-Heap (DSA) | Auth, projects, documents, PDF viewer, upload, themes |

### 🔶 UI/UX — orange Saraswati study theme (user request)
- Full re-theme: **saffron `#f97316` / amber `#f59e0b`** on deep warm charcoal
  `#170d06`, cream ivory `#fff7ed`, aurora gradients, Outfit display font,
  light/dark remaps in `index.css`
- Right AI panel removed → **full-width document viewer** (user choice)
- DSA modal reduced to **3 animated cards** (user choice): Trie / Inverted
  Index / Stack + top-keyword cloud
- No AI-slop layouts — glass panels, layered depth, micro-interactions

### 🆕 New features (user request)
1. **Per-page bookmarking** — "Bookmark page" button on every rendered PDF page
   (top-left), in the PDF toolbar, and in text viewers. `bookmark_type='page'`.
2. **Visual LIFO Stack drawer** — animated push/pop, top-of-stack highlight
   ("TOP · pop() returns this"), POP button, depth counter, O(1) legend.
3. **Inverted Index search in the navbar** — type a phrase → ranked results
   with snippets + scores, click to open the document. Single words still use
   the Trie autocomplete.
4. **DOCX parsing** — new `extract_docx` (python-docx) in `pdf_parser.py`
   (paragraphs + tables). PPTX / PDF / TXT / MD supported as before.

### 🔧 Backend
- `dsa/stack.py` — **new** pure-Python LIFO Stack (push/pop/peek/size)
- `routers/bookmarks.py` — bookmarks served through the Stack class; create =
  push, delete = pop; response includes `stack` meta (size, isEmpty, top)
- `routers/dsa.py` — stats now report trie / invertedIndex / stack only
- `services/indexer.py` — builds Trie + Inverted Index only (graph/heap gone)
- `database.py` — dropped `chat_history` table + graph/heap columns; added
  `bookmark_type` column
- Removed: `routers/chat.py`, `services/ai.py`, `dsa/knowledge_graph.py`,
  `dsa/min_heap.py`; GLM config removed; `httpx` dropped from requirements
- Fresh `.env` with random JWT secrets (no API keys needed)

### 🎨 Frontend
- Removed: `AIChatPanel.jsx`, `ReadAloudPlayer.jsx`, tts state, chat toggle
- `Navbar.jsx` — search dropdown (Trie suggestions + Inverted Index results)
- `BrowserPDFViewer.jsx` / `PDFToolbar.jsx` — per-page bookmark buttons,
  bookmarked-page tracking, no read-aloud
- `BookmarksDrawer.jsx` — visual stack (see above)
- `DSAStatsModal.jsx` — 3 cards + "final review" roadmap note
- Copy updated everywhere ("AI-powered" → "DSA-powered")

## ✅ Verification

**Backend — 16/16 live API tests pass**
- Health, login, projects, seeded docs (SDC Grok 20p PDF, Spectrum PPTX 16s)
- Trie autocomplete (`stru` → structure), Inverted Index search with scores
- DSA stats: 3 structures (1,510 keywords, stack meta)
- Stack: push text + push page bookmark, list w/ top = page 3, pop → size 1
- Attacker → other user's docs: **404 blocked**

**Frontend**
- `npm run build` clean (no errors) ✓
- Bundle: viewer lazy-loaded, 360 KB main / 344 KB viewer

---

## Fix round 2 — PDF loading, interactive login, mobile polish

**Date:** Aug 12, 2026 (evening)
**Status:** ✅ Fixed & verified

### Why files wouldn't load (found via server logs)
1. **Stale tokens from the old project** — the original knoprix-v2 stores JWTs under
   `knoprix_access_token` in localStorage. If a browser had visited the old app,
   those same keys were sent to the mid-review backend → 401 on load → nothing loaded.
   **Fix:** renamed token keys to `knoprix_mr_access_token` / `knoprix_mr_refresh_token`
   (exported from `api.js`, used in AuthContext + BrowserPDFViewer). A hard refresh
   (Ctrl+Shift+R) clears the old keys.
2. **pdf.js worker loaded from cdnjs CDN** — slow/blocked on many networks; if it
   fails, NO PDF pages render. **Fix:** bundled the worker locally
   (`frontend/public/pdf.worker.min.js`, copied from node_modules) and pointed
   `workerSrc` at `/pdf.worker.min.js`. Verified it is served in dev and shipped in
   `dist/`. PDF rendering is now fully offline.
3. Cleaned a leftover test file (`fake.doc`) from uploads + reseeded a clean DB
   (5 documents: SDC 20p, Section 2 63p, A-dsa 7p, Spectrum PPTX 16s, Sinusoids 20s).

### Interactive login background (new)
- `components/InteractiveBackground.jsx` — canvas of drifting **warm embers** that
  gently follow the cursor + a soft orange glow trailing the pointer. Theme-aware,
  pauses on hidden tab, respects `prefers-reduced-motion`, DPR-capped, fully
  cleaned-up listeners. Used on Login + Register pages.
- Auth cards upgraded: gradient accent line, floating logo, hover-lift buttons,
  focus-glow inputs, vignette for depth.

### Mobile compatibility — confirmed & polished
- App was already responsive (sidebar hamburger <lg, modals max-w, drawer full-width)
- **PDF toolbar** now scrolls horizontally on narrow screens (`overflow-x-auto`,
  shrink-0 groups) instead of overflowing
- Navbar search input `min-w-0`; **Enter key** now runs full-text search too
- Global `:focus-visible` rings for keyboard users

## Notes / follow-ups
- Old knoprix-v2 remains untouched as the full project (for the final review)
- Truly scanned PDFs (no text layer) still fall back to OCR-mode preview
- The `yt_learn/` transcripts are AI/agentic talks (Andrew Ng, LangChain), not the
  Figma UI course — if you find that link, share it and the theme can be tuned to match

---

## Git management enabled (user rule 010)

**Date:** Aug 12, 2026

Per the user's standing rule (suggestion 010 — internal git management), this
project is now version-controlled and work will proceed **feature by feature**
with a commit per verified feature:

- `git init` + local identity set (`Knoprix Bot <knoprix@local>`)
- `.gitignore` verified: `.env`, `.venv/`, `node_modules/`, `dist/`, `*.db`,
  `__pycache__`, logs — none staged ✓
- **Commit 1 (1089b69)** — Initial checkpoint: mid-review build (3 DSA
  structures, orange theme, PPTX slide viewer, interactive login)

Local ops only (init/add/commit/branch/checkout/revert). Pushing to a remote
or deploying still requires explicit user approval.

---

## Fix round 3 — Design Course (Gary Simon) polish pass

**Date:** Aug 12, 2026
**Status:** ✅ Applied & verified

Researched the **Design Course** YouTube channel (Gary Simon — 'Learn UI Design
7 Fundamentals', Figma UI/UX crash courses, glassmorphism & dashboard tutorials)
and applied its rules to the app:

- **Glassmorphism recipe** — panels now use a more translucent fill (0.66 alpha),
  stronger 1px light border, a 1px top-edge light-catch highlight and a soft
  diffused shadow. Glass is reserved for navbars/panels/drawers/modals; the DSA
  stat cards went solid (`bg-midnight-panel/85`) so the modal pops (no
  glass-on-glass).
- **Desaturated dark-mode accents** — the aurora background gradients were
  softened (0.32→0.24 / 0.24→0.18 alpha) so bright oranges glow comfortably
  instead of burning the retina.
- **Scale & hierarchy** — DSA metric numbers bumped to `text-4xl` with a warm
  `text-glow` (dashboard-style hero metrics); auth headline to `text-3xl`;
  section labels use the Outfit display font.
- Kept: 8px-ish spacing rhythm, Inter/Outfit/JetBrains Mono type pairing,
  meaningful motion (counters, stack push/pop, hovers).

---

## Fix round 5 — login shows saved files + vivid interactive login background

**Date:** Aug 12, 2026
**Status:** ✅ Applied & verified (browser check passed, 0 console errors)

### Bug: no files visible after login until creating/uploading
**Root cause:** `fetchProjects()` was only called after *creating* a project or
*uploading* — never on login, so the saved projects/documents never loaded.

**Fix (App.jsx + AppContext.jsx):**
- On login → `fetchProjects()` immediately (with error handling + toast).
- Auto-select the project with the **most documents** (`file_count`), so the
  demo always lands on a folder with real files, then **auto-opens its first
  document** — login now shows content instantly, nothing to click.
- New `resetWorkspace()` clears all state on logout so sessions never leak.
- Auto-open is guarded by `autoOpenedRef` (once per login, resets on logout).

### Interactive login background (restored + upgraded)
The canvas was already wired but too subtle to notice (and possibly served
from a cached build). Upgraded so it's unmistakable:
- Denser, brighter ember particles (up to 150, larger radii, stronger glow).
- **Cursor spark trail** — tiny sparks follow the pointer while it moves.
- Stronger cursor glow (230px warm radial light).
- **Touch support** — the glow + sparks now follow a finger on mobile too.
- `mouseout` deactivates only when the pointer truly leaves the window
  (`relatedTarget === null`), so the glow doesn't flicker between elements.
- Lighter vignette on auth pages so embers show through.
- Reduced-motion still respected (static but visible frame); all listeners &
  rAF cleaned up; spark array capped at 150.

### Verification
- Frontend build clean; auto-select verified via API → picks **MSA (7 files)**.
- Automated browser check: canvas animates & reacts to mouse ✓, demo login ✓,
  dashboard loads with folders + viewer state ✓, **0 console errors** ✓.


**Date:** Aug 12, 2026
**Status:** ✅ Built & verified

### Why PPTX looked like plain text
python-pptx only extracts slide *text* — the app showed it as a text document
instead of the actual slides.

### The fix — real slide rendering (no LibreOffice needed)
- **Backend:** `extract_pptx_slides()` rebuilds every slide from shape data:
  text boxes (fonts, sizes, colors, bold/italic, alignment, bullet levels,
  vertical anchor), solid-fill shapes, pictures (base64), tables, rotation,
  slide background — positions as percentages, font sizes in points.
  New endpoint `GET /api/documents/{id}/slides` (auth + ownership).
- **Frontend:** new `SlideViewer.jsx` renders slides on a design layer where
  1pt = 1px, auto-fits the container (ResizeObserver) with zoom support,
  continuous/single view, and full integration: page nav in the toolbar,
  per-slide bookmark buttons (push to the Stack), text selection + copy /
  bookmark highlights, light/dark aware. Falls back to the text view on error.
- Verified: Spectrum deck (16 slides, 720x405pt, blue bg, 5x5 table) and
  SMART-AYUR deck (9 slides, 960x540pt, images) parse into clean slide JSON.

---

## Fix round 6 — Public deploy (Netlify + Render)

**Date:** Aug 12, 2026
**Status:** ✅ Deployed & verified end-to-end

### URLs
- Frontend: https://knoprixv2midreview.netlify.app
- Backend: https://knoprix-midreview-api.onrender.com
- Repo: https://github.com/siva169/knoprix-v2-midreview

### What was done
- Frontend API base made configurable: `src/config.js` reads `VITE_API_URL`
  and appends `/api` automatically; used by axios (baseURL + refresh) and the
  PDF stream URL.
- Backend CORS: `CORS_ORIGINS` env var + regex allowing any `*.netlify.app`
  origin, so the deployed frontend never hits a CORS block.
- Added `backend/asgi.py` (ASGI entry), `netlify.toml`, `render.yaml`
  (Render blueprint), and this DEPLOY guide.

### Bugs caught during deploy verification (each fixed + re-deployed)
1. Windows Compress-Archive zip wrote backslash paths → `assets/` folder was
   a literal filename → blank page. Fixed with a Python zip (forward slashes).
2. Deployed login called `…onrender.com/auth/login` (missing `/api`) → 404.
   Fixed by making API_BASE append `/api` automatically.

### Verified live (Playwright walkthrough)
- Login ✓ · MSA (8 files) auto-selected ✓ · document content renders ✓
- Trie autocomplete: "signal" → signal(62) signals(46) ✓
- Only console error: missing favicon (cosmetic).

---

## 🖍️ Highlight feature (Aug 17, 2026) — added after review

**Request:** when the user selects words in a document, show an extra
**Highlight** action (besides Bookmark / Copy) with **colour options** so the
selected words can be painted and saved — in PDFs, Word docs, and any text
files. Test locally first; deploy later only after user approval.

### What was built
- **Backend** (`backend/app/routers/highlights.py`, table in
  `backend/app/database.py`): a `highlights` table + 3 routes —
  `POST /api/highlights` (save), `GET /api/documents/{id}/highlights`
  (list per document/user), `DELETE /api/highlights/{id}` (remove).
  Highlights are a **separate feature from the bookmark Stack** — painting a
  passage never touches the Stack. 6 allowed colors: yellow, green, blue,
  pink, orange, purple (validated server-side).
- **Frontend palette** (`frontend/src/highlights.js`): `HIGHLIGHT_COLORS`
  (6 highlighter colors), `colorById`, `segmentsFor`, `highlightRanges`,
  `segmentsFromRanges` helpers.
- **Selection popover** (`BrowserPDFViewer.jsx`): now shows **Bookmark · Copy
  · Highlight**; clicking Highlight opens a **6-colour swatch row**; picking a
  colour saves the highlight. Popover is shared across PDF / text / slides.
- **Rendering:**
  - PDFs: `wrapOffsets` + `applyPageHighlights` wrap matching pdfjs
    text-layer spans in `<mark class="kn-hl">` with the colour wash; pages
    re-render when highlights change so marks appear/disappear live.
  - TXT / DOCX / MD (text viewer): `lineMarks` splits each line into
    highlighted / plain segments; multiple colours can coexist per line.
  - PPTX (SlideViewer): `segmentsFor` paints matches inside slide text.
- **Remove UX:** clicking a painted mark opens a small **Remove** popover
  (with colour chip + text preview); the toolbar also has an **Erase** toggle
  that lets you click marks to delete them directly.
- **CSS** (`frontend/src/index.css`): `.pdf-text-layer mark.kn-hl` (PDF wash,
  colour via `--hl-bg`) and `mark.kn-hl-plain` (text viewer & slides).

### Bugs caught & fixed during local verification (Playwright)
1. **Highlights vanished after reload** — the API returns snake_case
   (`page_number`) but the renderers expected `pageNumber`; the saved mark
   showed immediately (local state used camelCase) but never after a reload.
   Fixed by normalising the API payload in `refreshHighlights`.
2. **PDF/PPTX stream & slides 404** — pre-existing issue: document rows
   stored absolute `file_path`s from the old project location (`Downloads\`)
   after the folder moved to `AI-Rules\`, so `stream` and `slides` 404'd.
   Added `_resolve_path()` in `documents.py` — falls back to `UPLOAD_DIR` by
   filename when the stored path is stale. Fixes all existing documents, not
   just highlights.

### Verified locally (Playwright, against local servers)
- TXT: select text → popover (Bookmark/Copy/Highlight) → 6 swatches ✓
- Save yellow/blue/pink highlights ✓ · persist across reload ✓
- Click mark → Remove menu → deletes (DOM + DB) ✓ · Eraser toggle ✓
- PDF text-layer highlight (green) renders + persists + removable ✓
- PPTX slide highlight (pink) renders + removable ✓
- Frontend `vite build` clean · backend `py_compile` clean

**Deploy status:** ⏳ NOT deployed — awaiting user approval (per request).

### Follow-up fixes (same day, from user testing)
1. **Highlights saved but never painted on PDFs** — two causes fixed:
   - *Wrong page attribution:* selections made while scrolled in continuous
     mode recorded `currentPage` instead of the page actually selected (the
     text layer had no `data-page`). Added `data-page={pageNum}` to each text
     layer so `handleMouseUp` records the correct page.
   - *Exact-match too brittle:* long multi-line selections (and mid-word
     drags) never matched the text layer, so nothing painted. `applyPageHighlights`
     now tries a whitespace-insensitive exact match first (handles line breaks
     and spacing quirks like "Over view" vs "Overview"), then falls back to
     word-sequence matching (longest consecutive run of needle words, with
     partial-match tolerance on word edges) when punctuation differs.
2. **Text viewer**: `lineMarks` now uses longest word-run matching so a
   selection wrapping across two lines paints on both lines.
3. **Save normalization**: `saveHighlight` collapses newlines/spaces to a
   single space so stored text matches cleanly.
4. Verified live: user's own SDC-Grok.pdf highlights (a 150-word outline
   selection + a mid-word selection) now paint — 93% page coverage.

### Verified (Playwright)
- Cross-line selection on text file paints on both lines ✓
- PDF page attribution: new selection on page 2 saved as page 2 ✓
- Long 150-word selection paints as one block (whitespace-insensitive) ✓
- Mid-word start/end selections paint via word-run fallback ✓
- Frontend `vite build` clean

### Follow-up: slides (PPTX) multi-line highlights (same session)
- Slides previously matched highlights per text run with exact text, so a
  selection spanning several paragraphs (e.g. an author name block) saved but
  never painted. Added `matchSegments()` in `frontend/src/highlights.js`
  (whitespace-insensitive + word-run fallback, shared with the text viewer)
  and switched `SlideViewer` text shapes to **shape-level matching**: runs are
  joined, the selection is matched once against the whole shape, then painted
  ranges are clipped back to each run/paragraph.
- Verified live with the user's own highlights:
  - SMART-AYUR.pptx — multi-line name block (a/M.Dinesh Kumar/P.Satish/…)
    now paints across all name runs ✓
  - Medication Robot pptx — long one-line highlight paints ✓
  - Frontend `vite build` clean

### Follow-up: slide page attribution (same session)
- Marks appeared on the **title slide** instead of the slide they were made
  on: each slide wrapper had no `data-page`, so selections made while
  scrolling (continuous mode) recorded `currentPage` (1). Added
  `data-page={pageNum}` to the `SlidePage` wrapper — same fix as the PDF text
  layers.
- Verified live: selecting text on slide 2 of SMART-AYUR.pptx saved as
  page 2 and painted on slide 2 ✓ (frontend build clean)

### Follow-up: two highlight modes — precise vs all matches (same session)
- New `match_all` column (migrated automatically on startup) + `matchAll` in
  the create-highlight API.
- The colour picker now has a **"Highlight all matches"** toggle: OFF =
  paint only the selected text (first occurrence), ON = paint every
  occurrence on the page/slide.
- Rendering per mode:
  - PDF `applyPageHighlights`: loops all occurrences when `matchAll`, first
    only otherwise.
  - Slides `matchSegments(text, needle, all)` + TextShape: every occurrence
    per shape when `matchAll`.
  - Text viewer `lineMarks`: precise paints the first matching line only;
    all-matches paints every occurrence on every line.
- The mark remove menu shows an **ALL** chip for all-matches highlights.
- Verified live (repeats test file): precise "signal" → 1 mark; all-matches
  "signal" → 6 marks (every occurrence), persists after reload, ALL badge
  visible on the remove menu. Frontend + backend builds clean.

---

## Follow-up session: user-reported fixes + search details + mobile (Aug 17)

The user gave 10 items (6 bugs, 1 search upgrade, 1 login bug, 3 explanation
requests). Fixes first, then docs. **No changes to `dsa/trie.py`,
`dsa/inverted_index.py`, `dsa/stack.py`** — the three data-structure files are
untouched, per user instruction.

### Fix: TXT bookmark + zoom + drawer refresh + PDF clarity + page nav
- **TXT bookmark**: selection popover → Bookmark now posts correctly and
  `saveBookmark` calls `fetchBookmarks` so the Bookmarks drawer (LIFO stack)
  updates **without a page reload** (verified: stack 3 → 4 live).
- **TXT zoom**: zoom buttons previously only scaled PDFs; the text viewer now
  applies `zoomLevel` to its content (verified 100% → 120%).
- **PDF clarity**: canvases render at `devicePixelRatio` (crisp on HiDPI
  displays instead of 1× scaling).
- **Page navigation**: next/prev arrows now scroll the PDF/slide viewer to the
  target page (`scrollIntoView` on `data-page`), and the "Page X of Y" number
  is an editable input that jumps to any page on Enter (PDF + PPTX verified).
- Committed `24ab006`.

### Feature: search now shows document names + page numbers
- Previously single-word results showed only word frequency; phrase results
  showed score + snippet. Now both show **which documents contain the word
  and the page numbers where it appears**:
  - `indexer.py` gained a page-location lookup over the `document_pages`
    table (`word_locations`, `_project_page_map`, `_word_pages`) — a
    separate lookup, **no Trie/Index/Stack code changed**.
  - `/autocomplete` enriches suggestions with `locations`; `/search` results
    include `pages`.
  - `Navbar` dropdown renders doc names + page chips (+N more).
- Verified live on localhost. Committed `3b1fcab`.

### Fix: login bug — accounts vanished (root cause: ephemeral disk)
- **Symptom:** account created on the deployed site worked once, then login
  said "Invalid email or password".
- **Root cause (proven):** the backend stored everything in a local SQLite
  file on Render's free tier, whose **ephemeral disk is wiped on every
  restart** — so registered users (and uploads) disappeared. Register + login
  work while the instance is awake (verified against the deployed API); the
  account is gone after a restart.
- **Fix:** dual-mode database layer (`database.py`): when `DATABASE_URL` is
  set the backend uses **PostgreSQL (Neon)** via psycopg2 (RealDictCursor);
  otherwise local SQLite for dev. Small SQL translation handles `?`→`%s`,
  `%` escaping in LIKE, `datetime('now')`→`now()`, PRAGMA drops; `rowid`
  tiebreaks replaced with `id` (SQLite-only column). `psycopg2-binary` added
  to requirements. `render.yaml` + `docs/DEPLOY.md` document the required
  `DATABASE_URL` env var.
- **Verified against the user's Neon database:** schema created, demo account
  + 9 documents seeded, register → login again works (200), upload/search
  (with pages)/highlight/bookmark all 201/200, LIKE queries work.

### Feature: mobile-first responsive layout (390 / 768 / 1024)
- Sidebar becomes a slide-in overlay drawer below 1024px with a tap-to-close
  backdrop (`mobileOpen` + `onClose`); static on desktop.
- Navbar trims on mobile: logo text + Upload label hide, tighter gaps.
- PDF toolbar scrolls horizontally on narrow screens; viewer padding shrinks.
- Selection popover clamps to the viewport (never off-screen).
- Verified at 390/768/1024: no horizontal page overflow, correct
  sidebar/hamburger visibility. Committed `83eba62`.

### Docs: feature workflow + DSA explanations (items 7, 9, 10)
- `docs/APP_WORKFLOW.md` — plain-English walkthrough of every feature (auth,
  projects/documents, search, viewer, bookmark/highlight, stack drawer, DSA
  visualizer) + how the data structures are built, with the file map and a
  data-flow diagram.
- `docs/TRIE_VS_INVERTED_INDEX.md` — side-by-side difference (tree of
  letters vs word→docs dictionary), real-life analogies, our exact
  implementations, and how the two work together in search.

---

## Fix round 7 - PDF rendering sharpness + stale page count (Aug 19, 2026)

Verified live on localhost (playwright): all previously reported issues
(TXT zoom/bookmark, drawer live refresh, PDF/PPTX arrows + editable page jump,
search shows doc names + page numbers, mobile-first 390/425/768/1024) were
already fixed by commits 24ab006 / 3b1fcab / 83eba62 - re-confirmed working.

Two real bugs found and fixed in `frontend/src/components/BrowserPDFViewer.jsx`:

- **Stale page count on TXT/DOCX/image docs:** switching from a PDF to a
  text file kept the PDF's numPages, so the toolbar showed "Page 1 of 7" and
  the next arrow was enabled on a single-page document. Fix: non-PDF docs now
  reset `numPages` to `page_count` (slides still override it via
  `onSlidesLoaded`).
- **PDF text crispness + correct zoom semantics:** the old renderer drew the
  canvas at `renderScale 1.5 x zoom` with 1:1 backing pixels on 1x displays
  (no supersampling), and "100%" zoom really meant 150% of the page size.
  Fix: display scale is now the real zoom (100% = natural page size) while the
  canvas is supersampled 1.5x (plus device pixels, capped at 2x) and scaled
  down to display size - measurably crisper text on all displays. The pdfjs
  text layer now uses the display viewport with `--scale-factor` matching
  `viewport.scale` (silences pdfjs warning) and a `scale(1/dpr)` transform,
  so selection/highlights stay aligned at any dpr. Verified: canvas backing
  ratio 1.5, pdfjs warnings 0, selection popover aligned, zoom + arrows work.
