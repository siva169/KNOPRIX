import test from 'node:test';
import assert from 'node:assert/strict';
import { groupConversationsByDate } from './recentChatsHelper.js';

test('groupConversationsByDate handles empty input', () => {
  assert.deepEqual(groupConversationsByDate([]), []);
  assert.deepEqual(groupConversationsByDate(null), []);
});

test('groupConversationsByDate groups conversations into appropriate chronological buckets', () => {
  const now = Date.now();
  const convs = [
    { id: '1', title: 'Today chat', updatedAt: new Date(now).toISOString() },
    { id: '2', title: 'Yesterday chat', updatedAt: new Date(now - 86400000).toISOString() },
    { id: '3', title: '5 days ago chat', updatedAt: new Date(now - 4 * 86400000).toISOString() },
    { id: '4', title: 'Last month chat', updatedAt: new Date(now - 30 * 86400000).toISOString() },
  ];

  const grouped = groupConversationsByDate(convs);
  assert.ok(grouped.length >= 2);
  const titles = grouped.map((g) => g.title);
  assert.ok(titles.includes('Today'));
  assert.ok(titles.includes('Older'));
});
