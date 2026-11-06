import type { APIRoute } from 'astro';
import { getNews, newsSlug } from '../lib/news';
import { groupingDate, monthKey, monthLabel } from '../lib/timeline';
import { countryId, countryLabelById } from '../lib/countries';
import { kindLabels } from '../lib/i18n';
import { isoDate } from '../lib/filters';

export const GET: APIRoute = async () => {
  const posts = await getNews('en');
  const kinds = kindLabels.en;
  const payload = posts.map((post) => {
    const d = post.data;
    const date = groupingDate(post);
    const country = countryId(d.country);
    const countryLabel = countryLabelById(country, 'en') || d.country || '';
    const kindText = d.kinds.map((kind) => kinds[kind]).join(', ');
    return {
      s: newsSlug(post),
      t: d.title,
      m: monthKey(date),
      ml: monthLabel(date, 'en'),
      c: d.category,
      k: d.kinds.join(','),
      kn: kindText,
      co: country,
      cn: countryLabel,
      ci: d.city ?? '',
      w: d.eventLocation ?? [d.city, d.country].filter(Boolean).join(', '),
      st: isoDate(d.eventStart),
      en: isoDate(d.eventEnd) || isoDate(d.eventStart),
      q: [d.title, d.summary, d.eventName, d.city, countryLabel, d.country, d.eventLocation, kindText]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  });
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
