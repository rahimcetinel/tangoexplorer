import type { APIRoute, GetStaticPaths } from 'astro';
import { getNews, newsSlug } from '../../lib/news';
import { groupingDate, monthKey, monthLabel } from '../../lib/timeline';
import type { Locale } from '../../lib/i18n';

export const getStaticPaths: GetStaticPaths = () => [
  { params: { locale: 'en' } },
  { params: { locale: 'tr' } },
];

export const GET: APIRoute = async ({ params }) => {
  const locale = params.locale as Locale;
  const posts = await getNews(locale);
  const payload = posts.map((post) => {
    const d = post.data;
    const date = groupingDate(post);
    return {
      s: newsSlug(post),
      t: d.title,
      m: monthKey(date),
      ml: monthLabel(date, locale),
      c: d.category,
      k: d.kinds.join(','),
      co: d.country ?? '',
      ci: d.city ?? '',
      w: d.eventLocation ?? [d.city, d.country].filter(Boolean).join(', '),
      q: [d.title, d.summary, d.eventName, d.city, d.country, d.eventLocation]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  });
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
