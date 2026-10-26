import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupBookmarksByDocument,
  filterDocuments,
  filterDocumentBookmarks,
} from './bookmarkOrganizerHelper.js';

test('groupBookmarksByDocument groups bookmarks by document_id preserving order', () => {
  const bookmarks = [
    { id: 'b1', document_id: 'doc-A', name: 'Intro', page_number: 1 },
    { id: 'b2', document_id: 'doc-B', name: 'Chapter 1', page_number: 5 },
    { id: 'b3', document_id: 'doc-A', name: 'Conclusion', page_number: 10 },
  ];
  const grouped = groupBookmarksByDocument(bookmarks);

  assert.equal(grouped['doc-A'].length, 2);
  assert.equal(grouped['doc-B'].length, 1);
  assert.equal(grouped['doc-A'][0].id, 'b1');
  assert.equal(grouped['doc-A'][1].id, 'b3');
  assert.equal(grouped['doc-B'][0].id, 'b2');
  assert.equal(grouped['doc-C'], undefined);
});

test('groupBookmarksByDocument handles empty bookmarks list', () => {
  const grouped = groupBookmarksByDocument([]);
  assert.deepEqual(grouped, {});
});

test('filterDocuments matches case-insensitively on file_name', () => {
  const docs = [
    { id: '1', file_name: 'Machine Learning Notes.pdf' },
    { id: '2', file_name: 'DSA AVL Trees.pptx' },
    { id: '3', file_name: 'Chemistry Chapter 4.pdf' },
  ];

  assert.equal(filterDocuments(docs, '').length, 3);
  assert.equal(filterDocuments(docs, 'notes').length, 1);
  assert.equal(filterDocuments(docs, 'notes')[0].id, '1');
  assert.equal(filterDocuments(docs, 'pdf').length, 2);
  assert.equal(filterDocuments(docs, 'nonexistent').length, 0);
});

test('filterDocumentBookmarks matches name, highlighted_text, and notes', () => {
  const bms = [
    { id: '1', name: 'Crucial definition', highlighted_text: 'An AVL tree is a self-balancing BST', notes: '' },
    { id: '2', name: '', highlighted_text: 'Binary search runs in O(log n) time', notes: 'Review before interview' },
    { id: '3', name: 'Summary', highlighted_text: 'Summary of chapter', notes: 'Important formula' },
  ];

  // Match by name
  const matchName = filterDocumentBookmarks(bms, 'definition');
  assert.equal(matchName.length, 1);
  assert.equal(matchName[0].id, '1');

  // Match by text snippet
  const matchText = filterDocumentBookmarks(bms, 'self-balancing');
  assert.equal(matchText.length, 1);
  assert.equal(matchText[0].id, '1');

  // Match by notes
  const matchNotes = filterDocumentBookmarks(bms, 'interview');
  assert.equal(matchNotes.length, 1);
  assert.equal(matchNotes[0].id, '2');

  // Empty query returns all
  assert.equal(filterDocumentBookmarks(bms, '').length, 3);
});
