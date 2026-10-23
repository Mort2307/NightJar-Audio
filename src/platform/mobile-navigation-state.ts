/**
 * Shared, data-only logic for the five-item Nightjar mobile dock.
 * Counts are display metadata, never authorization checks or data fetches.
 */

const normaliseCount = (count: number): number =>
  Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

/**
 * The "You" tab owns Account, Profile, Calendar and Protection.
 * Other destinations remain exact matches so a listener can tell whether
 * they are in Home, Library or Explore, and Owner Inbox never impersonates
 * the Admin workspace.
 */
export function isMobileNavigationActive(currentView: string, tabView: string): boolean {
  if (currentView === tabView) return true;
  return tabView === 'settings' && ['profile', 'calendar', 'protection'].includes(currentView);
}

export function activityAccessibleName(base: string, unread: number): string {
  const count = normaliseCount(unread);
  return count === 0
    ? base
    : `${base}. ${count} unread notification${count === 1 ? '' : 's'}.`;
}

export function inboxAccessibleName(base: string, unread: number, needsReply: number): string {
  const unreadCount = normaliseCount(unread);
  const replyCount = normaliseCount(needsReply);
  const details = [
    ...(unreadCount ? [`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`] : []),
    ...(replyCount ? [`${replyCount} conversation${replyCount === 1 ? '' : 's'} need${replyCount === 1 ? 's' : ''} your reply`] : []),
  ];
  return details.length ? base + '. ' + details.join('. ') + '.' : base;
}
