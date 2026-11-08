import type { APIRoute } from 'astro';
import { getNews, newsSlug } from '../lib/news';
import { SITE_URL } from '../lib/site';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async () => {
  const posts = (await getNews('en')).slice(0, 100);
  const items = posts
    .map((post) => {
      const slug = newsSlug(post);
      const url = `${SITE_URL}/news/${slug}`;
      const description = post.data.summary;
      const date = post.data.eventStart ?? post.data.date;
      return (
        '<item>' +
        `<title>${escapeXml(post.data.title)}</title>` +
        `<link>${escapeXml(url)}</link>` +
        `<guid isPermaLink="true">${escapeXml(url)}</guid>` +
        `<pubDate>${new Date(post.data.date).toUTCString()}</pubDate>` +
        `<description>${escapeXml(description)}</description>` +
        `<category>${escapeXml(post.data.kinds[0] ?? 'event')}</category>` +
        `<ev:startdate>${date.toISOString().slice(0, 10)}</ev:startdate>` +
        '</item>'
      );
    })
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:ev="http://purl.org/rss/1.0/modules/event/">' +
    '<channel>' +
    '<title>TangoExplorer — upcoming Argentine tango events</title>' +
    `<link>${SITE_URL}/</link>` +
    '<description>Festivals, marathons, encuentros and milongas, each linked to its source.</description>' +
    '<language>en</language>' +
    `<atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />` +
    items +
    '</channel>' +
    '</rss>';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
