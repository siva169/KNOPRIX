# Team Contributions — Knoprix (Mid-Review Build)

**Project:** A DSA-Powered Knowledge Management Platform with Intelligent
Document Interaction

**Team members (equal contribution — 25% each):**

| # | Member | Roll No |
|---|---|---|
| 1 | T.V.S.S. Phanindra Guptha | cb.ai.u4aid25055 |
| 2 | M. Vittal | cb.ai.u4aid25033 |
| 3 | Athul V.R. | cb.ai.u4aid25005 |
| 4 | K. Nanda Kishore | cb.ai.u4aid25027 |

---

## Declaration of Equal Contribution

All four members contributed **equally (25% each)** to the design,
development, testing, and documentation of the project. Every member was
involved in all phases of the work — ideation, implementation, debugging,
and review — and no single member performed a disproportionate share of
any module.

---

## Per-Member Contributions

### T.V.S.S. Phanindra Guptha (cb.ai.u4aid25055)

- Led the overall architecture and the DSA engine design (Trie, Inverted
  Index, Stack) and how each structure maps to a product feature.
- Built the backend API (FastAPI) for authentication, projects, documents,
  search, bookmarks, and highlights, with ownership-based security checks.
- Implemented the persistent database layer supporting both SQLite (dev)
  and PostgreSQL (deployed) so user data survives restarts.
- Verified the full API flow end-to-end and ran the browser-level testing
  of every feature against the live app.

### M. Vittal (cb.ai.u4aid25033)

- Designed and implemented the Trie-based autocomplete and the Inverted
  Index full-text search engine, including ranking by word frequency and
  page-level result locations.
- Built the search UI in the navbar that shows ranked results with document
  names, scores, snippets, and page numbers.
- Implemented the document parsing pipeline (PDF, PPTX, DOCX, TXT) that
  extracts per-page text for indexing and highlighting.
- Tested search indexing on a variety of uploaded documents and tuned the
  ranking for relevant results.

### Athul V.R. (cb.ai.u4aid25005)

- Designed and implemented the frontend document viewers: the PDF canvas
  renderer with crisp supersampled text, the slideshow viewer, and the
  plain-text viewer.
- Built the text-selection toolbar (bookmark, copy, highlight with six
  colors, highlight-all mode) and the per-page bookmarking flow.
- Implemented the LIFO Stack bookmarks drawer with animated push/pop and
  top-of-stack indicators, and the mobile-first responsive layout.
- Carried out cross-device testing at 390/425/768/1024 px widths and fixed
  UI issues found during testing.

### K. Nanda Kishore (cb.ai.u4aid25027)

- Implemented the highlight storage and rendering across all file types
  (PDF text layer, slides, and plain text) including match-everywhere mode.
- Built the DSA statistics visualizer (Trie / Inverted Index / Stack live
  stats, top-keyword cloud) and the upload workflow with validation.
- Authored the plain-English project documentation: feature workflows,
  DSA explanations, and the Trie vs Inverted Index comparison used for the
  presentation and report.
- Conducted final review passes on the codebase, prepared demo scenarios,
  and coordinated the team's deliverables and presentation slides.

---

## Joint Work (all four members)

- Weekly planning, code reviews, and shared debugging sessions.
- Combined design decisions: project-based file organization, the
  highlight + bookmark + stack interaction model, and the study-friendly
  orange theme.
- Joint verification of the deployed application, the demo account, and
  the final presentation rehearsal.
