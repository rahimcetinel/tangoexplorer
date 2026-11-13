import {
  DAYS_ORDER,
  regionLabel,
  sourceLabel,
  type Milonga,
  type MilongaType,
} from './hoy';
import { ui, weekdaysLong, weekdaysShort, type Locale } from './i18n';
import { milongaIcsHref } from './milonga-ics';

export type MilongaFilters = { region: string; city: string; day: string; type: string; q: string };
export type MilongaCopy = typeof ui.en;

const DAY_INDEX: Record<string, number> = Object.fromEntries(DAYS_ORDER.map((day, index) => [day, index]));

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function todaySlug(now: Date = new Date()): string {
  return DAYS_ORDER[(now.getDay() + 6) % 7]!;
}

export function orderedDays(now: Date = new Date()): string[] {
  const index = (now.getDay() + 6) % 7;
  return [...DAYS_ORDER.slice(index), ...DAYS_ORDER.slice(0, index)];
}

export function defaultFilters(items: Milonga[]): MilongaFilters {
  const hasTurkey = items.some((item) => item.region === 'turkiye');
  return {
    region: hasTurkey ? 'turkiye' : (items[0]?.region ?? 'turkiye'),
    city: '',
    day: '',
    type: '',
    q: '',
  };
}

export function matchesMilonga(item: Milonga, filters: MilongaFilters): boolean {
  if (item.region !== filters.region) return false;
  if (filters.city && item.city !== filters.city) return false;
  if (filters.type && item.type !== filters.type) return false;
  if (filters.day && !item.days.includes(filters.day)) return false;
  if (filters.q) {
    const hay = `${item.name} ${item.venue} ${item.area} ${item.locality ?? ''} ${item.city} ${item.country}`.toLowerCase();
    if (!hay.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

function byTime(a: Milonga, b: Milonga): number {
  return (a.start || '99').localeCompare(b.start || '99') || a.name.localeCompare(b.name);
}

export function citiesForRegion(items: Milonga[], region: string): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.region === region && item.city) set.add(item.city);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'en'));
}

export function milongaTimeHtml(start?: string, end?: string): string {
  if (!start) {
    return `<span class="app-mitem-time">—</span>`;
  }
  // The two spans sit on separate lines, so screen readers and copy/paste
  // used to glue the times together ("19:3022:30").
  const endHtml = end
    ? `<span class="sr-only">–</span><span class="app-mitem-time-end">${escapeHtml(end)}</span>`
    : '';
  return (
    `<span class="app-mitem-time">` +
    `<span class="app-mitem-time-start">${escapeHtml(start)}</span>${endHtml}` +
    `</span>`
  );
}

export function tabsHtml(
  items: Milonga[],
  filters: MilongaFilters,
  locale: Locale,
  copy: MilongaCopy,
  now: Date = new Date(),
): string {
  const today = todaySlug(now);
  const present = orderedDays(now).filter((day) =>
    items.some(
      (item) =>
        item.region === filters.region &&
        item.days.includes(day) &&
        (!filters.type || item.type === filters.type) &&
        (!filters.city || item.city === filters.city),
    ),
  );
  return (
    `<button type="button" class="app-mtab${filters.day ? '' : ' is-active'}" data-day="">${copy.milongaAllDays}</button>` +
    present
      .map(
        (day) =>
          `<button type="button" class="app-mtab${filters.day === day ? ' is-active' : ''}${day === today ? ' is-today' : ''}" data-day="${day}">${weekdaysShort[locale][DAY_INDEX[day]]}</button>`,
      )
      .join('')
  );
}

function itemHtml(
  item: Milonga,
  copy: MilongaCopy,
  selected: string | null,
): string {
  const meta = item.venue || item.area;
  const typeLabel = item.type === 'practica' ? copy.milongaTypePractica : copy.milongaTypeMilonga;
  const schedule = item.schedule && item.schedule !== 'weekly' ? ` · ${scheduleLabel(item.schedule, copy)}` : '';
  return (
    `<button type="button" class="app-mitem${selected === item.id ? ' is-selected' : ''}" data-milonga-id="${escapeHtml(item.id)}">` +
    milongaTimeHtml(item.start, item.end) +
    `<span class="app-mitem-body">` +
    `<span class="app-mitem-name">${escapeHtml(item.name)}</span>` +
    (meta ? `<span class="app-mitem-meta">${escapeHtml(meta)}${schedule}</span>` : '') +
    `</span>` +
    `<span class="app-mitem-tags">` +
    (item.city
      ? `<span class="app-mitem-city">${escapeHtml(item.city)}</span>`
      : '') +
    `<span class="app-mitem-type is-${item.type}">${typeLabel}</span>` +
    (item.price ? `<span class="app-mitem-price">${escapeHtml(item.price)}</span>` : '') +
    `</span>` +
    `</button>`
  );
}

export function scheduleLabel(schedule: string, copy: MilongaCopy): string {
  if (schedule === 'monthly') return copy.milongaMonthly;
  if (schedule === 'biweekly') return copy.milongaBiweekly;
  return copy.milongaWeekly;
}

export function listHtml(
  items: Milonga[],
  filters: MilongaFilters,
  locale: Locale,
  copy: MilongaCopy,
  selected: string | null = null,
  now: Date = new Date(),
): string {
  const today = todaySlug(now);
  const filtered = items.filter((item) => matchesMilonga(item, filters));
  const groups: { day: string; rows: Milonga[] }[] = [];
  if (filters.day) {
    const rows = filtered.slice().sort(byTime);
    if (rows.length) groups.push({ day: filters.day, rows });
  } else {
    for (const day of orderedDays(now)) {
      const rows = filtered.filter((item) => item.days.includes(day)).sort(byTime);
      if (rows.length) groups.push({ day, rows });
    }
    const undated = filtered.filter((item) => !item.days.length).sort(byTime);
    if (undated.length) groups.push({ day: '', rows: undated });
  }
  return groups
    .map(
      (group) =>
        `<section class="app-mgroup">` +
        `<h2 class="app-mgroup-head${group.day === today ? ' is-today' : ''}">` +
        `${group.day ? weekdaysLong[locale][DAY_INDEX[group.day]] : copy.milongaAllDays}` +
        (group.day === today ? `<em>${copy.whenToday}</em>` : '') +
        `<span>${group.rows.length}</span></h2>` +
        group.rows.map((item) => itemHtml(item, copy, selected)).join('') +
        `</section>`,
    )
    .join('');
}

export function detailHtml(
  item: Milonga | null,
  locale: Locale,
  copy: MilongaCopy,
): string {
  const head =
    `<div class="app-detail-eyebrow"><span>${copy.milongas}</span>` +
    `<button type="button" class="app-detail-close" data-milonga-close aria-label="${copy.closeDetail}">×</button></div>`;
  if (!item) {
    return head + `<p class="app-empty">${copy.milongaPick}</p>`;
  }
  const typeLabel = item.type === 'practica' ? copy.milongaTypePractica : copy.milongaTypeMilonga;
  const dayLabels = item.days.map((day) => weekdaysLong[locale][DAY_INDEX[day]]).join(', ');
  const time = item.start ? `${item.start}${item.end ? `–${item.end}` : ''}` : '';
  const calendarHref = milongaIcsHref(item);
  const rows: string[] = [];
  if (dayLabels) rows.push(`<div><dt>${copy.milongaDay}</dt><dd>${dayLabels}</dd></div>`);
  if (item.schedule && item.schedule !== 'weekly') {
    rows.push(`<div><dt>${copy.milongaFrequency}</dt><dd>${escapeHtml(scheduleLabel(item.schedule, copy))}</dd></div>`);
  }
  if (time) rows.push(`<div><dt>${copy.milongaTime}</dt><dd>${escapeHtml(time)}</dd></div>`);
  if (item.venue) rows.push(`<div><dt>${copy.milongaVenue}</dt><dd>${escapeHtml(item.venue)}</dd></div>`);
  if (item.address) rows.push(`<div><dt>${copy.milongaAddress}</dt><dd>${escapeHtml(item.address)}</dd></div>`);
  if (item.city) rows.push(`<div><dt>${copy.filterCity}</dt><dd>${escapeHtml(item.city)}</dd></div>`);
  if (item.locality && item.locality !== item.city) {
    rows.push(`<div><dt>${copy.milongaArea}</dt><dd>${escapeHtml(item.locality)}</dd></div>`);
  }
  if (item.price) rows.push(`<div><dt>${copy.milongaPrice}</dt><dd>${escapeHtml(item.price)}</dd></div>`);
  if (item.organizers) rows.push(`<div><dt>${copy.milongaOrganizers}</dt><dd>${escapeHtml(item.organizers)}</dd></div>`);
  const links: string[] = [];
  if (item.mapUrl) links.push(`<a class="app-link" href="${escapeHtml(item.mapUrl)}" target="_blank" rel="noopener">${copy.milongaMap}</a>`);
  if (item.website) links.push(`<a class="app-link" href="${escapeHtml(item.website)}" target="_blank" rel="noopener">Website</a>`);
  if (item.instagram) links.push(`<a class="app-link" href="${escapeHtml(item.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
  if (item.facebook) links.push(`<a class="app-link" href="${escapeHtml(item.facebook)}" target="_blank" rel="noopener">Facebook</a>`);
  if (item.phone) links.push(`<span class="app-link">${escapeHtml(item.phone)}</span>`);
  return (
    head +
    `<h2 class="app-article-title">${escapeHtml(item.name)}</h2>` +
    `<p class="app-kicker">${typeLabel} · ${regionLabel(item.region, 'en')}</p>` +
    `<dl class="app-facts-dl">${rows.join('')}</dl>` +
    `<div class="app-actions">` +
    (item.mapUrl ? `<a class="app-btn" href="${escapeHtml(item.mapUrl)}" target="_blank" rel="noopener">${copy.milongaMap}</a>` : '') +
    (item.detailUrl ? `<a class="app-btn app-btn-solid" href="${escapeHtml(item.detailUrl)}" target="_blank" rel="noopener">${copy.milongaOpenSource}</a>` : '') +
    `</div>` +
    (calendarHref
      ? `<div class="app-actions"><a class="app-btn" href="${escapeHtml(calendarHref)}" download="milonga-${escapeHtml(item.id)}.ics">${copy.addToCalendar}</a></div>`
      : '') +
    (links.length ? `<p class="app-links">${links.join(' · ')}</p>` : '') +
    (item.sourceUrl
      ? `<p class="app-source">${copy.milongaSource}: <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(sourceLabel(item.source))}</a></p>`
      : '') +
    (item.verified ? `<p class="app-source">${copy.milongaVerified}: ${escapeHtml(item.verified)}</p>` : '')
  );
}

export function tonightCount(items: Milonga[], region: string, now: Date = new Date()): number {
  const today = todaySlug(now);
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return items.filter((item) => {
    if (item.region !== region) return false;
    // Dated sources know the exact next date, so a biweekly or monthly series
    // is not counted on its off weeks. Weekly series stay day-based so the
    // client can roll the answer forward without a rebuild.
    const dated = item.schedule && item.schedule !== 'weekly' ? item.next : '';
    if (dated) return dated === iso;
    return item.days.includes(today);
  }).length;
}

export function cityCounts(items: Milonga[], region: string): { city: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.region !== region || !item.city) continue;
    counts.set(item.city, (counts.get(item.city) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'en'));
}

export function cityChipsHtml(
  items: Milonga[],
  filters: MilongaFilters,
  copy: MilongaCopy,
): string {
  const cities = cityCounts(items, filters.region).slice(0, 12);
  if (cities.length < 2) {
    return '';
  }
  const all = `<button type="button" class="app-chip${filters.city ? '' : ' is-active'}" data-milonga-city-chip="" aria-pressed="${filters.city ? 'false' : 'true'}">${copy.filterAll}</button>`;
  const rest = cities
    .map(
      (entry) =>
        `<button type="button" class="app-chip${filters.city === entry.city ? ' is-active' : ''}" data-milonga-city-chip="${escapeHtml(entry.city)}" aria-pressed="${filters.city === entry.city ? 'true' : 'false'}">${escapeHtml(entry.city)} <b>${entry.count}</b></button>`,
    )
    .join('');
  return all + rest;
}
