import type { Locale } from './i18n';

export const regions = ['turkiye', 'europe', 'asia', 'russia', 'america'] as const;
export type Region = (typeof regions)[number];

export const regionLabels: Record<Locale, Record<Region, string>> = {
  en: {
    turkiye: 'Turkey',
    europe: 'Europe',
    asia: 'Asia',
    russia: 'Russia',
    america: 'America',
  },
  tr: {
    turkiye: 'Türkiye',
    europe: 'Avrupa',
    asia: 'Asya',
    russia: 'Rusya',
    america: 'Amerika',
  },
};

export function regionPath(locale: Locale, region: string): string {
  return locale === 'en' ? `/region/${region}` : `/tr/bolge/${region}`;
}

/** Country name (EN or TR) -> region. Oceania is grouped under Asia. */
const COUNTRY_REGION: Record<string, Region> = {};

function add(region: Region, names: string[]): void {
  for (const name of names) {
    COUNTRY_REGION[normalizeCountry(name)] = region;
  }
}

const EUROPE = [
  'Italy', 'İtalya', 'Germany', 'Almanya', 'Spain', 'İspanya', 'France', 'Fransa',
  'Poland', 'Polonya', 'Greece', 'Yunanistan', 'Czechia', 'Czech Republic', 'Czech',
  'United Kingdom', 'UK', 'England', 'Scotland', 'Wales', 'Slovenia', 'Austria',
  'Avusturya', 'Portugal', 'Portekiz', 'Belgium', 'Belçika', 'Switzerland', 'İsviçre',
  'Estonia', 'Estonya', 'Hungary', 'Macaristan', 'Lithuania', 'Litvanya', 'Serbia',
  'Sırbistan', 'Sweden', 'İsveç', 'Bulgaria', 'Bulgaristan', 'Croatia', 'Hırvatistan',
  'Bosnia and Herzegovina', 'Bosnia', 'Slovakia', 'Slovakya', 'Latvia', 'Letonya',
  'Norway', 'Norveç', 'Netherlands', 'Hollanda', 'Ireland', 'İrlanda', 'Montenegro',
  'Karadağ', 'Romania', 'Romanya', 'Moldova', 'Denmark', 'Danimarka', 'Finland',
  'Finlandiya', 'Iceland', 'İzlanda', 'Luxembourg', 'Malta', 'Cyprus', 'Kıbrıs',
  'Ukraine', 'Ukrayna', 'Belarus', 'Albania', 'Arnavutluk', 'North Macedonia',
  'Macedonia', 'Kosovo', 'Monaco', 'Liechtenstein', 'Andorra',
];

const ASIA = [
  'India', 'Hindistan', 'Vietnam', 'Georgia', 'Gürcistan', 'Japan', 'Japonya',
  'Singapore', 'Singapur', 'Azerbaijan', 'Azerbaycan', 'Indonesia', 'Endonezya',
  'South Korea', 'Korea', 'China', 'Çin', 'United Arab Emirates', 'UAE', 'BAE',
  'Lebanon', 'Lübnan', 'Israel', 'İsrail', 'Thailand', 'Tayland', 'Philippines',
  'Filipinler', 'Malaysia', 'Malezya', 'Qatar', 'Katar', 'Saudi Arabia',
  'Suudi Arabistan', 'Armenia', 'Ermenistan', 'Hong Kong', 'Taiwan', 'Pakistan',
  'Sri Lanka', 'Nepal', 'Mongolia', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan',
  'Turkmenistan', 'Kazakhstan', 'Kazakistan', 'Iraq', 'Irak', 'Iran', 'İran',
  'Jordan', 'Ürdün', 'Bahrain', 'Kuwait', 'Oman', 'Bangladesh', 'Myanmar',
  'Cambodia', 'Brunei', 'Macau',
  'Australia', 'Avustralya', 'New Zealand', 'Yeni Zelanda', 'French Polynesia',
  'Tahiti', 'Fiji', 'Papua New Guinea', 'Samoa', 'Guam',
];

const AMERICA = [
  'United States', 'USA', 'United States of America', 'Amerika', 'Kanada', 'Canada',
  'Mexico', 'Meksika', 'Colombia', 'Kolombiya', 'Dominican Republic', 'Cuba', 'Küba',
  'Argentina', 'Arjantin', 'Brazil', 'Brezilya', 'Chile', 'Şili', 'Uruguay', 'Peru',
  'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Costa Rica', 'Panama', 'Guatemala',
];

const RUSSIA = ['Russia', 'Russian Federation', 'Rusya'];
const TURKIYE = ['Turkey', 'Türkiye', 'Turkiye'];

add('turkiye', TURKIYE);
add('russia', RUSSIA);
add('america', AMERICA);
add('asia', ASIA);
add('europe', EUROPE);

function normalizeCountry(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function regionOf(country?: string): Region | null {
  if (!country) {
    return null;
  }
  return COUNTRY_REGION[normalizeCountry(country)] ?? null;
}

export function countByRegion(posts: Array<{ data: { country?: string } }>): Record<Region, number> {
  const counts = { turkiye: 0, europe: 0, asia: 0, russia: 0, america: 0 } as Record<Region, number>;
  for (const post of posts) {
    const region = regionOf(post.data.country);
    if (region) {
      counts[region] += 1;
    }
  }
  return counts;
}
