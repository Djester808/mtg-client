/**
 * Short relative timestamp — "just now", "5m ago", "3h ago", "10d ago", "2mo ago", "1y ago".
 *
 * The single implementation. forum-list, forum-detail and user-profile each grew their own
 * copy, and all three disagreed past 30 days — one counted days forever ("400d ago"), one
 * switched to an absolute month ("Aug 2026"), and none of them handled a timestamp with no
 * timezone designator. They now delegate here. Add new callers here rather than inlining a
 * fifth version.
 */
/**
 * Parses a server timestamp, treating one with no timezone designator as UTC.
 *
 * JavaScript reads a bare date-time ("2026-08-16T01:17:32") as *local* time, but the API
 * sends UTC. Where a timestamp round-trips through SQLite it can arrive without the
 * trailing `Z`, and a browser west of UTC then places it in the future — which rendered as
 * "just now" for as many hours as the offset. Appending `Z` is only ever right here: the
 * server has no other timezone to mean.
 */
function toInstant(iso: string): number {
  const hasZone = /([Zz]|[+-]\d{2}:?\d{2})$/.test(iso);
  // Date-only strings ("2026-08-16") are already parsed as UTC; appending would break them.
  return new Date(!hasZone && iso.includes('T') ? `${iso}Z` : iso).getTime();
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = toInstant(iso);
  if (Number.isNaN(then)) return '';

  const secs = Math.floor((now - then) / 1000);
  // Clock skew, or a timestamp the server stamped a moment ahead of this browser.
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Full timestamp for a tooltip, where the relative form is too coarse to be useful. */
export function absoluteTime(iso: string): string {
  const d = new Date(toInstant(iso));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
