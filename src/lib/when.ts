export const whenIds = ['this-week', 'this-weekend', 'next-week'] as const;
export type WhenId = (typeof whenIds)[number];

const DAY = 86_400_000;

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Windows are computed from the visitor's local "today" but expressed as UTC
// day strings, matching how event dates are stored in the index.
export function whenWindow(id: string, now: Date = new Date()): { from: string; to: string } | null {
  const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = new Date(base).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = base + mondayOffset * DAY;
  if (id === 'this-week') {
    return { from: isoDay(monday), to: isoDay(monday + 6 * DAY) };
  }
  if (id === 'this-weekend') {
    return { from: isoDay(monday + 4 * DAY), to: isoDay(monday + 6 * DAY) };
  }
  if (id === 'next-week') {
    return { from: isoDay(monday + 7 * DAY), to: isoDay(monday + 13 * DAY) };
  }
  return null;
}

export function overlapsWindow(
  item: { st?: string; en?: string },
  window: { from: string; to: string } | null,
): boolean {
  if (!window) {
    return true;
  }
  const start = item.st || item.en;
  const end = item.en || item.st;
  if (!start) {
    return false;
  }
  return end >= window.from && start <= window.to;
}
