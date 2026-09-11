export function eventDurationDays(start: Date, end?: Date): number {
  const last = end ?? start;
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const lastMs = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  return Math.max(1, Math.round((lastMs - startMs) / 86_400_000) + 1);
}

export type WhenBadge = 'today' | 'tomorrow' | 'this-week';

export function whenBadge(start: Date | undefined, now: Date = new Date()): WhenBadge | null {
  if (!start) {
    return null;
  }
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const day = 86_400_000;
  if (startMs === today) {
    return 'today';
  }
  if (startMs === today + day) {
    return 'tomorrow';
  }
  const weekday = now.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = today + mondayOffset * day;
  const sunday = monday + 6 * day;
  if (startMs >= monday && startMs <= sunday) {
    return 'this-week';
  }
  return null;
}

function icsEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
}

function ymd(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));
}

export function buildIcs(input: {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: Date;
  end?: Date;
}): string {
  const dtEnd = addUtcDays(input.end ?? input.start, 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TangoExplorer//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@tangoexplorer.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(input.start)}`,
    `DTEND;VALUE=DATE:${ymd(dtEnd)}`,
    `SUMMARY:${icsEscape(input.title)}`,
  ];
  if (input.description) {
    lines.push(`DESCRIPTION:${icsEscape(input.description)}`);
  }
  if (input.location) {
    lines.push(`LOCATION:${icsEscape(input.location)}`);
  }
  if (input.url) {
    lines.push(`URL:${input.url}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function icsHref(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export function googleCalendarUrl(input: {
  title: string;
  details?: string;
  location?: string;
  start: Date;
  end?: Date;
}): string {
  const endExclusive = addUtcDays(input.end ?? input.start, 1);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${ymd(input.start)}/${ymd(endExclusive)}`,
  });
  if (input.details) {
    params.set('details', input.details);
  }
  if (input.location) {
    params.set('location', input.location);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
