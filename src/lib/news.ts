import { getCollection, type CollectionEntry } from 'astro:content';
import { eventKinds, contentFormats, sourceKeys } from '../content.config';
import { type Category, type Locale } from './i18n';

export type NewsEntry = CollectionEntry<'news'>;
export type { Category };
export { eventKinds, contentFormats, sourceKeys };

export function newsSlug(post: NewsEntry): string {
  const id = post.id.replaceAll('\\', '/');
  return id.split('/').at(-1) ?? post.id;
}

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function eventStartMs(post: NewsEntry): number | null {
  return post.data.eventStart ? startOfUtcDay(post.data.eventStart) : null;
}

function eventEndMs(post: NewsEntry): number | null {
  const end = post.data.eventEnd ?? post.data.eventStart;
  return end ? startOfUtcDay(end) : null;
}

// The feed, search and planner keep events that are already running, so a
// festival that started yesterday is still findable while it lasts.
export function hasNotEnded(post: NewsEntry, now: Date = new Date()): boolean {
  const end = eventEndMs(post);
  return end === null || end >= startOfUtcDay(now);
}

// Listing pages only show events that have not started yet: a festival running
// 10-14 November leaves the board on the 10th, while search, the planner and the
// feed keep showing it for people already there.
export function hasNotStarted(post: NewsEntry, now: Date = new Date()): boolean {
  const start = eventStartMs(post);
  return start === null || start > startOfUtcDay(now);
}

export function compareByEventDate(a: NewsEntry, b: NewsEntry, today: Date = new Date()): number {
  const todayMs = startOfUtcDay(today);
  const aEnd = eventEndMs(a);
  const bEnd = eventEndMs(b);
  const aUpcoming = aEnd !== null && aEnd >= todayMs;
  const bUpcoming = bEnd !== null && bEnd >= todayMs;
  if (aUpcoming !== bUpcoming) {
    return aUpcoming ? -1 : 1;
  }
  const aStart = eventStartMs(a);
  const bStart = eventStartMs(b);
  if (aStart === null && bStart === null) {
    return b.data.date.valueOf() - a.data.date.valueOf();
  }
  if (aStart === null) {
    return 1;
  }
  if (bStart === null) {
    return -1;
  }
  if (aStart !== bStart) {
    return aStart - bStart;
  }
  return a.data.title.localeCompare(b.data.title, 'en');
}

const newsCache = new Map<Locale, Promise<NewsEntry[]>>();
const boardCache = new Map<Locale, Promise<NewsEntry[]>>();

export async function getNews(locale: Locale): Promise<NewsEntry[]> {
  let cached = newsCache.get(locale);
  if (!cached) {
    cached = getCollection('news', (entry) => entry.data.locale === locale).then((posts) =>
      posts.filter((post) => hasNotEnded(post)).sort((a, b) => compareByEventDate(a, b)),
    );
    newsCache.set(locale, cached);
  }
  return cached;
}

export async function getBoardNews(locale: Locale): Promise<NewsEntry[]> {
  let cached = boardCache.get(locale);
  if (!cached) {
    cached = getNews(locale).then((posts) => posts.filter((post) => hasNotStarted(post)));
    boardCache.set(locale, cached);
  }
  return cached;
}

export function featuredOf(posts: NewsEntry[]): NewsEntry | undefined {
  return posts.find((post) => post.data.featured) ?? posts[0];
}
