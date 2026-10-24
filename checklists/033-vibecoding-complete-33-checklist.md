# AI Wing Chat Feature — 33-Point Polish/Fix Evaluation

**Scope:** Source-aware AI chat and account-synced Recent Chats only.
**Status:** In progress; applicable items are completed after implementation
and responsive/browser verification. This does not claim whole-project
completion.
**Source checklists:** `../../checklists/016-vibecoding-polish-checklist.md`
and `../../checklists/017-vibecoding-fix-checklist.md` in the AI-Rules
workspace.

`[ ]` means pending verification. `N/A` means the item is outside this feature
scope, with the reason recorded. At the initiative checkpoint, every
applicable item must be checked with evidence.

## Polish checklist (16)

| # | Item | Status for this feature |
|---|---|---|
| 1 | Dark mode toggle | N/A — the feature reuses the existing AI Wing theme; it does not add a global theme control. |
| 2 | Cookie banner | N/A — no cookie-consent behavior is added. |
| 3 | Back-to-Top button | N/A — no long-form page is added. |
| 4 | Mobile menu | N/A — the feature does not change application navigation. |
| 5 | Keyboard shortcuts | N/A — no custom shortcut is requested; dialog keyboard accessibility remains in scope. |
| 6 | Hover, active, and focus states | [ ] Verify every new interactive control. |
| 7 | Custom scrollbar | N/A — no new global scrolling surface or scrollbar theme is requested. |
| 8 | Copy button | N/A — message-copy behavior is outside the approved feature scope. |
| 9 | Skeleton loader | [ ] Verify loading feedback while Recent Chats are fetched. |
| 10 | Sticky header | N/A — no application header behavior is changed. |
| 11 | Skip to content | N/A — no global navigation structure is changed. |
| 12 | Open Graph preview | N/A — no shareable page or metadata is added. |
| 13 | Empty states | [ ] Verify empty history and no title-search results. |
| 14 | Expandable FAQs | N/A — no FAQ content is added. |
| 15 | Toast notifications | [ ] Verify success/error feedback for rename and delete. |
| 16 | Password visibility | N/A — no password input is added. |

## Fix checklist (17)

| # | Item | Status for this feature |
|---|---|---|
| 1 | Remove horizontal scroll | [ ] Verify at 390, 425, 768, and 1024 px. |
| 2 | Meta descriptions | N/A — no route/page metadata is added. |
| 3 | Favicon | N/A — no new app shell is added. |
| 4 | Page titles | N/A — no route is added. |
| 5 | Compress images | N/A — no images are introduced. |
| 6 | Clickable email | N/A — no email address is introduced. |
| 7 | Fix broken links | N/A — no static site-navigation link is added; provider web citations are separately URL-validated. |
| 8 | Mobile menu | N/A — the feature does not change application navigation. |
| 9 | Remove placeholder text | N/A — no marketing or placeholder page content is added. |
| 10 | Test on a mobile device/viewport | [ ] Verify the approved mobile dialog layout at 390 and 425 px. |
| 11 | Empty state page | [ ] Verify empty history and no-results states are actionable. |
| 12 | Optimize for mobile | [ ] Verify touch targets and responsive layout at required widths. |
| 13 | Fix mobile overflow | [ ] Verify text/actions do not clip at 390 and 425 px. |
| 14 | Add error messages | [ ] Verify history API failures and retry behavior. |
| 15 | Add success messages | [ ] Verify rename/delete success feedback. |
| 16 | Add 404 page | N/A — no route/page is added. |
| 17 | Clickable phone number | N/A — no phone number is introduced. |
