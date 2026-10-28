# Contact annotation sharing and AI Favorites

## Definition of done

- [ ] Sharing a document offers explicit, privacy-safe choices for including all current bookmarks and/or highlights.
- [ ] One recipient share request represents the document bundle and requires one acceptance.
- [ ] The accepted read-only document exposes only the selected annotation snapshots; owner/project internals stay private.
- [ ] AI users can save or remove an entire assistant response, including its question and citations.
- [ ] The existing bottom-left organizer exposes document bookmarks and AI Favorites without breaking document bookmark navigation.
- [ ] Ownership, contact eligibility, deletion, revocation, and account cascade behavior remain enforced server-side.
- [ ] Responsive/accessibility checks pass at 390, 425, 768, and 1024px.
- [ ] Focused backend, frontend, browser, build, audit, and diff checks pass.
- [ ] Every vertical slice is committed locally, then the approved `siva169/KNOPRIX` push is verified.

## Locked API contract

### Bundled document shares

`POST /api/v1/shares`

```json
{
  "recipientKnoprixIds": ["KP-XXXXXXXXXX"],
  "resourceType": "document",
  "resourceId": "document-id",
  "includeBookmarks": true,
  "includeHighlights": false
}
```

The response keeps the existing per-recipient result shape and adds annotation
counts for successful document bundles. Non-document shares reject annotation
options.

`GET /api/v1/shared-resources/{shareId}` returns the existing safe document
metadata plus `sharedBookmarks` and `sharedHighlights` when they were selected
at send time. These are snapshots: later owner edits do not silently expand the
recipient's permission.

### AI Favorites

`POST /api/ai/favorites`

```json
{
  "projectId": "project-id-or-null",
  "question": "What is the key idea?",
  "answer": "The key idea is…",
  "citations": [],
  "providerId": "zai-glm-free",
  "modelId": "glm-4.5-flash"
}
```

`GET /api/ai/favorites?projectId=...` lists the signed-in user's favorites;
`DELETE /api/ai/favorites/{favoriteId}` removes only the owner's favorite.

## Vertical-slice checklist

1. [x] Sharing schema/API/security + backend tests.
2. [x] Sharing UI controls + read-only annotation rendering + focused backend/build verification. Browser coverage remains in the final responsive matrix.
3. [ ] AI Favorites schema/API/security + backend/frontend tests.
4. [ ] AI response save controls + organizer section + browser tests.
5. [ ] Full verification, checklist review, local commits, and approved push.

## UI contract

- Preserve Knoprix dark/gold tokens, existing touch-target conventions, and the current organizer.
- Use explicit labels and counts, with opt-in checkboxes defaulting off for annotations.
- Use one AI response action icon with a text/tooltip state that distinguishes Save from Remove.
- Keep the user-facing lists readable at 390px first, then scale up.
