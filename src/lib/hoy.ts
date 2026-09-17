export type MilongaType = 'milonga' | 'practica';

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

/** Static region labels for server-rendered filter options. */
export const HOY_REGIONS: { id: string; en: string; tr: string }[] = [
  { id: 'turkiye', en: 'Türkiye', tr: 'Türkiye' },
  { id: 'buenos-aires', en: 'Buenos Aires', tr: 'Buenos Aires' },
  { id: 'berlin', en: 'Berlin', tr: 'Berlin' },
  { id: 'nordrhein-westfalen', en: 'Germany: NRW', tr: 'Almanya: NRW' },
  { id: 'athens', en: 'Athens', tr: 'Atina' },
  { id: 'sao-paulo', en: 'São Paulo', tr: 'São Paulo' },
  { id: 'england', en: 'England', tr: 'İngiltere' },
  { id: 'miami', en: 'Miami', tr: 'Miami' },
];

export function regionLabel(region: string, locale: 'en' | 'tr'): string {
  const found = HOY_REGIONS.find((item) => item.id === region);
  return found ? (locale === 'tr' ? found.tr : found.en) : region;
}
