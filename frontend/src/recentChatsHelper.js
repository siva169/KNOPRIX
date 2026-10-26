/**
 * Helper to group conversations chronologically:
 * - Today
 * - Yesterday
 * - Previous 7 Days
 * - Older
 */
export function groupConversationsByDate(convs) {
  if (!Array.isArray(convs) || !convs.length) return [];

  const groups = {
    today: [],
    yesterday: [],
    previous7Days: [],
    older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 6 * 86400000;

  for (const c of convs) {
    const time = new Date(c.updatedAt || c.created_at || 0).getTime();
    if (time >= startOfToday) {
      groups.today.push(c);
    } else if (time >= startOfYesterday) {
      groups.yesterday.push(c);
    } else if (time >= startOf7Days) {
      groups.previous7Days.push(c);
    } else {
      groups.older.push(c);
    }
  }

  const result = [];
  if (groups.today.length) result.push({ title: 'Today', items: groups.today });
  if (groups.yesterday.length) result.push({ title: 'Yesterday', items: groups.yesterday });
  if (groups.previous7Days.length) result.push({ title: 'Previous 7 Days', items: groups.previous7Days });
  if (groups.older.length) result.push({ title: 'Older', items: groups.older });
  return result;
}
