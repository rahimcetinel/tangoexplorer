import type { APIRoute } from 'astro';
import { getNews, newsSlug } from '../lib/news';
import { groupingDate, monthKey, monthLabel } from '../lib/timeline';
import { countryId, countryLabelById } from '../lib/countries';

export const GET: APIRoute = async () => {
  const posts = await getNews('en');
  const payload = posts.map((post) => {
    const d = post.data;
    const date = groupingDate(post);
    const country = countryId(d.country);
    const countryWords = [...new Set([d.country, countryLabelById(country, 'en')])]
      .filter(Boolean)
      .join(' ');
    return {
      s: newsSlug(post),
      t: d.title,
      m: monthKey(date),
      ml: monthLabel(date, 'en'),
      c: d.category,
      k: d.kinds.join(','),
      co: country,
      ci: d.city ?? '',
      w: d.eventLocation ?? [d.city, d.country].filter(Boolean).join(', '),
      q: [d.title, d.summary, d.eventName, d.city, countryWords, d.eventLocation]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  });
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
