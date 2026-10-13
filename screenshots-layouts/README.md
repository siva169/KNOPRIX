# Knoprix UI screenshots

These screenshots show Knoprix's local frontend with synthetic preview data.
They are not captures of a signed-in personal or production account.

## Coverage

- Login and registration, including duplicate-account recovery
- Dashboard, project creation, responsive workspace navigation, filters, and document search
- Upload dropzone and its mocked success state
- Text, PDF text-fallback, and slide readers; selection, bookmark, highlight, and focus states
- Bookmark collection and editing
- Contacts, lookup, request lists, privacy, resource-sharing sections, and read-only shared-resource view
- Knowledge map and selected-concept evidence
- DSA visualizer and top-k heap results
- Document chat, summary, answer citations, and full-screen mode
- Command palette and light theme
- Core page layouts at 390, 425, 768, and 1024 CSS pixels wide

## Recreate

From `knoprix-final-project/frontend`, start Vite on `127.0.0.1:5173`, then run:

```bash
node ../screenshots-layouts/capture.mjs
```

The script intercepts the app API and Firebase Auth endpoints with local,
synthetic fixtures. All other non-local requests are aborted. No real sign-in,
account creation, upload, or API write is performed.

`manifest.json` records the file names, dimensions, and fixture note for each
captured image.
