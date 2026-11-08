// Country resolution for the edge: Cloudflare gives us the visitor's country
// code (ISO 3166-1 alpha-2) on every request. We only act on countries we
// actually have milonga listings for.

export const COUNTRY_BY_CODE: Record<string, string> = {
  TR: 'turkiye',
  AR: 'argentina',
  DE: 'germany',
  GR: 'greece',
  BR: 'brazil',
  GB: 'united-kingdom',
  US: 'united-states',
  SE: 'sweden',
  CH: 'switzerland',
  NO: 'norway',
  AT: 'austria',
  IT: 'italy',
  ES: 'spain',
  NL: 'netherlands',
  FR: 'france',
  PL: 'poland',
  CZ: 'czechia',
  RO: 'romania',
};

/** Map a Cloudflare country code to our country id, or '' when we don't cover it. */
export function countryForCode(code?: string | null): string {
  if (!code) return '';
  return COUNTRY_BY_CODE[code.toUpperCase()] ?? '';
}

// Crawlers must keep seeing one canonical URL: redirecting them per data-centre
// country would splinter /milongas into a dozen indexed variants.
const BOT_UA =
  /(googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot|petalbot|seznam|sogou|exabot|semrushbot|ahrefsbot|mj12bot|dotbot|bytespider|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|slackbot|discordbot|embedly|pinterest)/i;

export function isBot(userAgent: string): boolean {
  return BOT_UA.test(userAgent);
}

/**
 * The country the edge should preselect for this request, or '' to leave the
 * default alone. Only the milonga directory is personalised.
 */
export function countryRedirect(
  pathname: string,
  hasRegion: boolean,
  userAgent: string,
  cfCountry?: string | null,
): string {
  if (pathname !== '/milongas' && pathname !== '/milongas/') return '';
  if (hasRegion || isBot(userAgent)) return '';
  return countryForCode(cfCountry);
}
