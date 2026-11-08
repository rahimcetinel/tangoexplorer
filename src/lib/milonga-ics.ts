import type { Milonga } from './hoy';
import { icsHref } from './calendar';

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const BYDAY: Record<string, string> = {
  sunday: 'SU',
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function stamp(value: Date): string {
  // Floating local time: milongas are listed in venue-local time.
  return (
    `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}` +
    `T${pad(value.getHours())}${pad(value.getMinutes())}00`
  );
}

function utcStamp(value: Date): string {
  return (
    `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}` +
    `T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`
  );
}

function escape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
}

function nextOccurrence(days: string[], now: Date): Date | null {
  if (!days.length) {
    return null;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    if (days.some((day) => DAY_INDEX[day] === candidate.getDay())) {
      return candidate;
    }
  }
  return null;
}

// Floating local times: milongas are listed in venue-local time and we do not
// carry a timezone per city, so the calendar treats them as device-local.
export function milongaIcsHref(item: Milonga, now: Date = new Date()): string {
  const start = nextOccurrence(item.days, now);
  if (!start) {
    return '';
  }
  const [startHour, startMinute] = (item.start || '21:00').split(':').map(Number);
  const [endHour, endMinute] = (item.end || '01:00').split(':').map(Number);
  const begins = new Date(start);
  begins.setHours(startHour ?? 21, startMinute ?? 0, 0, 0);
  const ends = new Date(begins);
  ends.setHours(endHour ?? 1, endMinute ?? 0, 0, 0);
  if (ends <= begins) {
    ends.setDate(ends.getDate() + 1);
  }
  const place = [item.venue, item.address, item.city].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TangoExplorer//Milongas//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:milonga-${item.id}@tangoexplorer.com`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${stamp(begins)}`,
    `DTEND:${stamp(ends)}`,
    `SUMMARY:${escape(item.name)}`,
    `LOCATION:${escape(place)}`,
    `DESCRIPTION:${escape(`Weekly ${item.type} in ${item.city}. Listed on TangoExplorer.`)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${item.days.map((day) => BYDAY[day]).filter(Boolean).join(',')}`,
    item.detailUrl ? `URL:${item.detailUrl}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return icsHref(lines.join('\r\n'));
}
