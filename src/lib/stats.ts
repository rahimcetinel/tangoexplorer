import type { NewsEntry } from './news';
import { countryId } from './countries';

const DAY = 86_400_000;

function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function localToday(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function eventSpan(post: NewsEntry): { start: number; end: number } | null {
  const start = post.data.eventStart;
  if (!start) {
    return null;
  }
  const end = post.data.eventEnd ?? start;
  return { start: utcDay(start), end: utcDay(end) };
}

function countInWindow(posts: NewsEntry[], from: number, to: number): number {
  return posts.filter((post) => {
    const span = eventSpan(post);
    return span !== null && span.start <= to && span.end >= from;
  }).length;
}

export type BoardStats = {
  total: number;
  countries: number;
  cities: number;
  thisWeek: number;
  thisWeekend: number;
  today: number;
  nextSevenDays: number;
};

// Build-time numbers for the hero. The board is static, so "today" is the build
// day; the footer already promises a daily refresh.
export function boardStats(posts: NewsEntry[], now: Date = new Date()): BoardStats {
  const today = localToday(now);
  const weekday = new Date(today).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = today + mondayOffset * DAY;
  const sunday = monday + 6 * DAY;
  const friday = monday + 4 * DAY;

  const countries = new Set<string>();
  const cities = new Set<string>();
  for (const post of posts) {
    const country = countryId(post.data.country);
    if (country) {
      countries.add(country);
    }
    if (post.data.city) {
      cities.add(post.data.city.trim().toLowerCase());
    }
  }

  return {
    total: posts.length,
    countries: countries.size,
    cities: cities.size,
    thisWeek: countInWindow(posts, monday, sunday),
    thisWeekend: countInWindow(posts, friday, sunday),
    today: countInWindow(posts, today, today),
    nextSevenDays: countInWindow(posts, today, today + 6 * DAY),
  };
}
