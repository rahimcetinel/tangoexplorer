export type MilongaType = 'milonga' | 'practica';
export type MilongaSchedule = 'weekly' | 'biweekly' | 'monthly';

export type Milonga = {
  id: string;
  region: string;
  name: string;
  city: string;
  country: string;
  type: MilongaType;
  days: string[];
  start: string;
  end: string;
  venue: string;
  area: string;
  address: string;
  lat: number | null;
  lng: number | null;
  mapUrl: string;
  price: string;
  detailUrl: string;
  website: string;
  instagram: string;
  facebook: string;
  phone: string;
  organizers: string;
  verified: string;
  /** How often the series runs. Absent means weekly (Hoy listings). */
  schedule?: MilongaSchedule;
  /** Next known date (YYYY-MM-DD), when the source publishes dated occurrences. */
  next?: string;
  /** Neighbourhood/suburb inside a metro area (e.g. Vicente López in Buenos Aires). */
  locality?: string;
  /** Source key, e.g. `hoymilonga` or `tangocalendar`. */
  source?: string;
  /** Canonical page of the listing on the source site. */
  sourceUrl?: string;
};

export type HoyRegion = { id: string; labelEn: string; labelTr: string; count: number };

export type HoyData = {
  generatedAt: string;
  regions: HoyRegion[];
  items: Milonga[];
  errors: string[];
};

export const DAYS_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

/** Countries we currently have milonga listings for. */
export const COUNTRIES: { id: string; en: string; tr: string }[] = [
  { id: 'turkiye', en: 'Türkiye', tr: 'Türkiye' },
  { id: 'argentina', en: 'Argentina', tr: 'Arjantin' },
  { id: 'germany', en: 'Germany', tr: 'Almanya' },
  { id: 'greece', en: 'Greece', tr: 'Yunanistan' },
  { id: 'brazil', en: 'Brazil', tr: 'Brezilya' },
  { id: 'united-kingdom', en: 'United Kingdom', tr: 'Birleşik Krallık' },
  { id: 'united-states', en: 'United States', tr: 'ABD' },
  { id: 'sweden', en: 'Sweden', tr: 'İsveç' },
  { id: 'switzerland', en: 'Switzerland', tr: 'İsviçre' },
  { id: 'norway', en: 'Norway', tr: 'Norveç' },
  { id: 'austria', en: 'Austria', tr: 'Avusturya' },
  { id: 'italy', en: 'Italy', tr: 'İtalya' },
  { id: 'spain', en: 'Spain', tr: 'İspanya' },
  { id: 'netherlands', en: 'Netherlands', tr: 'Hollanda' },
];

/**
 * Region keys used before the country model (and still present in older data
 * files and bookmarked URLs). Resolved at load time so nothing breaks.
 */
export const LEGACY_REGIONS: Record<string, string> = {
  'buenos-aires': 'argentina',
  berlin: 'germany',
  'nordrhein-westfalen': 'germany',
  athens: 'greece',
  'sao-paulo': 'brazil',
  england: 'united-kingdom',
  miami: 'united-states',
  frankfurt: 'germany',
  heidelberg: 'germany',
  munich: 'germany',
  karlsruhe: 'germany',
  'germany-other': 'germany',
};

export function resolveCountry(value: string): string {
  return LEGACY_REGIONS[value] ?? value;
}

/** Listing sources shown in the footer / detail panel. */
export const MILONGA_SOURCES: Record<string, string> = {
  hoymilonga: 'Hoy Milonga',
  tangocalendar: 'tango-calendar.de',
  sweden: 'tangokalendern.se',
  milongasch: 'milongas.ch',
  oslo: 'tango.oslo.no',
  vienna: 'tango-wien.at',
  italy: 'FAItango',
  spain: 'Agenda del Tango',
  london: 'London Milongas',
  netherlands: 'tangokalender.nl',
};

export function sourceLabel(key?: string): string {
  if (!key) return '';
  return MILONGA_SOURCES[key] ?? key;
}

export function countryLabel(country: string, locale: 'en' | 'tr'): string {
  const found = COUNTRIES.find((item) => item.id === country);
  return found ? (locale === 'tr' ? found.tr : found.en) : country;
}

/** Kept as an alias: callers still say "region" for the country filter. */
export const regionLabel = countryLabel;
