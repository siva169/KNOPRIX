# Spec: Knoprix Reader Gold Redesign

## Objective

Redesign the authenticated reader as a focused study workspace that carries
the login screen's restrained gold language into the product without turning
every surface into a glowing card.

Primary user: a student or researcher reading course documents on a phone,
tablet, or laptop.

## Approved Direction

- Composition: focused reading canvas with a collapsible document/index rail.
- Palette: warm off-black surfaces, ivory content, restrained pale gold for
  active, focused, bookmarked, progress, and primary actions.
- Density: calm editorial workspace; grouping uses spacing and rules before
  cards.
- Motion: short transform/opacity transitions only; respect reduced motion.
- Mobile: 390px first, then 425px, 768px, and 1024px verification.
- Login cleanup: remove the `BLACK MIRROR / 04` label from the login top bar.

## First Vertical Slice

1. Apply the gold design tokens to the reader shell and toolbar.
2. Add reading progress and resume position for the active document.
3. Add a keyboard-accessible command palette for document navigation and
   reader actions.
4. Add a focus mode that hides non-essential chrome and can be exited safely.
5. Add undo-capable status feedback for reversible reader actions.
6. Add a continue-reading entry point to the dashboard.

## Approved Okular-Inspired Reader Slice — 2026-09-14

- Page navigation uses the compact Okular pattern: first, previous, editable
  current page, next, and last controls.
- View controls expose Single Page and Continuous modes.
- A page-thumbnail rail can be opened beside PDF content and jumps directly to
  a selected page.
- Browse and Text Selection modes are explicit toolbar choices rather than
  hidden interaction rules.
- The annotation picker exposes Yellow Highlighter, Green Highlighter,
  Underline, Strikethrough, Inline Text, Inline Note, and Pop-up Note, with
  numbered shortcuts shown in the menu.
- The toolbar remains horizontally scrollable on mobile, as approved by the
  boss, so no required control is silently hidden below 1024px.
- Existing persisted highlight and bookmark behavior remains unchanged. Tools
  whose document-specific persistence model is not yet implemented report
  their state honestly instead of creating a misleading marker.
- Highlight creation defaults to the selected occurrence only. The annotation
  menu provides a persistent `Highlight all matching occurrences` preference
  for users who explicitly want related matches painted together.

## Product Boundaries

- Always preserve existing PDF/PPTX/TXT/DOCX reading behavior.
- Always keep bookmark, highlight, speak, chat, search, and DSA actions
  reachable.
- Ask before changing backend schemas or adding dependencies.
- Never add decorative metrics, fake activity, placeholder documents, or AI
  branding.
- Every implementation slice receives a local git checkpoint.
- Every reversible user action must either support Undo or state why it cannot.

## Success Criteria

- The reader and toolbar use the approved gold language consistently.
- The document remains the most visually prominent element.
- Reading progress survives reload for the same document and resumes at the
  saved position.
- Command palette opens from the documented keyboard shortcut, traps focus
  while open, supports Escape, and exposes only real actions/documents.
- Focus mode hides secondary chrome and restores it without losing reader state.
- Reversible actions expose an accessible Undo status action.
- No horizontal overflow or clipped controls at 390, 425, 768, or 1024px.
- No unexpected browser console errors during login, reader open, palette,
  focus-mode, and Undo flows.

## Verification Commands

```text
cd knoprix-final-project/frontend
npm run build
npx --no-install playwright cli open http://127.0.0.1:5173
```

Existing focused QA scripts remain the baseline; new behavior must receive a
small targeted browser check before its checkpoint.

## Research Used

- Material Design 3, interaction states:
  https://m3.material.io/foundations/interaction/states/overview
- Material Design 3, snackbars:
  https://m3.material.io/components/snackbar/overview
- WAI-ARIA Authoring Practices, modal dialog:
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WCAG 2.2, status messages:
  https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- Apple Human Interface Guidelines, menus:
  https://developer.apple.com/design/human-interface-guidelines/menus
- Apple Human Interface Guidelines, search fields:
  https://developer.apple.com/design/human-interface-guidelines/search-fields
- Apple Human Interface Guidelines, undo and redo:
  https://developer.apple.com/design/human-interface-guidelines/undo-and-redo

These sources informed interaction behavior and accessibility, not copied
branding or visual layouts.

## Open Decisions

- Whether document progress should be stored only in browser storage or added
  to the backend later. The first slice uses browser-local progress to avoid a
  schema change.
- Whether the command palette shortcut should be `Ctrl/Cmd+K` only or also
  expose a visible toolbar button. The first implementation will support both
  unless the boss chooses otherwise.
