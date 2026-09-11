import { sourceKeys, type NewsEntry } from './news';
import { kindLabels, formatLabels, monthLabels, monthShort, whenPresets, type Locale } from './i18n';

export { kindLabels, formatLabels, monthLabels, monthShort, whenPresets };
export const sourceLabels: Record<(typeof sourceKeys)[number], string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tangocat: 'Tangocat',
  hoymilonga: 'Hoy Milonga',
};

export function isoDate(value: Date | undefined): string {
  if (!value) {
    return '';
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function uniqueSorted(values: Array<string | undefined>, locale: Locale = 'en'): string[] {
  const lang = locale === 'tr' ? 'tr' : 'en';
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b, lang),
  );
}

export function yearsFrom(posts: NewsEntry[]): string[] {
  const years = new Set<string>();
  for (const post of posts) {
    if (post.data.eventStart) {
      years.add(String(post.data.eventStart.getUTCFullYear()));
    }
    if (post.data.eventEnd) {
      years.add(String(post.data.eventEnd.getUTCFullYear()));
    }
  }
  return [...years].sort();
}

export function dateStripFrom(posts: NewsEntry[], from: Date = new Date()): Array<{ year: string; months: string[] }> {
  const startYear = from.getFullYear();
  const startMonth = from.getMonth();
  let last = new Date(startYear, startMonth + 11, 1);
  for (const post of posts) {
    for (const value of [post.data.eventStart, post.data.eventEnd]) {
      if (!value) {
        continue;
      }
      const eventMonth = new Date(value.getUTCFullYear(), value.getUTCMonth(), 1);
      if (eventMonth > last) {
        last = eventMonth;
      }
    }
  }
  const count = Math.max(12, (last.getFullYear() - startYear) * 12 + (last.getMonth() - startMonth) + 1);
  const groups: Array<{ year: string; months: string[] }> = [];
  for (let i = 0; i < count; i++) {
    const cursor = new Date(startYear, startMonth + i, 1);
    const year = String(cursor.getFullYear());
    const month = String(cursor.getMonth() + 1);
    const group = groups.at(-1);
    if (!group || group.year !== year) {
      groups.push({ year, months: [month] });
    } else {
      group.months.push(month);
    }
  }
  return groups;
}

export function citiesByCountry(posts: NewsEntry[]): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const post of posts) {
    const country = post.data.country;
    const city = post.data.city;
    if (!country || !city) {
      continue;
    }
    map[country] ??= new Set();
    map[country].add(city);
  }
  return Object.fromEntries(
    Object.entries(map).map(([country, cities]) => [
      country,
      [...cities].sort((a, b) => a.localeCompare(b, 'en')),
    ]),
  );
}

export function labelsFor(locale: Locale) {
  return {
    kinds: kindLabels[locale],
    formats: formatLabels[locale],
    months: monthLabels[locale],
    when: whenPresets[locale],
  };
}
