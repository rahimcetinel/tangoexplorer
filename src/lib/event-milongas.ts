import type { Milonga } from './hoy';
import { normalizeCity } from './now-core';

export type MilongaDay = {
  slug: string;
  label: string;
  date: string;
  items: Milonga[];
};

const WEEKDAYS: { slug: string; label: string }[] = [
  { slug: 'sunday', label: 'Sunday' },
  { slug: 'monday', label: 'Monday' },
  { slug: 'tuesday', label: 'Tuesday' },
  { slug: 'wednesday', label: 'Wednesday' },
  { slug: 'thursday', label: 'Thursday' },
  { slug: 'friday', label: 'Friday' },
  { slug: 'saturday', label: 'Saturday' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayKey(value: Date): string {
  return `${value.getUTCFullYear()}-${value.getUTCMonth()}-${value.getUTCDate()}`;
}

// One entry per weekday in the event range, labelled with the first date that
// weekday falls on. A weekly milonga repeats, so listing it once is enough.
export function milongasDuring(
  milongas: Milonga[],
  city: string | undefined,
  start: Date | undefined,
  end: Date | undefined,
): MilongaDay[] {
  if (!city || !start) return [];
  const wanted = normalizeCity(city);
  const inCity = milongas.filter((item) => item.city && normalizeCity(item.city) === wanted);
  if (!inCity.length) return [];

  const last = end ?? start;
  const days = new Map<string, { date: Date; weekday: string }>();
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const limit = 14;
  let index = 0;
  while (cursor <= last && index < limit) {
    const key = dayKey(cursor);
    const weekday = WEEKDAYS[cursor.getUTCDay()]!;
    if (!days.has(weekday.slug)) {
      days.set(weekday.slug, { date: new Date(cursor), weekday: weekday.label });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    index += 1;
  }

  const groups: MilongaDay[] = [];
  for (const [slug, value] of days) {
    const items = inCity
      .filter((item) => item.days.includes(slug))
      .sort((a, b) => (a.start || '99').localeCompare(b.start || '99') || a.name.localeCompare(b.name));
    if (!items.length) continue;
    groups.push({
      slug,
      label: `${value.weekday} ${value.date.getUTCDate()} ${MONTHS[value.date.getUTCMonth()]}`,
      date: value.date.toISOString().slice(0, 10),
      items,
    });
  }
  return groups;
}
