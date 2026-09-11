import { monthShort, type Locale } from './i18n';
import type { NewsEntry } from './news';

export type MonthColumn = {
  key: string;
  label: string;
  count: number;
  posts: NewsEntry[];
};

export function groupingDate(post: NewsEntry): Date {
  return post.data.eventStart ?? post.data.date;
}

export function monthKey(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${value.getUTCFullYear()}-${month}`;
}

export function monthLabel(value: Date, locale: Locale): string {
  return `${monthShort[locale][value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

export function dayLabel(start?: Date, end?: Date): string {
  if (!start) {
    return '';
  }
  const first = start.getUTCDate();
  if (!end) {
    return String(first);
  }
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();
  if (sameDay) {
    return String(first);
  }
  return `${first}–${end.getUTCDate()}`;
}

export function initials(title: string): string {
  const parts = title.split(/\s+/).filter((word) => /[\p{L}]/u.test(word[0] ?? ''));
  const letters = parts.slice(0, 2).map((word) => word[0]!.toUpperCase());
  return letters.join('') || title.slice(0, 2).toUpperCase();
}

export function searchText(post: NewsEntry): string {
  return [
    post.data.title,
    post.data.summary,
    post.data.eventName,
    post.data.city,
    post.data.country,
    post.data.eventLocation,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function groupByMonth(posts: NewsEntry[], locale: Locale): MonthColumn[] {
  const groups = new Map<string, NewsEntry[]>();
  for (const post of posts) {
    const date = groupingDate(post);
    const key = monthKey(date);
    const list = groups.get(key);
    if (list) {
      list.push(post);
    } else {
      groups.set(key, [post]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, grouped]) => {
      const date = groupingDate(grouped[0]!);
      return {
        key,
        label: monthLabel(date, locale),
        count: grouped.length,
        posts: grouped,
      };
    });
}

export function currentMonthKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

export function nextMonthKey(now: Date = new Date()): string {
  return currentMonthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

export function eagerMonthKeys(selected?: NewsEntry, now: Date = new Date()): string[] {
  const keys = new Set([currentMonthKey(now), nextMonthKey(now)]);
  if (selected) {
    keys.add(monthKey(groupingDate(selected)));
  }
  return [...keys];
}
