/**
 * Country names arrive from many sources (Tangocat, Tangoverse, TMD, Instagram)
 * in mixed English/Turkish spelling ("Almanya" and "Germany" both occur), which
 * used to show up as duplicate entries in the country filter.
 *
 * This module is the single source of truth: a stable ASCII `id` used for
 * filtering and URLs, plus a localized label for display. Client-safe (no
 * astro:content import) because the filter script needs it too.
 */
import type { Locale } from './i18n';

type Country = { id: string; en: string; tr: string; aliases?: string[] };

const TABLE: Country[] = [
  { id: 'argentina', en: 'Argentina', tr: 'Arjantin' },
  { id: 'australia', en: 'Australia', tr: 'Avustralya' },
  { id: 'austria', en: 'Austria', tr: 'Avusturya' },
  { id: 'azerbaijan', en: 'Azerbaijan', tr: 'Azerbaycan' },
  { id: 'belgium', en: 'Belgium', tr: 'Belçika' },
  { id: 'bolivia', en: 'Bolivia', tr: 'Bolivya' },
  { id: 'bosnia-and-herzegovina', en: 'Bosnia and Herzegovina', tr: 'Bosna-Hersek', aliases: ['Bosnia'] },
  { id: 'brazil', en: 'Brazil', tr: 'Brezilya' },
  { id: 'bulgaria', en: 'Bulgaria', tr: 'Bulgaristan' },
  { id: 'canada', en: 'Canada', tr: 'Kanada' },
  { id: 'china', en: 'China', tr: 'Çin' },
  { id: 'colombia', en: 'Colombia', tr: 'Kolombiya' },
  { id: 'croatia', en: 'Croatia', tr: 'Hırvatistan' },
  { id: 'cuba', en: 'Cuba', tr: 'Küba' },
  { id: 'cyprus', en: 'Cyprus', tr: 'Kıbrıs' },
  { id: 'czechia', en: 'Czechia', tr: 'Çekya', aliases: ['Czech Republic', 'Czech'] },
  { id: 'denmark', en: 'Denmark', tr: 'Danimarka' },
  { id: 'dominican-republic', en: 'Dominican Republic', tr: 'Dominik Cumhuriyeti' },
  { id: 'estonia', en: 'Estonia', tr: 'Estonya' },
  { id: 'finland', en: 'Finland', tr: 'Finlandiya' },
  { id: 'france', en: 'France', tr: 'Fransa' },
  { id: 'french-polynesia', en: 'French Polynesia', tr: 'Fransız Polinezyası', aliases: ['Tahiti'] },
  { id: 'georgia', en: 'Georgia', tr: 'Gürcistan' },
  { id: 'germany', en: 'Germany', tr: 'Almanya' },
  { id: 'greece', en: 'Greece', tr: 'Yunanistan' },
  { id: 'hong-kong', en: 'Hong Kong', tr: 'Hong Kong' },
  { id: 'hungary', en: 'Hungary', tr: 'Macaristan' },
  { id: 'iceland', en: 'Iceland', tr: 'İzlanda' },
  { id: 'india', en: 'India', tr: 'Hindistan' },
  { id: 'indonesia', en: 'Indonesia', tr: 'Endonezya' },
  { id: 'ireland', en: 'Ireland', tr: 'İrlanda' },
  { id: 'israel', en: 'Israel', tr: 'İsrail' },
  { id: 'italy', en: 'Italy', tr: 'İtalya' },
  { id: 'japan', en: 'Japan', tr: 'Japonya' },
  { id: 'kazakhstan', en: 'Kazakhstan', tr: 'Kazakistan' },
  { id: 'latvia', en: 'Latvia', tr: 'Letonya' },
  { id: 'lebanon', en: 'Lebanon', tr: 'Lübnan' },
  { id: 'lithuania', en: 'Lithuania', tr: 'Litvanya' },
  { id: 'malaysia', en: 'Malaysia', tr: 'Malezya' },
  { id: 'malta', en: 'Malta', tr: 'Malta' },
  { id: 'mexico', en: 'Mexico', tr: 'Meksika' },
  { id: 'moldova', en: 'Moldova', tr: 'Moldova' },
  { id: 'montenegro', en: 'Montenegro', tr: 'Karadağ' },
  { id: 'morocco', en: 'Morocco', tr: 'Fas' },
  { id: 'netherlands', en: 'Netherlands', tr: 'Hollanda', aliases: ['Holland'] },
  { id: 'new-zealand', en: 'New Zealand', tr: 'Yeni Zelanda' },
  { id: 'north-macedonia', en: 'North Macedonia', tr: 'Kuzey Makedonya', aliases: ['Macedonia'] },
  { id: 'norway', en: 'Norway', tr: 'Norveç' },
  { id: 'philippines', en: 'Philippines', tr: 'Filipinler' },
  { id: 'poland', en: 'Poland', tr: 'Polonya' },
  { id: 'portugal', en: 'Portugal', tr: 'Portekiz' },
  { id: 'romania', en: 'Romania', tr: 'Romanya' },
  { id: 'russia', en: 'Russia', tr: 'Rusya', aliases: ['Russian Federation'] },
  { id: 'serbia', en: 'Serbia', tr: 'Sırbistan' },
  { id: 'singapore', en: 'Singapore', tr: 'Singapur' },
  { id: 'slovakia', en: 'Slovakia', tr: 'Slovakya' },
  { id: 'slovenia', en: 'Slovenia', tr: 'Slovenya' },
  { id: 'south-africa', en: 'South Africa', tr: 'Güney Afrika' },
  { id: 'south-korea', en: 'South Korea', tr: 'Güney Kore', aliases: ['Korea'] },
  { id: 'spain', en: 'Spain', tr: 'İspanya' },
  { id: 'sweden', en: 'Sweden', tr: 'İsveç' },
  { id: 'switzerland', en: 'Switzerland', tr: 'İsviçre' },
  { id: 'taiwan', en: 'Taiwan', tr: 'Tayvan' },
  { id: 'thailand', en: 'Thailand', tr: 'Tayland' },
  { id: 'turkey', en: 'Turkey', tr: 'Türkiye', aliases: ['Turkiye'] },
  { id: 'ukraine', en: 'Ukraine', tr: 'Ukrayna' },
  {
    id: 'united-arab-emirates',
    en: 'United Arab Emirates',
    tr: 'Birleşik Arap Emirlikleri',
    aliases: ['UAE', 'BAE'],
  },
  { id: 'united-kingdom', en: 'United Kingdom', tr: 'Birleşik Krallık', aliases: ['UK', 'Great Britain'] },
  {
    id: 'united-states',
    en: 'United States',
    tr: 'Amerika Birleşik Devletleri',
    aliases: ['USA', 'US', 'United States of America', 'Amerika'],
  },
  { id: 'vietnam', en: 'Vietnam', tr: 'Vietnam', aliases: ['Viet Nam'] },
];

/** Fold case, accents, dotted İ and punctuation so spellings compare equal. */
function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

const byAlias = new Map<string, Country>();
const byId = new Map<string, Country>();
for (const country of TABLE) {
  byId.set(country.id, country);
  for (const alias of [country.en, country.tr, ...(country.aliases ?? [])]) {
    byAlias.set(fold(alias), country);
  }
}

/** Stable filter/URL key. Unknown names fall back to their folded spelling. */
export function countryId(raw?: string | null): string {
  if (!raw) {
    return '';
  }
  return byAlias.get(fold(raw))?.id ?? fold(raw);
}

/** Display label for a canonical id; unknown ids degrade to the id itself. */
export function countryLabelById(id: string | undefined, locale: Locale): string {
  if (!id) {
    return '';
  }
  return byId.get(id)?.[locale] ?? id;
}

/** Display label for a raw frontmatter value. */
export function countryLabel(raw: string | undefined, locale: Locale): string {
  if (!raw) {
    return '';
  }
  return byAlias.get(fold(raw))?.[locale] ?? raw;
}

/**
 * Deduplicated, localized country options for the filter select.
 * Sorted by the label the visitor actually sees.
 */
export function countryOptions(
  posts: Array<{ data: { country?: string } }>,
  locale: Locale,
): Array<{ id: string; label: string }> {
  const labels = new Map<string, string>();
  for (const post of posts) {
    const raw = post.data.country;
    if (!raw) {
      continue;
    }
    const id = countryId(raw);
    if (!labels.has(id)) {
      labels.set(id, countryLabel(raw, locale));
    }
  }
  return [...labels]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
