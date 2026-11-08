import type { NewsEntry } from './news';
import { newsSlug } from './news';
import type { Milonga } from './hoy';
import { formatEventRange } from './timeline';
import { todaySlug } from './milonga-html';

export type NowEvent = {
  t: string;
  slug: string;
  ci: string;
  co: string;
  dates: string;
  w: string;
};

export type NowMilonga = {
  n: string;
  c: string;
  s: string;
  e: string;
  v: string;
  ty: string;
};

export type NowCoord = [string, number, number];

export type NowData = {
  today: string;
  events: NowEvent[];
  milongas: NowMilonga[];
  coords: NowCoord[];
};

function dayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function buildNowData(posts: NewsEntry[], milongas: Milonga[], now: Date = new Date()): NowData {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const events = posts
    .filter((post) => {
      const start = post.data.eventStart;
      if (!start) return false;
      const end = post.data.eventEnd ?? start;
      return dayStart(start) <= today && dayStart(end) >= today;
    })
    .map((post) => ({
      t: post.data.title,
      slug: newsSlug(post),
      ci: post.data.city ?? '',
      co: post.data.country ?? '',
      dates: formatEventRange(post.data.eventStart, post.data.eventEnd),
      w: post.data.eventLocation ?? [post.data.city, post.data.country].filter(Boolean).join(', '),
    }));

  const tonight = todaySlug(now);
  const tonightMilongas = milongas
    .filter((item) => item.days.includes(tonight))
    .map((item) => ({
      n: item.name,
      c: item.city,
      s: item.start,
      e: item.end,
      v: item.venue,
      ty: item.type,
    }));

  const sums = new Map<string, { lat: number; lng: number; count: number }>();
  for (const item of milongas) {
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number' || !item.city) continue;
    const current = sums.get(item.city) ?? { lat: 0, lng: 0, count: 0 };
    current.lat += item.lat;
    current.lng += item.lng;
    current.count += 1;
    sums.set(item.city, current);
  }
  const coords: NowCoord[] = [...sums.entries()].map(([city, value]) => [
    city,
    Number((value.lat / value.count).toFixed(4)),
    Number((value.lng / value.count).toFixed(4)),
  ]);

  return { today: tonight, events, milongas: tonightMilongas, coords };
}
