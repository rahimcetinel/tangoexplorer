import health from '../data/link-health.json';

export type LinkStatus = 'ok' | 'dead' | 'blocked' | 'unreachable' | 'error';

type Entry = { status: LinkStatus; checkedAt: string };

const links = (health as { links: Record<string, Entry> }).links ?? {};

export function healthFor(...urls: Array<string | undefined>): Entry | undefined {
  for (const url of urls) {
    if (url && links[url]) return links[url];
  }
  return undefined;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function relativeCheck(checkedAt: string, now: Date = new Date()): string {
  const checked = new Date(`${checkedAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(checked.valueOf())) return '';
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - checked.valueOf()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const value = new Date(`${checkedAt.slice(0, 10)}T00:00:00Z`);
  return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}
