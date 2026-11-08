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
