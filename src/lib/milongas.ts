import atJson from '../data/milongas-at.json';
import chJson from '../data/milongas-ch.json';
import czJson from '../data/milongas-cz.json';
import deJson from '../data/milongas-de.json';
import esJson from '../data/milongas-es.json';
import frJson from '../data/milongas-fr.json';
import hoyJson from '../data/hoy-milongas.json';
import itJson from '../data/milongas-it.json';
import ldnJson from '../data/milongas-uk-london.json';
import nlJson from '../data/milongas-nl.json';
import noJson from '../data/milongas-no.json';
import plJson from '../data/milongas-pl.json';
import seJson from '../data/milongas-se.json';
import { COUNTRIES, DAYS_ORDER, resolveCountry, type HoyData, type Milonga } from './hoy';

type SourceFile = {
  generatedAt?: string;
  source?: { key?: string; name?: string; url?: string };
  items?: Milonga[];
};

const hoy = (hoyJson as unknown as HoyData).items ?? [];
const de = (deJson as unknown as SourceFile).items ?? [];
const se = (seJson as unknown as SourceFile).items ?? [];
const ch = (chJson as unknown as SourceFile).items ?? [];
const no = (noJson as unknown as SourceFile).items ?? [];
const at = (atJson as unknown as SourceFile).items ?? [];
const it = (itJson as unknown as SourceFile).items ?? [];
const es = (esJson as unknown as SourceFile).items ?? [];
const ldn = (ldnJson as unknown as SourceFile).items ?? [];
const nl = (nlJson as unknown as SourceFile).items ?? [];
const fr = (frJson as unknown as SourceFile).items ?? [];
const cz = (czJson as unknown as SourceFile).items ?? [];
const pl = (plJson as unknown as SourceFile).items ?? [];

/** Next calendar date (YYYY-MM-DD) that falls on one of the given weekdays. */
export function nextDateForDays(days: string[], now: Date = new Date()): string {
  if (!days.length) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    const slug = DAYS_ORDER[(candidate.getDay() + 6) % 7];
    if (days.includes(slug)) {
      return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
    }
  }
  return '';
}

function normalize(item: Milonga, fallbackSource: string): Milonga {
  return {
    ...item,
    region: resolveCountry(item.region),
    schedule: item.schedule ?? 'weekly',
    next: item.next || nextDateForDays(item.days),
    source: item.source ?? fallbackSource,
    sourceUrl: item.sourceUrl || item.detailUrl,
  };
}

/** Every milonga listing on the site, from all sources, keyed by country. */
export const MILONGAS: Milonga[] = [
  ...hoy.map((item) => normalize(item, 'hoymilonga')),
  ...de.map((item) => normalize(item, 'tangocalendar')),
  ...se.map((item) => normalize(item, 'sweden')),
  ...ch.map((item) => normalize(item, 'milongasch')),
  ...no.map((item) => normalize(item, 'oslo')),
  ...at.map((item) => normalize(item, 'vienna')),
  ...it.map((item) => normalize(item, 'italy')),
  ...es.map((item) => normalize(item, 'spain')),
  ...ldn.map((item) => normalize(item, 'london')),
  ...nl.map((item) => normalize(item, 'netherlands')),
  ...fr.map((item) => normalize(item, 'tangoargentin')),
  ...cz.map((item) => normalize(item, 'tangoprague')),
  ...pl.map((item) => normalize(item, 'krakow')),
];

const SOURCE_FILES = [
  hoyJson,
  deJson,
  seJson,
  chJson,
  noJson,
  atJson,
  itJson,
  esJson,
  ldnJson,
  nlJson,
  frJson,
  czJson,
  plJson,
];

/** Latest generatedAt across every source file. */
export const MILONGA_UPDATED_AT: string = SOURCE_FILES
  .map((file) => (file as SourceFile).generatedAt || '')
  .sort()
  .at(-1) as string;

/** Oldest generatedAt across every source file (what "freshness" really is). */
export const MILONGA_OLDEST_AT: string = SOURCE_FILES
  .map((file) => (file as SourceFile).generatedAt || '')
  .sort()
  .at(0) as string;

export type CountryOption = { id: string; en: string; tr: string; count: number };

/** Countries with listings, alphabetical by English name. */
export function countriesWithCounts(items: Milonga[] = MILONGAS): CountryOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.region, (counts.get(item.region) ?? 0) + 1);
  }
  const known = COUNTRIES.filter((country) => counts.has(country.id));
  const unknown = [...counts.keys()]
    .filter((id) => !COUNTRIES.some((country) => country.id === id))
    .sort()
    .map((id) => ({ id, en: id, tr: id }));

  return [...known, ...unknown]
    .map((country) => ({ ...country, count: counts.get(country.id) ?? 0 }))
    .sort((a, b) => a.en.localeCompare(b.en, 'en'));
}

/** Sources present in the data, for attribution lines. */
export function activeSources(items: Milonga[] = MILONGAS): string[] {
  return [...new Set(items.map((item) => item.source).filter((key): key is string => Boolean(key)))];
}

export type { Milonga };
