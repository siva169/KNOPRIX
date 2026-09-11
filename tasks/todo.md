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

- [x] Slice: implement first AI document-chat capability
  - Acceptance: user selects documents, chooses approved provider/model, chats,
    and receives cited answers without exposing the key.
  - Verify: mocked provider tests plus approved live-provider test only after
    boss supplies credentials and authorizes use.
  - Files: `backend/`, `frontend/src/`
  - Done 2026-09-11: backend `chat.py` (allowlist + mocked cited ask, 11/11
    `qa_chat.py`); frontend `ChatPanel.jsx` (toolbar entry, side+full toggle,
    bottom sheet on mobile, citation cards, browser-local keys, privacy notice,
    copy button). Boss UI picks: toolbar entry, both layouts, bottom sheet,
    cards (Bruce chose cards as friendlier). Verify: `npm run build` pass,
    backend 9/9 + 11/11, Playwright 10/10 at 390+1280 (evidence
    `qa-artifacts/knoprix-chat-slice/`, gitignored). Live-provider test still
    pending boss key + authorization. Commits: backend `2b6b4f3`, frontend (this).
- [x] Live: browser-direct Groq answer (boss key, ephemeral test only)
  - Done 2026-09-11: `ChatPanel` tries provider-direct fetch (OpenAI-compatible
    path) with the browser-held key, falls back to mock on any failure;
    LIVE/MOCK badge. Fixed on the way: doubled URL path, retired Groq model ID
    (now GPT-OSS 20B). Verify: `qa-chatlive.mjs` PASS (LIVE badge, real answer).
    Key NEVER written to any file. Multi-key rotation deferred per boss (judge
    performance first).
- [x] Slice: summary as its own view (boss: button + result at TOP of chat panel)
  - Done 2026-09-11: backend `summary.py` (extractive, quotes only, 6/6
    `qa_summary.py`); frontend summarize button + numbered key-lines card.
    Verify: build pass, browser 2/2 at 390+1280.
- [x] Slice: Knowledge Graph map (boss: home-page button + doc picker + circle)
  - Done 2026-09-11: backend `graph.py` (scan-all-words, glue dropped, top-30/doc,
    strength>=2, pin/unpin word, 9/9 `qa_graph.py`); frontend `KnowledgeMap.jsx`
    (dashboard button, doc filter chips, SVG ring, tap-to-jump, track-a-word).
    Use: cross-doc concept jumps + self-tracked keywords. Verify: build pass,
    browser 4/4 at 390+1280.
- [x] Slice: Min-Heap top-k ranking (product: best passages surface fastest)
  - Done 2026-09-11: `dsa/minheap.py` (own heap + top_k, O(n log k)) wired into
    chat citations + `top-passages` demo endpoint (13/13 `qa_heap.py`, chat
    regression 11/11); visualizer card with live query demo (2/2 browser).
- [x] Slice: read-aloud on selection (boss: Speak beside Bookmark/Copy/Highlight)
  - Done 2026-09-11: browser speechSynthesis (offline, no key) with Stop toggle;
    Edge free endpoint verified dead (401) so no provider path. Fixed on the way:
    popover clamp for phones + icon-only popover buttons under 640px.
    Verify: build pass, browser 4/4 at 390+1280 (presence + no-crash; audio needs
    a real device, stated openly).
- [ ] Later: Gemini live protocol (different API language; Groq/OpenRouter/ZAI already live). Boss: update later.
