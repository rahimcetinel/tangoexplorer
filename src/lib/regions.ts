import type { Locale } from './i18n';

// Travel-first grouping, not strict geography: the Balkans and the Middle East
// are weekend-trip clusters from Turkey and Europe, so they get their own pages.
// The Balkans are also part of Europe: /region/europe lists them too, so nobody
// has to guess where Belgrade went.
export const regions = [
  'turkiye',
  'balkans',
  'europe',
  'russia',
  'middle-east',
  'asia-pacific',
  'america',
] as const;
export type Region = (typeof regions)[number];

export const regionLabels: Record<Locale, Record<Region, string>> = {
  en: {
    turkiye: 'Turkey',
    balkans: 'Balkans',
    europe: 'Europe',
    russia: 'Russia',
    'middle-east': 'Middle East & Africa',
    'asia-pacific': 'Asia-Pacific',
    america: 'Americas',
  },
};

export function regionPath(_locale: Locale, region: string): string {
  return `/region/${region}`;
}

type CountryRule = { region: Region; names: string[] };

const RULES: CountryRule[] = [
  {
    region: 'balkans',
    names: [
      'Serbia', 'Sırbistan', 'Croatia', 'Hırvatistan', 'Slovenia', 'Bosnia and Herzegovina',
      'Bosnia', 'Montenegro', 'Karadağ', 'North Macedonia', 'Macedonia', 'Albania', 'Arnavutluk',
      'Kosovo', 'Bulgaria', 'Bulgaristan', 'Romania', 'Romanya', 'Moldova', 'Greece', 'Yunanistan',
    ],
  },
  {
    region: 'europe',
    names: [
      'Italy', 'İtalya', 'Germany', 'Almanya', 'Spain', 'İspanya', 'France', 'Fransa',
      'Poland', 'Polonya', 'Czechia', 'Czech Republic', 'Czech', 'United Kingdom', 'UK',
      'England', 'Scotland', 'Wales', 'Austria', 'Avusturya', 'Portugal', 'Portekiz',
      'Belgium', 'Belçika', 'Switzerland', 'İsviçre', 'Estonia', 'Estonya', 'Hungary',
      'Macaristan', 'Lithuania', 'Litvanya', 'Sweden', 'İsveç', 'Slovakia', 'Slovakya',
      'Latvia', 'Letonya', 'Norway', 'Norveç', 'Netherlands', 'Hollanda', 'Ireland',
      'İrlanda', 'Denmark', 'Danimarka', 'Finland', 'Finlandiya', 'Iceland', 'İzlanda',
      'Luxembourg', 'Malta', 'Cyprus', 'Kıbrıs', 'Ukraine', 'Ukrayna', 'Belarus',
      'Monaco', 'Liechtenstein', 'Andorra',
    ],
  },
  {
    region: 'russia',
    names: ['Russia', 'Russian Federation', 'Rusya'],
  },
  {
    region: 'middle-east',
    names: [
      'Morocco', 'Fas', 'Tunisia', 'Tunus', 'Algeria', 'Cezayir', 'Egypt', 'Mısır',
      'South Africa', 'Güney Afrika', 'Kenya', 'Lebanon', 'Lübnan', 'Israel', 'İsrail',
      'United Arab Emirates', 'UAE', 'BAE', 'Jordan', 'Ürdün', 'Qatar', 'Katar',
      'Saudi Arabia', 'Suudi Arabistan', 'Bahrain', 'Kuwait', 'Oman', 'Iraq', 'Irak',
      'Iran', 'İran',
    ],
  },
  {
    region: 'asia-pacific',
    names: [
      'India', 'Hindistan', 'Vietnam', 'Georgia', 'Gürcistan', 'Japan', 'Japonya',
      'Singapore', 'Singapur', 'Azerbaijan', 'Azerbaycan', 'Indonesia', 'Endonezya',
      'South Korea', 'Korea', 'China', 'Çin', 'Armenia', 'Ermenistan', 'Hong Kong',
      'Taiwan', 'Pakistan', 'Sri Lanka', 'Nepal', 'Mongolia', 'Uzbekistan', 'Kyrgyzstan',
      'Tajikistan', 'Turkmenistan', 'Kazakhstan', 'Kazakistan', 'Thailand', 'Tayland',
      'Philippines', 'Filipinler', 'Malaysia', 'Malezya', 'Bangladesh', 'Myanmar',
      'Cambodia', 'Brunei', 'Macau', 'Australia', 'Avustralya', 'New Zealand',
      'Yeni Zelanda', 'French Polynesia', 'Tahiti', 'Fiji', 'Papua New Guinea', 'Samoa', 'Guam',
    ],
  },
  {
    region: 'america',
    names: [
      'United States', 'USA', 'United States of America', 'Amerika', 'Kanada', 'Canada',
      'Mexico', 'Meksika', 'Colombia', 'Kolombiya', 'Dominican Republic', 'Cuba', 'Küba',
      'Argentina', 'Arjantin', 'Brazil', 'Brezilya', 'Chile', 'Şili', 'Uruguay', 'Peru',
      'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Costa Rica', 'Panama', 'Guatemala',
    ],
  },
  {
    region: 'turkiye',
    names: ['Turkey', 'Türkiye', 'Turkiye'],
  },
];

const COUNTRY_REGION = new Map<string, Region>();

function normalizeCountry(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

for (const rule of RULES) {
  for (const name of rule.names) {
    COUNTRY_REGION.set(normalizeCountry(name), rule.region);
  }
}

export function regionOf(country?: string): Region | null {
  if (!country) {
    return null;
  }
  return COUNTRY_REGION.get(normalizeCountry(country)) ?? null;
}

// A country can belong to more than one browse page. The Balkans are the one
// deliberate overlap: they are a curated shortcut inside Europe.
export function regionMembership(country?: string): Region[] {
  const region = regionOf(country);
  if (!region) {
    return [];
  }
  if (region === 'balkans') {
    return ['balkans', 'europe'];
  }
  return [region];
}

export function inRegion(country: string | undefined, region: Region): boolean {
  return regionMembership(country).includes(region);
}

export function countByRegion(posts: Array<{ data: { country?: string } }>): Record<Region, number> {
  const counts = {
    turkiye: 0,
    balkans: 0,
    europe: 0,
    russia: 0,
    'middle-east': 0,
    'asia-pacific': 0,
    america: 0,
  } as Record<Region, number>;
  for (const post of posts) {
    for (const region of regionMembership(post.data.country)) {
      counts[region] += 1;
    }
  }
  return counts;
}
