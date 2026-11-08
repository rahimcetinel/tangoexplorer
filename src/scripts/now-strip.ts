import { guessCity, nearbyCitySet, normalizeCity } from '../lib/now-core';
import type { NowCoord, NowEvent, NowMilonga } from '../lib/now-data';

function readJson<T>(selector: string): T[] {
  const el = document.querySelector<HTMLScriptElement>(selector);
  if (!el?.textContent) return [];
  try {
    return JSON.parse(el.textContent) as T[];
  } catch {
    return [];
  }
}

export function initNowStrip(): void {
  const strip = document.querySelector<HTMLElement>('[data-now-strip]');
  if (!strip) return;
  const text = strip.querySelector<HTMLElement>('[data-now-strip-text]');
  const link = strip.querySelector<HTMLAnchorElement>('[data-now-strip-link]');
  if (!text || !link) return;

  const events = readJson<NowEvent>('[data-now-events]');
  const milongas = readJson<NowMilonga>('[data-now-milongas]');
  const coords = readJson<NowCoord>('[data-now-coords]');

  const city = guessCity();
  if (!city) return;

  const scope = nearbyCitySet(city, coords);
  const eventCount = events.filter(
    (event) => scope.has(normalizeCity(event.ci)) || scope.has(normalizeCity(event.co)),
  ).length;
  const milongaCount = milongas.filter((item) => scope.has(normalizeCity(item.c))).length;
  if (!eventCount && !milongaCount) return;

  const parts: string[] = [];
  if (eventCount) {
    parts.push(`<b>${eventCount}</b> ${eventCount === 1 ? 'event' : 'events'} running`);
  }
  if (milongaCount) {
    parts.push(`<b>${milongaCount}</b> ${milongaCount === 1 ? 'milonga' : 'milongas'} tonight`);
  }
  const nearbyCount = coords.filter(
    ([name]) => scope.has(normalizeCity(name)) && normalizeCity(name) !== normalizeCity(city),
  ).length;
  text.innerHTML = `${parts.join(' · ')} near <b>${city}</b>${
    nearbyCount ? ` <span class="app-now-strip-near">+${nearbyCount} nearby</span>` : ''
  }`;
  link.href = `/now?city=${encodeURIComponent(city)}`;
  strip.hidden = false;
}
