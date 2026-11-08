import type { APIRoute, GetStaticPaths } from 'astro';
import { getNews, newsSlug } from '../../lib/news';
import { buildFeed, type FeedEvent } from '../../lib/calendar-feed';
import { inRegion, regionLabels, regions, type Region } from '../../lib/regions';

export const getStaticPaths: GetStaticPaths = () => [
  { params: { region: 'all' } },
  ...regions.map((region) => ({ params: { region } })),
];

export const GET: APIRoute = async ({ params }) => {
  const slug = params.region as string;
  const posts = await getNews('en');
  const selected = slug === 'all' ? posts : posts.filter((post) => inRegion(post.data.country, slug as Region));
  const label = slug === 'all' ? 'All events' : regionLabels.en[slug as Region];

  const events: FeedEvent[] = selected
    .filter((post) => post.data.eventStart)
    .map((post) => ({
      uid: newsSlug(post),
      title: post.data.eventName || post.data.title,
      description: `${post.data.summary} Source: ${post.data.source}.`,
      location: post.data.eventLocation ?? [post.data.city, post.data.country].filter(Boolean).join(', '),
      url: `https://tangoexplorer.com/news/${newsSlug(post)}`,
      start: post.data.eventStart!,
      end: post.data.eventEnd,
    }));

  const body = buildFeed(
    `TangoExplorer — ${label}`,
    `Upcoming Argentine tango events: ${label}. Updated daily from Tangocat, Hoy Milonga and Instagram.`,
    events,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="tangoexplorer-${slug}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
