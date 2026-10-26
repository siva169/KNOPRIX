/**
 * Helper utilities for the Drill-Down Bookmark Organizer.
 */

/**
 * Group bookmarks array by document_id.
 * @param {Array} bookmarks
 * @returns {Record<string, Array>}
 */
export function groupBookmarksByDocument(bookmarks = []) {
  const map = {};
  for (const bm of bookmarks) {
    if (!map[bm.document_id]) map[bm.document_id] = [];
    map[bm.document_id].push(bm);
  }
  return map;
}

/**
 * Filter documents list by search term (case-insensitive on file_name).
 * @param {Array} documents
 * @param {string} query
 * @returns {Array}
 */
export function filterDocuments(documents = [], query = '') {
  const q = query.trim().toLowerCase();
  if (!q) return documents;
  return documents.filter((doc) => doc.file_name && doc.file_name.toLowerCase().includes(q));
}

/**
 * Filter a document's bookmarks by name, passage snippet, or notes.
 * @param {Array} bookmarks
 * @param {string} query
 * @returns {Array}
 */
export function filterDocumentBookmarks(bookmarks = [], query = '') {
  const q = query.trim().toLowerCase();
  if (!q) return bookmarks;
  return bookmarks.filter((bm) => {
    const matchName = bm.name && bm.name.toLowerCase().includes(q);
    const matchText = bm.highlighted_text && bm.highlighted_text.toLowerCase().includes(q);
    const matchNotes = bm.notes && bm.notes.toLowerCase().includes(q);
    return Boolean(matchName || matchText || matchNotes);
  });
}
