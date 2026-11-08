import type { APIRoute } from 'astro';
import { MILONGAS, MILONGA_UPDATED_AT, countriesWithCounts } from '../lib/milongas';

export const prerender = true;

/** Every milonga listing on the site, from all sources (Hoy Milonga, tango-calendar.de). */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      generatedAt: MILONGA_UPDATED_AT,
      countries: countriesWithCounts(),
      items: MILONGAS,
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
