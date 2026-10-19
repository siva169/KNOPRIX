import assert from 'node:assert/strict';
import test from 'node:test';
import { splitHighlightSegments } from './highlightSegments.js';

test('later overlapping highlights take precedence only within their range', () => {
  assert.deepEqual(
    splitHighlightSegments('beta gamma delta', [
      { start: 0, end: 10, id: 'older', color: 'yellow' },
      { start: 5, end: 16, id: 'newer', color: 'green' },
    ]),
    [
      { text: 'beta ', id: 'older', color: 'yellow' },
      { text: 'gamma delta', id: 'newer', color: 'green' },
    ],
  );
});

test('adjacent annotations remain distinct and preserve all source text', () => {
  assert.deepEqual(
    splitHighlightSegments('one two', [
      { start: 0, end: 3, id: 'first', color: 'yellow' },
      { start: 4, end: 7, id: 'second', color: 'pink' },
    ]),
    [
      { text: 'one', id: 'first', color: 'yellow' },
      { text: ' ' },
      { text: 'two', id: 'second', color: 'pink' },
    ],
  );
});

test('invalid and out-of-bounds ranges are ignored', () => {
  assert.deepEqual(
    splitHighlightSegments('safe text', [
      { start: -1, end: 2, id: 'negative', color: 'yellow' },
      { start: 3, end: 3, id: 'empty', color: 'green' },
      { start: 5, end: 11, id: 'overflow', color: 'pink' },
    ]),
    [{ text: 'safe text' }],
  );
});
