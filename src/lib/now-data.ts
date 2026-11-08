import type { NewsEntry } from './news';
import { newsSlug } from './news';
import type { Milonga } from './hoy';
import { formatEventRange } from './timeline';
import { todaySlug } from './milonga-html';
import { kindLabels } from './i18n';

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
  co: string;
  s: string;
  e: string;
  v: string;
  ty: string;
};

export type NowCoord = [string, number, number];

export type NowAllEvent = {
  t: string;
  slug: string;
  ci: string;
  co: string;
  st: string;
  en: string;
  dates: string;
  w: string;
  k: string;
};

export type NowAllMilonga = {
  n: string;
  c: string;
  co: string;
  days: string[];
  s: string;
  e: string;
  v: string;
  ty: string;
};

export type NowData = {
  today: string;
  events: NowEvent[];
  milongas: NowMilonga[];
  coords: NowCoord[];
  cities: string[];
  countries: string[];
  allEvents: NowAllEvent[];
  allMilongas: NowAllMilonga[];
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
      co: item.country,
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

  const cities = [
    ...new Set([
      ...posts.map((post) => post.data.city).filter((city): city is string => Boolean(city)),
      ...milongas.map((item) => item.city).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'en'));

  const countries = [
    ...new Set([
      ...posts.map((post) => post.data.country).filter((country): country is string => Boolean(country)),
      ...milongas.map((item) => item.country).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'en'));

  const allEvents: NowAllEvent[] = posts
    .filter((post) => post.data.eventStart)
    .map((post) => {
      const start = post.data.eventStart!;
      const end = post.data.eventEnd ?? start;
      return {
        t: post.data.title,
        slug: newsSlug(post),
        ci: post.data.city ?? '',
        co: post.data.country ?? '',
        st: start.toISOString().slice(0, 10),
        en: end.toISOString().slice(0, 10),
        dates: formatEventRange(start, end),
        w: post.data.eventLocation ?? [post.data.city, post.data.country].filter(Boolean).join(', '),
        k: post.data.kinds[0] ? (kindLabels.en[post.data.kinds[0]] ?? '') : '',
      };
    })
    .sort((a, b) => a.st.localeCompare(b.st));

  const allMilongas: NowAllMilonga[] = milongas.map((item) => ({
    n: item.name,
    c: item.city,
    co: item.country,
    days: item.days,
    s: item.start,
    e: item.end,
    v: item.venue,
    ty: item.type,
  }));

  return {
    today: tonight,
    events,
    milongas: tonightMilongas,
    coords,
    cities,
    countries,
    allEvents,
    allMilongas,
  };
}
