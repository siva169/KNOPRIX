# Knoprix Final Project — Implementation Plan

## Phase 1 — Foundation and baseline

1. Create the isolated project baseline.
2. Confirm copied backend routes and frontend build.
3. Add project configuration and test commands.
4. Keep current backend behavior unchanged.

Verification: backend health, Python compilation, frontend build.

## Phase 2 — UI/UX contract

1. Boss supplies references in `UI-UX.md`.
2. Bruce presents comparison options where a decision is still open.
3. Boss approves the first surface and its responsive behavior.

Verification: approved component decisions recorded in `UI-UX.md`.

## Phase 3 — Vertical slices

Build one complete slice at a time:

1. Foundation shell
2. Authentication
3. Projects and documents
4. Reader, highlights, and bookmarks
5. Search and DSA statistics
6. Dashboard
7. AI provider connection settings
8. Document chat with citations
9. Summary, flashcards, quiz, and web research as separate later slices

Each slice requires implementation, focused verification, responsive review,
accessibility review, changes-log entry, and a local commit.

## Phase 4 — Release readiness

- Complete the 33-point polish/fix checklist.
- Verify 390, 425, 768, and 1024px layouts.
- Run backend and frontend checks.
- Review security and provider data flow.
- Ask separately before deployment or remote Git operations.

## Phase 5 — Gold reader experience

1. Apply and verify the restrained gold token system.
2. Add local reading progress and resume position.
3. Add the command palette with real document and reader actions.
4. Add focus mode with safe restoration of reader state.
5. Add undo-capable status feedback for reversible reader actions.
6. Add continue-reading state to the dashboard.

Each slice must follow `docs/reader-gold-redesign-spec.md`, be checked at
390/425/768/1024px, and receive its own local checkpoint.
