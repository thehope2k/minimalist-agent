import type { SessionSummary } from '@/lib/electron';

export function revealLabel(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'Show in Finder';
  if (ua.includes('Windows')) return 'Show in Explorer';
  return 'Show in File Manager';
}

export function groupByDate(
  items: SessionSummary[],
  archived: boolean,
): Array<[string, SessionSummary[]]> {
  if (archived) return items.length ? [['Archived', items]] : [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOf7Days = startOfToday - 7 * 86_400_000;
  const startOf30Days = startOfToday - 30 * 86_400_000;

  const groups = new Map<string, SessionSummary[]>();
  const push = (key: string, s: SessionSummary) => {
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  };

  for (const s of items) {
    const ts = s.lastMessageAt;
    if (ts >= startOfToday) push('Today', s);
    else if (ts >= startOfYesterday) push('Yesterday', s);
    else if (ts >= startOf7Days) push('Previous 7 Days', s);
    else if (ts >= startOf30Days) push('Previous 30 Days', s);
    else {
      const d = new Date(ts);
      push(d.toLocaleString(undefined, { month: 'long', year: 'numeric' }), s);
    }
  }
  return Array.from(groups.entries());
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString();
}
