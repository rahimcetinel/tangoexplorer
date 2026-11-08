/**
 * Guess the visitor's country from browser signals, without asking for
 * geolocation permission: the IANA time zone first (that is the closest thing
 * a static page gets to "where the browser is"), then the UI language.
 *
 * Returns an empty string when nothing matches; callers fall back to Türkiye.
 */

const TIME_ZONES: [RegExp, string][] = [
  [/^Europe\/Istanbul$/, 'turkiye'],
  [/^Europe\/Berlin$/, 'germany'],
  [/^Europe\/Athens$/, 'greece'],
  [/^Europe\/London$/, 'united-kingdom'],
  [/^Europe\/Stockholm$/, 'sweden'],
  [/^Europe\/Zurich$/, 'switzerland'],
  [/^Europe\/Oslo$/, 'norway'],
  [/^Europe\/Vienna$/, 'austria'],
  [/^Europe\/Rome$/, 'italy'],
  [/^Europe\/Madrid$/, 'spain'],
  [/^Europe\/Amsterdam$/, 'netherlands'],
  [/^Europe\/Paris$/, 'france'],
  [/^Europe\/Warsaw$/, 'poland'],
  [/^Europe\/Prague$/, 'czechia'],
  [/^America\/Argentina\//, 'argentina'],
  [/^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Boa_Vista|Manaus|Santarem|Araguaina|Maceio|Noronha)$/, 'brazil'],
  [/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota|Juneau|Sitka|Menominee|Adak|Nome|Sitka)$/, 'united-states'],
  [/^Pacific\/Honolulu$/, 'united-states'],
];

const LANGUAGES: Record<string, string> = {
  'tr-TR': 'turkiye',
  'de-DE': 'germany',
  'de-AT': 'austria',
  'it-IT': 'italy',
  'es-ES': 'spain',
  'nl-NL': 'netherlands',
  'el-GR': 'greece',
  'en-GB': 'united-kingdom',
  'en-US': 'united-states',
  'es-AR': 'argentina',
  'pt-BR': 'brazil',
  'sv-SE': 'sweden',
  'nb-NO': 'norway',
  'nn-NO': 'norway',
  'de-CH': 'switzerland',
  'fr-CH': 'switzerland',
  'it-CH': 'switzerland',
  'fr-FR': 'france',
  'pl-PL': 'poland',
  'cs-CZ': 'czechia',
};

const LANGUAGE_FALLBACK: Record<string, string> = {
  tr: 'turkiye',
  de: 'germany',
  el: 'greece',
  es: 'argentina',
  pt: 'brazil',
  sv: 'sweden',
  nb: 'norway',
  nn: 'norway',
  no: 'norway',
  it: 'italy',
  nl: 'netherlands',
  fr: 'france',
  pl: 'poland',
  cs: 'czechia',
};

export function detectCountry(
  available: string[],
  timeZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
  language = typeof navigator !== 'undefined' ? navigator.language : '',
): string {
  const known = new Set(available);
  for (const [pattern, country] of TIME_ZONES) {
    if (pattern.test(timeZone) && known.has(country)) return country;
  }
  const exact = LANGUAGES[language];
  if (exact && known.has(exact)) return exact;
  const base = language.split('-')[0]?.toLowerCase() ?? '';
  const fallback = LANGUAGE_FALLBACK[base];
  if (fallback && known.has(fallback)) return fallback;
  return '';
}
