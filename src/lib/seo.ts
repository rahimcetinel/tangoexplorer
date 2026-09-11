import { homePath, switchLocalePath, type Locale } from './i18n';
import { isoDate } from './filters';
import type { NewsEntry } from './news';

export type OgType = 'website' | 'article';

export function absUrl(site: URL, path: string): string {
  const clean = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path || '/';
  return new URL(clean, site).href;
}

export function alternateUrls(site: URL, locale: Locale, pathname: string, slug?: string): { en: string; tr: string } {
  const enPath = locale === 'en' ? pathname : switchLocalePath(locale, pathname, slug);
  const trPath = locale === 'tr' ? pathname : switchLocalePath(locale, pathname, slug);
  return { en: absUrl(site, enPath), tr: absUrl(site, trPath) };
}

export function siteGraph(locale: Locale, site: URL): object[] {
  const origin = site.origin;
  const home = absUrl(site, homePath(locale));
  return [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: 'TangoExplorer',
      url: origin,
    },
    {
      '@type': 'WebSite',
      '@id': `${home}#website`,
      name: 'TangoExplorer',
      url: home,
      inLanguage: locale === 'tr' ? 'tr' : 'en',
      publisher: { '@id': `${origin}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${home}?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

export function articleGraph(locale: Locale, post: NewsEntry, pageHref: string, image: string, site: URL): object {
  const d = post.data;
  const inLanguage = locale === 'tr' ? 'tr' : 'en';
  if (d.format === 'blog') {
    return {
      '@type': 'NewsArticle',
      headline: d.title,
      description: d.summary,
      datePublished: isoDate(d.date),
      dateModified: isoDate(d.date),
      inLanguage,
      image,
      url: pageHref,
      mainEntityOfPage: pageHref,
      author: { '@id': `${site.origin}/#organization` },
      publisher: { '@id': `${site.origin}/#organization` },
    };
  }
  const place = d.eventLocation || [d.city, d.country].filter(Boolean).join(', ');
  return {
    '@type': 'Event',
    name: d.eventName || d.title,
    description: d.summary,
    startDate: isoDate(d.eventStart) || isoDate(d.date),
    endDate: isoDate(d.eventEnd) || isoDate(d.eventStart) || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image,
    url: pageHref,
    inLanguage,
    location: place
      ? {
          '@type': 'Place',
          name: place,
          address: {
            '@type': 'PostalAddress',
            addressLocality: d.city,
            addressCountry: d.country,
          },
        }
      : undefined,
    organizer: {
      '@type': 'Organization',
      name: d.source,
      url: d.eventWebsite || d.sourceUrl,
    },
  };
}

export function jsonLdDocument(graph: object[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c');
}
