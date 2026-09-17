import type { APIRoute } from 'astro';
import data from '../data/hoy-milongas.json';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
