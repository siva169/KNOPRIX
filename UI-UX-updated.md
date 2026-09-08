# Knoprix Final Project — UI/UX Component Inventory (Updated with Reference URLs)

This is the UI/UX decision contract. Each technical name includes a simple
meaning and where it is used. This version fills every `Reference URLs` field
with verified, canonical sources (checked live on 2026-09-09). Sources were
chosen as the **strongest available reference** per component: official design
systems (Carbon, Material, Atlassian, Polaris, USWDS, Gov.uk, Apple HIG),
accessibility authorities (W3C ARIA APG, WCAG), UX research (Nielsen Norman
Group), and trusted pattern galleries (Component Gallery, Page Flows,
emptystat.es). Each link says exactly what to study from it.

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

## Cross-cutting databases (browse many design systems at once)

- **Adele (UXPin)** — repository of 100+ public design systems: https://adele.uxpin.com/
- **Design Systems Repo** — curated design systems, style guides, pattern libraries: https://designsystemsrepo.com/design-systems/
- **The Component Gallery** — maps one component name across dozens of real systems: https://component.gallery/
- **Page Flows** — recorded real-product user flows (auth, uploads, search, chat): https://pageflows.com/
- **emptystat.es** — curated gallery of empty states from real apps: https://emptystat.es/

## A. Global application foundation

### A1. `AppShell` — the permanent frame around every screen
- Used for: page background, navigation regions, content region, and global
  overlays.
- Decisions: single-pane or split-pane, density, background texture, maximum
  content width, desktop sidebar behavior.
- States: boot loading, signed-out shell, signed-in shell, fatal error.
- Reference URLs:
  - https://carbondesignsystem.com/components/UI-shell-header/usage/ — Carbon "UI Shell": the most complete public app-shell documentation (header + side nav + panels + content)
  - https://carbondesignsystem.com/components/UI-shell-left-panel/usage/ — Carbon: shell left panel / side rail behavior
  - https://horizon.servicenow.com/workspace/app-shells/workspace-app-shell — ServiceNow Horizon "Workspace App Shell": a full production app-shell spec (global search, rails, content areas)
  - https://atlassian.design/components/page-layout — Atlassian PageLayout: splitting the viewport into TopNavigation / SideNav / Main slots (your single-pane vs split-pane decision)

### A2. `ResponsiveSidebar` — collapsible navigation on larger screens
- Used for: projects, documents, search, bookmarks, highlights, settings.
- Decisions: fixed sidebar or rail, expanded/collapsed labels, active indicator,
  mobile drawer behavior.
- Reference URLs:
  - https://atlassian.design/components/navigation-system/layout — Atlassian side-nav layout slots (header, search, footer inside the sidebar)
  - https://m3.material.io/components/navigation-drawer/overview — Material 3 navigation drawer: expanded / rail / modal anatomy and breakpoints
  - https://react.carbondesignsystem.com/?path=/docs/components-ui-shell-sidenav--overview — Carbon SideNav: fixed-width vs flexible rail configurations

### A3. `MobileNavigationDrawer` — navigation panel opened on small screens
- Used for: screens below the desktop breakpoint.
- Decisions: full-screen or partial drawer, backdrop, close gesture, focus
  handling, menu grouping.
- Reference URLs:
  - https://m3.material.io/components/navigation-drawer/overview — Material 3: modal drawer anatomy, backdrop, gestures, breakpoints
  - https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html — W3C: focus order rules when the drawer opens/closes (focus handling decision)
  - https://atlassian.design/components/side-navigation/usage — Atlassian side navigation: responsive collapse-to-drawer behavior

### A4. `StickyTopbar` — header that stays visible while content scrolls
- Used for: product identity, breadcrumbs, search entry, account menu, theme.
- Decisions: height, blur, border, shadow-on-scroll, mobile controls.
- Reference URLs:
  - https://carbondesignsystem.com/components/UI-shell-header/usage/ — Carbon UI Shell header: fixed header patterns, actions, alignment
  - https://m3.material.io/components/top-app-bar/overview — Material 3 top app bar: scroll behavior (elevation/shadow-on-scroll), height, actions
  - https://atlassian.design/components/page-header — Atlassian page header: title + actions + breadcrumbs composition

### A5. `CommandPalette` — keyboard-friendly action/search launcher
- Used for: global navigation, document search, quick actions.
- Decisions: shortcut, command groups, recent items, result density.
- Reference URLs:
  - https://github.com/dip/cmdk — cmdk (the library behind Vercel's ⌘K menu): groups, filtering, keyboard behavior, accessible combobox API
  - https://ui.shadcn.com/docs/components/command — shadcn/ui Command: production styling and composition of a command palette on top of cmdk
  - https://component.gallery/components/command-menu/ — The Component Gallery: how many systems name and document the same "command menu" pattern

### A6. `ToastRegion` — temporary success/error message area
- Used for: save, delete, copy, upload, provider connection, AI errors.
- Decisions: position, duration, stacking, severity colors, undo action.
- Reference URLs:
  - https://www.nngroup.com/articles/toast/ — Nielsen Norman Group: toast research, placement, duration, stacking, when NOT to use
  - https://sonner.emilkowal.ski/ — Sonner: the most popular production toast implementation (positioning, stacking, rich colors, undo actions)
  - https://www.radix-ui.com/primitives/docs/components/toast — Radix Toast: accessible semantics (aria-live), swipe-to-dismiss, timers

### A7. `ModalDialog` — focused overlay requiring a decision or input
- Used for: confirmations, provider key setup, DSA stats, settings.
- Decisions: size, backdrop, escape behavior, mobile full-screen behavior.
- Reference URLs:
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — W3C ARIA Authoring Practices: canonical dialog behavior (focus trap, Escape, backdrop)
  - https://m3.material.io/components/dialogs/overview — Material 3 dialogs: sizes, actions, when modal vs non-modal
  - https://www.radix-ui.com/primitives/docs/components/dialog — Radix Dialog: production implementation of focus management + scroll locking + mobile behavior

### A8. `GlobalLoadingBoundary` — consistent loading treatment
- Used for: route changes, initial app load, protected data fetches.
- Decisions: skeleton versus progress indicator, message, timeout behavior.
- Reference URLs:
  - https://www.nngroup.com/articles/progress-indicators/ — NN/g: which progress-indicator type to use by wait length
  - https://www.nngroup.com/articles/skeleton-screens/ — NN/g: skeleton screens — when they reduce perceived wait and when they backfire
  - https://react.dev/reference/react/Suspense — React Suspense: the mechanism a loading boundary hangs on

## B. Authentication

### B1. `LoginForm` — form for existing users to sign in
- Used for: authentication entry.
- Decisions: split layout or focused form, password visibility, validation,
  remembered session, error placement.
- Reference URLs:
  - https://web.dev/articles/sign-in-form-best-practices — Google's canonical sign-in form guide: password visibility toggle, mobile keyboards, error placement
  - https://www.nngroup.com/articles/login-forms/ — NN/g: login form UX research (field count, labels, error handling)

### B2. `RegisterForm` — form for new account creation
- Used for: account creation.
- Decisions: field order, password rules, consent copy, inline validation.
- Reference URLs:
  - https://web.dev/articles/sign-up-form-best-practices — Google's canonical sign-up form guide: field order, inline validation, consent/session copy
  - https://www.nngroup.com/articles/errors-forms-design-guidance/ — NN/g: form error message design (inline placement, wording)

### B3. `PasswordRecoveryFlow` — account recovery screens
- Used for: forgot-password request and reset.
- Decisions: stepper or single flow, success state, invalid-token state.
- Reference URLs:
  - https://www.nngroup.com/articles/forgot-password/ — NN/g: designing effective forgot-password flows (success copy, token-expiry messaging)
  - https://pageflows.com/web/flows/password-reset-flow/ — Page Flows: real recorded password-reset flows from major products to benchmark against

### B4. `AuthGuard` — route protection behavior
- Used for: preventing signed-out access to private screens.
- Decisions: redirect target, loading state, expired-session treatment.
- Reference URLs:
  - https://nextjs.org/docs/app/building-your-application/authentication — Next.js official auth pattern: middleware guards, redirects, session checks
  - https://nextjs.org/docs/app/api-reference/functions/redirect — Next.js `redirect()`: how the redirect target decision is implemented

## C. Project and document management

### C1. `DashboardOverview` — starting summary of the user's work
- Used for: project count, recent documents, recent reading activity, actions.
- Decisions: list versus instrument panel, metric density, first-run guidance.
- Reference URLs:
  - https://www.nngroup.com/articles/dashboards/ — NN/g: dashboard design principles (metric density, hierarchy)
  - https://polaris.shopify.com/patterns/dashboard-layout — Shopify Polaris dashboard layout pattern: list vs cards, first-run guidance
  - https://m3.material.io/foundations/adaptive-design/canonical-layouts/overview — Material 3 canonical layouts: how summary dashboards adapt 390px → 1024px+

### C2. `ProjectSwitcher` — control for changing the active project
- Used for: topbar and document workspace.
- Decisions: dropdown, command palette, searchable list, create-project action.
- Reference URLs:
  - https://ui.shadcn.com/docs/components/combobox — shadcn Combobox: searchable dropdown pattern (searchable list decision)
  - https://www.radix-ui.com/primitives/docs/components/dropdown-menu — Radix Dropdown Menu: keyboard behavior and semantics for the switcher
  - https://ui.shadcn.com/docs/components/command — shadcn Command: the command-palette alternative for switching projects

### C3. `ProjectList` — collection of the user's projects
- Used for: project navigation and management.
- Decisions: rows/cards, sorting, metadata, empty state, delete confirmation.
- Reference URLs:
  - https://polaris.shopify.com/components/index-table — Polaris IndexTable: rows, bulk actions, sorting, empty states
  - https://m2.material.io/components/lists — Material lists: rows vs cards, metadata density
  - https://carbondesignsystem.com/patterns/empty-states-pattern/ — Carbon: empty-state structure (what to show when there are no projects)

### C4. `ProjectCreateDialog` — form for creating a project
- Used for: new project action.
- Decisions: required fields, templates, validation, success routing.
- Reference URLs:
  - https://m3.material.io/components/dialogs/overview — Material 3: dialog sizing, action buttons, when a dialog is appropriate
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — W3C: focus behavior for form dialogs

### C5. `DocumentLibrary` — documents inside the active project
- Used for: upload, open, rename, delete, filter, and status tracking.
- Decisions: table/list/grid, metadata shown, selection model, bulk actions.
- Reference URLs:
  - https://polaris.shopify.com/components/index-table — Polaris IndexTable: selection model, bulk actions, filters, status badges
  - https://m2.material.io/components/data-tables — Material data tables: table vs list vs grid, column choices
  - https://designsystem.digital.gov/components/table/ — USWDS table: accessible markup for tabular data

### C6. `DocumentUploadDropzone` — drag-and-drop or file-picker upload control
- Used for: PDF/PPT/DOCX ingestion.
- Decisions: accepted formats, progress display, duplicate handling, mobile
  picker behavior, validation errors.
- Reference URLs:
  - https://react-dropzone.js.org/ — react-dropzone: accepted formats, validation errors, drag vs picker behavior
  - https://www.nngroup.com/articles/drag-and-drop/ — NN/g: drag-and-drop usability research (discoverability of the dropzone)

### C7. `DocumentProcessingStatus` — visible ingestion state
- Used for: parsing/indexing progress and failure recovery.
- Decisions: progress detail, retry action, partial-success behavior.
- Reference URLs:
  - https://www.nngroup.com/articles/progress-indicators/ — NN/g: deterministic (percent) vs indeterminate progress, status messaging
  - https://polaris.shopify.com/components/badge — Polaris Badge: status pill treatment (processing / failed / ready)

### C8. `DocumentMetadataPanel` — title, type, pages, dates, and actions
- Used for: document details and management.
- Decisions: compact panel or drawer, editable fields, danger actions.
- Reference URLs:
  - https://m3.material.io/components/side-sheets/overview — Material 3 side sheets: the "compact panel" anatomy and dismiss behavior
  - https://atlassian.design/components/page-layout — Atlassian: slotting a metadata panel beside main content

## D. Reading workspace

### D1. `ReaderWorkspace` — main document-reading layout
- Used for: PDF/PPT viewing with surrounding tools.
- Decisions: centered page, two-pane layout, distraction-free mode, zoom
  controls, responsive collapse.
- Reference URLs:
  - https://m3.material.io/foundations/adaptive-design/canonical-layouts/overview — Material 3 canonical layouts: two-pane vs single-pane across 390px → 1024px+
  - https://atlassian.design/components/page-layout — Atlassian PageLayout: tool rail + main content composition

### D2. `DocumentViewer` — rendered PDF or slide content
- Used for: reading the selected document.
- Decisions: page background, fit mode, zoom, page transition, text selection.
- Reference URLs:
  - https://mozilla.github.io/pdf.js/ — PDF.js (Firefox's PDF viewer): fit modes, zoom, page transitions, text-layer selection
  - https://github.com/wojtekmaj/react-pdf — react-pdf: React wrapper for embedding PDF.js with page/zoom controls

### D3. `ReaderToolbar` — document actions and view controls
- Used for: page navigation, zoom, fullscreen, download, search.
- Decisions: icon-only versus labeled controls, grouping, overflow menu.
- Reference URLs:
  - https://m3.material.io/components/top-app-bar/overview — Material 3 app bar: icon actions, overflow menu, grouping
  - https://ui.shadcn.com/docs/components/toggle-group — shadcn ToggleGroup: connected view controls (fit mode / zoom toggles)

### D4. `PageNavigator` — page number and previous/next controls
- Used for: direct movement through a document.
- Decisions: input format, page count, keyboard shortcuts, invalid-page error.
- Reference URLs:
  - https://www.w3.org/WAI/ARIA/apg/patterns/pagination/ — W3C ARIA APG pagination: previous/next + direct-entry patterns and semantics
  - https://ui.shadcn.com/docs/components/pagination — shadcn Pagination: production previous/next + page entry

### D5. `ThumbnailRail` — miniature page or slide navigation
- Used for: fast visual movement through long documents.
- Decisions: left rail or bottom strip, selected state, lazy loading, mobile
  replacement.
- Reference URLs:
  - https://mozilla.github.io/pdf.js/examples/ — PDF.js examples: rendering page thumbnails lazily
  - https://github.com/wojtekmaj/react-pdf — react-pdf: thumbnail strips with selected-state control

### D6. `HighlightLayer` — visual marking of selected document text
- Used for: highlights and evidence capture.
- Decisions: highlight colors, selection toolbar, edit/delete behavior.
- Reference URLs:
  - https://www.nngroup.com/articles/text-selection/ — NN/g: text selection behavior and selection-toolbar research
  - https://www.w3.org/TR/annotation-model/ — W3C Web Annotation Data Model: the standard shape for "highlight anchored to document range"

### D7. `HighlightList` — saved highlights in reading order
- Used for: reviewing evidence and jumping back to a page.
- Decisions: excerpt length, page label, sorting, empty state.
- Reference URLs:
  - https://m3.material.io/components/lists/overview — Material 3 lists: row density, two-line rows, page-label placement
  - https://emptystat.es/ — empty-state examples for "no highlights yet"

### D8. `BookmarkCollectionDrawer` — newest-first saved page list
- Used for: bookmark creation, newest removal, arbitrary bookmark deletion.
- Decisions: drawer location, newest marker, row actions, confirmation,
  empty state, mobile bottom sheet.
- Reference URLs:
  - https://m3.material.io/components/side-sheets/overview — Material 3 side sheets: desktop drawer anatomy, dismiss behavior
  - https://m3.material.io/components/bottom-sheets/overview — Material 3 bottom sheets: the mobile replacement pattern
  - https://component.gallery/components/empty-state/ — Component Gallery: empty-state naming and patterns across systems

### D9. `ReaderNotesPanel` — user notes attached to a document/page
- Used for: personal study notes.
- Decisions: autosave versus explicit save, markdown support, page association.
- Reference URLs:
  - https://m3.material.io/components/side-sheets/overview — Material 3 side sheets: notes panel placement
  - https://ui.shadcn.com/docs/components/textarea — shadcn Textarea: the editing surface inside the panel

## E. Search and DSA explanation

### E1. `GlobalSearchInput` — search entry across indexed documents
- Used for: Trie autocomplete and inverted-index result retrieval.
- Decisions: instant results versus submit, filters, keyboard navigation.
- Reference URLs:
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ — W3C ARIA APG combobox: THE canonical keyboard behavior for search inputs with suggestions
  - https://www.nngroup.com/articles/query-suggestions/ — NN/g: query suggestion research (instant results vs submit)

### E2. `SearchSuggestionList` — prefix suggestions while typing
- Used for: Trie-powered autocomplete.
- Decisions: result limit, highlighted prefix, no-match state.
- Reference URLs:
  - https://www.nngroup.com/articles/query-suggestions/ — NN/g: how many suggestions to show, highlighting, no-match handling
  - https://ui.shadcn.com/docs/components/command — shadcn Command: rendering filtered suggestion groups

### E3. `SearchResultsList` — matching passages/documents
- Used for: inverted-index search results.
- Decisions: result grouping, snippets, page links, relevance indicator.
- Reference URLs:
  - https://www.nngroup.com/articles/search-results/ — NN/g: search results page research (snippets, grouping, relevance)
  - https://design-system.service.gov.uk/patterns/search/ — GOV.UK search pattern: result list structure and page links

### E4. `DSAStatsModal` — transparent explanation of active data structures
- Used for: demonstrating Trie, inverted index, and bookmark collection
  statistics during the mid-review.
- Decisions: educational detail level, diagrams, complexity labels, raw counts.
- Reference URLs:
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — W3C: dialog semantics for the stats modal
  - https://www.nngroup.com/articles/dashboards/ — NN/g: presenting counts/metrics without overwhelming (educational detail level)

## F. Settings and BYOK AI

### F1. `SettingsLayout` — grouped user/application settings
- Used for: account, appearance, providers, privacy, keyboard shortcuts.
- Decisions: sidebar tabs, mobile tabs, save behavior, unsaved-change warning.
- Reference URLs:
  - https://developer.apple.com/design/human-interface-guidelines/settings — Apple HIG Settings: grouping order, save behavior, toggles vs rows
  - https://atlassian.design/components/page-layout — Atlassian: settings sidebar + content layout

### F2. `ProviderConnectionForm` — user adds a cloud AI provider key
- Used for: Z.AI GLM and OpenAI-compatible provider setup.
- Decisions: provider selector, masked key field, test-connection action,
  privacy notice, model allowlist preview.
- Reference URLs:
  - https://helios.hashicorp.design/components/form/masked-input — HashiCorp Helios Masked Input: a design system that documents secret/masked fields directly
  - https://ux.stackexchange.com/questions/124938/should-we-mask-api-keys — UX StackExchange: the mask-vs-show API key debate (your exact decision)
  - https://zuplo.com/blog/api-key-best-practices — API key UX best practices (fingerprint display, prefixes, validation)

### F3. `ConnectedProviderCard` — saved provider connection summary
- Used for: provider status, selected model, last test, remove action.
- Decisions: key fingerprint display, status badge, default-provider action.
- Reference URLs:
  - https://m3.material.io/components/cards/overview — Material 3 cards: card anatomy and actions
  - https://polaris.shopify.com/components/badge — Polaris Badge: status treatment (connected / invalid / testing)

### F4. `ModelSelector` — chooses an approved model
- Used for: AI conversation setup and provider settings.
- Decisions: allowlist presentation, capability labels, speed/cost indicators.
- Reference URLs:
  - https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ — W3C ARIA APG listbox: canonical selectable-list semantics
  - https://ui.shadcn.com/docs/components/select — shadcn Select: production selector with labels and descriptions

### F5. `ProviderPrivacyNotice` — explains external document processing
- Used for: before the first document is sent to a cloud provider.
- Decisions: blocking confirmation or inline notice, provider/model details,
  link to privacy policy.
- Reference URLs:
  - https://gdpr.eu/ — GDPR reference: consent and external-processing disclosure requirements
  - https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/ — UK ICO guidance: plain-language privacy notice wording

### F6. `DocumentScopePicker` — selects exactly which documents AI may use
- Used for: every AI conversation or explicit session scope.
- Decisions: one document versus multiple, project-wide option, remembered
  scope, clear selection.
- Reference URLs:
  - https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/ — W3C ARIA APG checkbox: multi-select semantics (scope selection)
  - https://polaris.shopify.com/components/checkbox — Polaris Checkbox: labels, select-all pattern, indeterminate state

### F7. `DocumentChatWorkspace` — conversation about selected documents
- Used for: first AI vertical slice.
- Decisions: chat layout, source panel, streaming treatment, regenerate,
  copy, feedback, conversation history.
- Reference URLs:
  - https://www.nngroup.com/articles/chatbots/ — NN/g: chatbot UX guidelines (layout, transparency, handoff)
  - https://www.nngroup.com/articles/ai-chatbots-design-guidelines/ — NN/g (2026): 10 practical AI-chatbot design guidelines
  - https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot — Vercel AI SDK chatbot guide: streaming treatment, regenerate, the canonical production chat surface

### F8. `ChatMessage` — one user or assistant message
- Used for: conversation transcript.
- Decisions: markdown, code blocks, citation chips, timestamps, actions.
- Reference URLs:
  - https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot — Vercel AI SDK: message rendering, actions (copy/regenerate), streaming states
  - https://github.com/remarkjs/react-markdown — react-markdown: safe markdown/code-block rendering inside messages

### F9. `CitationPanel` — supporting pages and excerpts for an AI answer
- Used for: grounded answer verification.
- Decisions: inline citation markers versus side panel, click-to-page, excerpt
  length, unavailable-source state.
- Reference URLs:
  - https://www.nngroup.com/articles/chatbots/ — NN/g: transparency and source-grounding in AI answers
  - https://www.w3.org/TR/annotation-model/ — W3C Web Annotation: the standard way to anchor an excerpt to a document page
  - https://blog.google/products/search/ai-mode-search/ — Google Search AI Mode: how the industry shows citations/chips inline vs panel

### F10. `AIResponseState` — loading, success, partial, and failure states
- Used for: provider calls and streaming responses.
- Decisions: token streaming, cancel action, retry, invalid-key message,
  rate-limit message, provider-unavailable state.
- Reference URLs:
  - https://www.nngroup.com/articles/ai-chatbots-design-guidelines/ — NN/g: streaming feedback, failure recovery in AI chat
  - https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot — Vercel AI SDK: status/loading/error state machinery for streaming responses

### F11. `StudyToolLauncher` — entry point for future AI tools
- Used for: summary, flashcards, quiz, and later research actions.
- Decisions: tabs, command menu, tool cards, document scope reminder.
- Reference URLs:
  - https://m3.material.io/components/tabs/overview — Material 3 tabs: primary/secondary tab patterns for tool switching
  - https://ui.shadcn.com/docs/components/command — shadcn Command: command-menu alternative for tool launching

### F12. `WebResearchConsent` — opt-in confirmation for internet research
- Used for: later article/PDF research feature.
- Decisions: consent wording, query preview, source display, citation format.
- Reference URLs:
  - https://gdpr.eu/ — GDPR: opt-in consent requirements and wording
  - https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/ — UK ICO: informed consent guidance for plain copy

## G. Shared states and quality surfaces

### G1. `EmptyState` — helpful screen when no records exist
- Used for: no projects, no documents, no bookmarks, no highlights, no search
  results, no provider, no conversation.
- Decisions: illustration style, primary action, educational copy.
- Reference URLs:
  - https://emptystat.es/ — curated gallery of empty states from real apps (illustration style + copy inspiration)
  - https://carbondesignsystem.com/patterns/empty-states-pattern/ — Carbon: empty-state anatomy, types, and in-depth guidance
  - https://component.gallery/components/empty-state/ — Component Gallery: how many systems document the same pattern

### G2. `ErrorState` — visible failure with recovery action
- Used for: API, upload, parsing, provider, network, and permission errors.
- Decisions: technical detail level, retry action, support information.
- Reference URLs:
  - https://www.nngroup.com/articles/error-message-guidelines/ — NN/g: error message guidelines (plain language, recovery action)
  - https://design-system.service.gov.uk/components/error-message/ — GOV.UK error message component: accessible, recovery-focused errors

### G3. `ConfirmationDialog` — explicit protection for destructive actions
- Used for: document/project/provider/key deletion.
- Decisions: wording, typed confirmation, danger button treatment.
- Reference URLs:
  - https://www.nngroup.com/articles/confirmation-dialog/ — NN/g: confirmation dialog research (wording, when to use, destructive styling)
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — W3C: confirm/cancel dialog pattern

### G4. `NotFoundPage` — safe route fallback
- Used for: unknown project, document, or URL.
- Decisions: return action, search action, illustration.
- Reference URLs:
  - https://www.nngroup.com/articles/404-error-pages/ — NN/g: 404 page design (return/search actions, helpful copy)
  - https://nextjs.org/docs/app/api-reference/file-conventions/not-found — Next.js `not-found` convention: the route fallback mechanism

### G5. `AccessibilityLayer` — keyboard and assistive-technology behavior
- Used for: every screen.
- Decisions: skip link, focus ring, dialog focus trap, screen-reader labels,
  reduced-motion mode, contrast target.
- Reference URLs:
  - https://www.w3.org/WAI/ARIA/apg/ — W3C ARIA Authoring Practices Guide: THE keyboard/focus/SR-label reference for every pattern above
  - https://www.w3.org/WAI/WCAG22/quickref/ — WCAG 2.2 Quick Reference: contrast target, focus visibility, reduced-motion criteria
  - https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion — MDN: implementing the reduced-motion mode

## Screenshot/reference submission format

Paste references under the relevant component using:

```md
Reference URLs:
- [URL] — what to copy or study
- [URL] — what to avoid
Boss choice: [selected option / changes requested]
```

## Approval status

- First surface: `DashboardOverview` — selected for the first UI/UX review
- Reference URLs: pending boss input
- Global foundation: Not selected
- Authentication: Not selected
- Projects/documents: Not selected
- Reading workspace: Not selected
- Search/DSA: Not selected
- Settings/BYOK AI: Not selected
- Shared states/accessibility: Not selected
