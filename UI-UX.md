# Knoprix Final Project — UI/UX Component Inventory

This is the UI/UX decision contract. Each technical name includes a simple
meaning and where it is used. Add screenshot or reference URLs in the
`Reference URLs` field before that surface is implemented.

## How to use this file

For every surface, boss chooses or approves:

- Layout and information hierarchy
- Navigation pattern
- Colors, typography, spacing, borders, and density
- Controls and interaction behavior
- Loading, empty, success, and error states
- Motion and animation level
- Mobile behavior at 390px and 425px
- Tablet behavior at 768px
- Desktop behavior at 1024px+
- Reference URLs or screenshots

No visual choice is treated as approved until it is selected here.

## A. Global application foundation

### A1. `AppShell` — the permanent frame around every screen
- Used for: page background, navigation regions, content region, and global
  overlays.
- Product modes: **Reading Desk** (document-first) and **AI Wing** (AI-first).
  The names are approved; mode-switch placement, layouts, and transitions
  remain unapproved design decisions.
- Decisions: single-pane or split-pane, density, background texture, maximum
  content width, desktop sidebar behavior, and how users switch between modes.
- States: boot loading, signed-out shell, signed-in shell, fatal error.
- Reference URLs: _add here_

### A2. `ResponsiveSidebar` — collapsible navigation on larger screens
- Used for: projects, documents, search, bookmarks, highlights, settings.
- Decisions: fixed sidebar or rail, expanded/collapsed labels, active indicator,
  mobile drawer behavior.
- Approved improvement (2026-10-20): source rows show the current user's
  bookmark and highlight totals; a document expands to its saved items. Opening
  an item navigates to its page and exact saved text anchor. Load highlights
  only when a document's list is expanded, and close the mobile drawer after a
  document or saved item is opened.
- Reference URLs: _add here_

### A3. `MobileNavigationDrawer` — navigation panel opened on small screens
- Used for: screens below the desktop breakpoint.
- Decisions: full-screen or partial drawer, backdrop, close gesture, focus
  handling, menu grouping.
- Reference URLs: _add here_

### A4. `StickyTopbar` — header that stays visible while content scrolls
- Used for: product identity, breadcrumbs, search entry, account menu, theme.
- Decisions: height, blur, border, shadow-on-scroll, mobile controls.
- Reference URLs: _add here_

### A5. `CommandPalette` — keyboard-friendly action/search launcher
- Used for: global navigation, document search, quick actions.
- Decisions: shortcut, command groups, recent items, result density.
- Reference URLs:
  - https://developer.apple.com/design/human-interface-guidelines/menus
  - https://developer.apple.com/design/human-interface-guidelines/search-fields
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

### A6. `ToastRegion` — temporary success/error message area
- Used for: save, delete, copy, upload, provider connection, AI errors.
- Decisions: position, duration, stacking, severity colors, undo action.
- Reference URLs:
  - https://m3.material.io/components/snackbar/overview
  - https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html

### A7. `ModalDialog` — focused overlay requiring a decision or input
- Used for: confirmations, provider key setup, DSA stats, settings.
- Decisions: size, backdrop, escape behavior, mobile full-screen behavior.
- Reference URLs: _add here_

### A8. `GlobalLoadingBoundary` — consistent loading treatment
- Used for: route changes, initial app load, protected data fetches.
- Decisions: skeleton versus progress indicator, message, timeout behavior.
- Reference URLs: _add here_

## B. Authentication

### B1. `LoginForm` — form for existing users to sign in
- Used for: authentication entry.
- Decisions: split layout or focused form, password visibility, validation,
  remembered session, error placement.
- Reference URLs: _add here_

### B2. `RegisterForm` — form for new account creation
- Used for: account creation.
- Decisions: field order, password rules, consent copy, inline validation.
- Reference URLs: _add here_

### B3. `PasswordRecoveryFlow` — account recovery screens
- Used for: forgot-password request and reset.
- Decisions: stepper or single flow, success state, invalid-token state.
- Reference URLs: _add here_

### B4. `AuthGuard` — route protection behavior
- Used for: preventing signed-out access to private screens.
- Decisions: redirect target, loading state, expired-session treatment.
- Reference URLs: _add here_

## C. Project and document management

### C1. `DashboardOverview` — starting summary of the user’s work
- Used for: project count, recent documents, recent reading activity, actions.
- Decisions: list versus instrument panel, metric density, first-run guidance.
- Reference URLs: _add here_

### C2. `ProjectSwitcher` — control for changing the active project
- Used for: topbar and document workspace.
- Decisions: dropdown, command palette, searchable list, create-project action.
- Reference URLs: _add here_

### C3. `ProjectList` — collection of the user’s projects
- Used for: project navigation and management.
- Decisions: rows/cards, sorting, metadata, empty state, delete confirmation.
- Reference URLs: _add here_

### C4. `ProjectCreateDialog` — form for creating a project
- Used for: new project action.
- Decisions: required fields, templates, validation, success routing.
- Reference URLs: _add here_

### C5. `DocumentLibrary` — documents inside the active project
- Used for: upload, open, rename, delete, filter, and status tracking.
- Decisions: table/list/grid, metadata shown, selection model, bulk actions.
- Reference URLs: _add here_

### C6. `DocumentUploadDropzone` — drag-and-drop or file-picker upload control
- Used for: PDF/PPT/DOCX ingestion.
- Decisions: accepted formats, progress display, duplicate handling, mobile
  picker behavior, validation errors.
- Reference URLs: _add here_

### C7. `DocumentProcessingStatus` — visible ingestion state
- Used for: parsing/indexing progress and failure recovery.
- Decisions: progress detail, retry action, partial-success behavior.
- Reference URLs: _add here_

### C8. `DocumentMetadataPanel` — title, type, pages, dates, and actions
- Used for: document details and management.
- Decisions: compact panel or drawer, editable fields, danger actions.
- Reference URLs: _add here_

## D. Reading workspace

### D1. `ReaderWorkspace` — main document-reading layout
- Used for: PDF/PPT viewing with surrounding tools.
- Decisions: centered page, two-pane layout, distraction-free mode, zoom
  controls, responsive collapse.
- Reference URLs:
  - https://developer.apple.com/design/human-interface-guidelines/undo-and-redo
  - https://m3.material.io/foundations/interaction/states/overview

### D2. `DocumentViewer` — rendered PDF or slide content
- Used for: reading the selected document.
- Decisions: page background, fit mode, zoom, page transition, text selection.
- Reference URLs: _add here_

### D3. `ReaderToolbar` — document actions and view controls
- Used for: page navigation, zoom, fullscreen, download, search.
- Decisions: icon-only versus labeled controls, grouping, overflow menu.
- Reference URLs:
  - https://m3.material.io/foundations/interaction/states/overview
  - https://developer.apple.com/design/human-interface-guidelines/menus

### D4. `PageNavigator` — page number and previous/next controls
- Used for: direct movement through a document.
- Decisions: input format, page count, keyboard shortcuts, invalid-page error.
- Reference URLs: _add here_

### D5. `ThumbnailRail` — miniature page or slide navigation
- Used for: fast visual movement through long documents.
- Decisions: left rail or bottom strip, selected state, lazy loading, mobile
  replacement.
- Reference URLs: _add here_

### D6. `HighlightLayer` — visual marking of selected document text
- Used for: highlights and evidence capture.
- Decisions: highlight colors, selection toolbar, edit/delete behavior.
- Reference URLs: _add here_

### D7. `HighlightList` — saved highlights in reading order
- Used for: reviewing evidence and jumping back to a page.
- Decisions: excerpt length, page label, sorting, empty state.
- Reference URLs: _add here_

### D8. `BookmarkCollectionDrawer` — newest-first saved page list
- Used for: bookmark creation, newest removal, arbitrary bookmark deletion.
- Decisions: drawer location, newest marker, row actions, confirmation,
  empty state, mobile bottom sheet.
- Approved improvement: retain the current right-side slide-in, dark/gold
  styling, and full-width behavior on narrow screens.
- Approved improvement: both selected-text and whole-page bookmark actions
  open one compact dialog with an optional name and a single Save action.
- Approved improvement: search filters live by bookmark name, selected text,
  and notes; named cards show the name first and the saved passage below it.
- Approved improvement: opening a text bookmark closes the drawer, opens its
  document/page, scrolls to its stored passage anchor, and briefly emphasizes
  the matched text. Older bookmarks without anchors fall back to their quote.
- States: preserve the existing empty state; add loading, no-match, and
  retryable search-error states; keep save errors visible through app notices.
- Responsive behavior: preserve the current drawer sizing and adapt controls
  to the viewport; keep touch targets usable on phones.
- Selected by boss, 2026-10-03.
- Reference URLs:
  - https://developer.apple.com/design/human-interface-guidelines/search-fields
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

### D9. `ReaderNotesPanel` — user notes attached to a document/page
- Used for: personal study notes.
- Decisions: autosave versus explicit save, markdown support, page association.
- Reference URLs: _add here_

## E. Search and DSA explanation

### E1. `GlobalSearchInput` — search entry across indexed documents
- Used for: Trie autocomplete and inverted-index result retrieval.
- Decisions: instant results versus submit, filters, keyboard navigation.
- Reference URLs: _add here_

### E2. `SearchSuggestionList` — prefix suggestions while typing
- Used for: Trie-powered autocomplete.
- Decisions: result limit, highlighted prefix, no-match state.
- Reference URLs: _add here_

### E3. `SearchResultsList` — matching passages/documents
- Used for: inverted-index search results.
- Decisions: result grouping, snippets, page links, relevance indicator.
- Reference URLs: _add here_

### E4. `DSAStatsModal` — transparent explanation of active data structures
- Used for: demonstrating Trie, inverted index, and bookmark collection
  statistics during the mid-review.
- Decisions: educational detail level, diagrams, complexity labels, raw counts.
- Reference URLs: _add here_

## F. Settings and BYOK AI

### F1. `SettingsLayout` — grouped user/application settings
- Used for: account, appearance, providers, privacy, keyboard shortcuts.
- Decisions: sidebar tabs, mobile tabs, save behavior, unsaved-change warning.
- Reference URLs: _add here_

### F2. `ProviderConnectionForm` — user adds a cloud AI provider key
- Used for: Z.AI GLM and OpenAI-compatible provider setup.
- Decisions: provider selector, masked key field, test-connection action,
  privacy notice, model allowlist preview.
- Reference URLs: _add here_

### F3. `ConnectedProviderCard` — saved provider connection summary
- Used for: provider status, selected model, last test, remove action.
- Decisions: key fingerprint display, status badge, default-provider action.
- Reference URLs: _add here_

### F4. `ModelSelector` — chooses an approved model
- Used for: AI conversation setup and provider settings.
- Decisions: allowlist presentation, capability labels, speed/cost indicators.
- Reference URLs: _add here_

### F5. `AIContextConsentDialog` — explains external context sent to a provider
- Used for: before a request sends authorized document text to a provider.
- Approved interaction: a blocking confirmation names the provider/model and
  identifies the authorized document context. It states that only relevant
  extracted text and the question are sent; original files and visual content
  are excluded. It discloses key handling and warns about possible
  provider-defined charges/quota without inventing prices. Cancel sends
  nothing and preserves the pending question.
- Unified-chat update: if saved-chat context is included, disclose that
  alongside the documents. Show provider-native search availability and
  provider-defined usage/charge notice when applicable.
- Reference URLs: _add here_

### F6. `DocumentScopePicker` — selects exactly which documents AI may use
- Used for: every AI conversation or explicit session scope.
- Decisions: one document versus multiple, project-wide option, remembered
  scope, clear selection.
- Approved target: the unified chat may use relevant passages from
  active-project documents with active Knoprix AI grants. The
  Retrieval/Document text mode selector is removed; retrieval remains internal.
- Reference URLs: _add here_

### F7. `DocumentChatWorkspace` — conversation about selected documents
- Used for: AI Wing's general conversation workspace and optional AI panel
  from the Reading Desk.
- Decisions: chat layout, source panel, streaming treatment, regenerate,
  copy, feedback, conversation history.
- Approved by boss, 2026-10-25: one general chat replaces the Retrieval /
  Document text selector. It can use only the active project's AI-authorized
  documents and relevant messages from the signed-in user's saved chats.
- Approved by boss, 2026-10-25: Recent Chats and New Chat actions stay in the
  workspace header. The existing dark/gold language is retained.
- Approved by boss, 2026-10-25: conversation renaming uses a compact dialog;
  motion is subtle and respects `prefers-reduced-motion`.
- Reference URLs: _add here_

### F8. `ChatMessage` — one user or assistant message
- Used for: conversation transcript.
- Decisions: markdown, code blocks, citation chips, timestamps, actions.
- Approved by boss, 2026-10-25: show source citations inline with the answer,
  not in a separate citation list. Document markers jump to Reading Desk;
  web markers open only validated HTTPS sources in a new tab.
- Reference URLs: _add here_

### F9. `CitationPanel` — supporting pages and excerpts for an AI answer
- Used for: grounded answer verification.
- Approved by boss, 2026-10-25: citations are inline, not in a separate panel;
  document markers jump to Reading Desk and validated HTTPS web markers open
  in a new tab.
- Reference URLs: _add here_

### F10. `AIResponseState` — loading, success, partial, and failure states
- Used for: provider calls and streaming responses.
- Decisions: token streaming, cancel action, retry, invalid-key message,
  rate-limit message, provider-unavailable state.
- Reference URLs: _add here_

### F11. `StudyToolLauncher` — entry point for future AI tools
- Used for: summary, flashcards, quiz, and later research actions.
- Decisions: tabs, command menu, tool cards, document scope reminder.
- Reference URLs: _add here_

### F12. `WebResearchConsent` — opt-in confirmation for internet research
- Used for: later article/PDF research feature.
- Decisions: consent wording, query preview, source display, citation format.
- Reference URLs: _add here_

### F13. `RecentChatsDialog` — find and manage saved AI conversations
- Used for: opening and managing the signed-in user's server-synced chats.
- Approved by boss, 2026-10-25: use a searchable dialog; show title and
  updated date; search titles only; support New Chat, open, rename, and delete
  with confirmation. Selecting a chat closes the dialog and opens that chat.
- Approved visual direction: reuse the existing AI Wing dark/gold tokens and
  modal styling; full-width on mobile and centered on larger screens.
- Required states: loading, empty, no search results, API error with retry,
  and per-action progress/success feedback. Only the signed-in user's history
  is displayed.
- Approved by boss, 2026-10-25: rename uses a small edit dialog; transitions
  are subtle and must respect `prefers-reduced-motion`. The modal supports
  Escape, focus containment, and focus restoration.
- References:
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  - https://developer.apple.com/design/human-interface-guidelines/search-fields

## G. Shared states and quality surfaces

### G1. `EmptyState` — helpful screen when no records exist
- Used for: no projects, no documents, no bookmarks, no highlights, no search
  results, no provider, no conversation.
- Decisions: illustration style, primary action, educational copy.
- Reference URLs: _add here_

### G2. `ErrorState` — visible failure with recovery action
- Used for: API, upload, parsing, provider, network, and permission errors.
- Decisions: technical detail level, retry action, support information.
- Reference URLs: _add here_

### G3. `ConfirmationDialog` — explicit protection for destructive actions
- Used for: document/project/provider/key deletion.
- Decisions: wording, typed confirmation, danger button treatment.
- Reference URLs: _add here_

### G4. `NotFoundPage` — safe route fallback
- Used for: unknown project, document, or URL.
- Decisions: return action, search action, illustration.
- Reference URLs: _add here_

### G5. `AccessibilityLayer` — keyboard and assistive-technology behavior
- Used for: every screen.
- Decisions: skip link, focus ring, dialog focus trap, screen-reader labels,
  reduced-motion mode, contrast target.
- Reference URLs: _add here_

## H. Contacts and resource sharing — approved 2026-10-12

### H1. `ContactsPage` — manage Knoprix relationships and exact resource shares
- Entry points: Navbar and Sidebar; open as the main content surface.
- Visual direction: preserve the existing dark/gold Knoprix style.
- Page order: own Knoprix ID/copy and ID lookup; privacy controls; incoming
  and sent contact requests; contact list; per-resource share form; incoming
  and sent share statuses; blocked IDs.
- Discovery: Knoprix ID only. Do not show email lookup, Gmail import, or email
  as a contact identifier.
- Share form: select one document, bookmark, or highlight and one or more
  accepted contacts. Each recipient gets an independent pending state.
- Shared document view: show a clear read-only banner and suppress
  owner-changing annotation/bookmark/chat controls. The backend remains the
  authorization boundary.
- Confirmation: confirm contact removal, blocking, share revocation, and
  recipient leave; explain that removal/block revokes active shares.
- Email: show email notifications as unavailable until a delivery provider is
  separately approved and configured. Keep in-app requests usable.
- Responsive: stack all cards and controls on mobile; no horizontal overflow;
  target 390px and 425px mobile, 768px tablet, and 1024px desktop.
- States: initial loading, empty contact/request/share lists, per-action
  loading, partial section failures with retry, success toasts, actionable API
  errors, and unavailable email state. An annotation-only share opens its
  source only when that document was separately shared and accepted; otherwise
  show the annotation and page without exposing the source.
- Approval: dedicated Contacts page, page order, entry points, and visual
  direction approved by boss 2026-10-12.

## Screenshot/reference submission format

Paste references under the relevant component using:

```md
Reference URLs:
- [URL] — what to copy or study
- [URL] — what to avoid
Boss choice: [selected option / changes requested]
```

## Approval status

- Product mode names: **Reading Desk** and **AI Wing** — approved 2026-10-04.
- Global layouts, navigation, and interactions outside the approved surfaces:
  pending boss choices.
- Historical AI Wing document-text approval: superseded 2026-10-25 by the
  unified general-chat decision below. Legacy provider-copy status, revoke,
  and retry-delete controls remain for historical remote files; no new upload
  or prepare action is available.
- AI Wing general chat and Recent Chats: approved 2026-10-25 as recorded in
  F5–F9 and F13. The approved chat/history UI decisions are implemented;
  unrelated surfaces remain subject to their own approval gates.
- First surface: `DashboardOverview` — selected for the first UI/UX review
- Reference URLs: pending boss input
- Global foundation: Not selected
- Authentication: Not selected
- Projects/documents: Not selected
- Reading workspace: Not selected
- Search/DSA: Not selected
- Settings/BYOK AI: Not selected
- Shared states/accessibility: Not selected
- Contacts and resource sharing page: approved 2026-10-12; implemented in the
  existing Knoprix shell.
