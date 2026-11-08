import {
  distanceKm,
  guessCity,
  nearbyCitySet,
  normalizeCity,
  rememberCity,
} from '../lib/now-core';
import type { NowCoord, NowEvent, NowMilonga } from '../lib/now-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function readJson<T>(selector: string): T[] {
  const el = document.querySelector<HTMLScriptElement>(selector);
  if (!el?.textContent) return [];
  try {
    return JSON.parse(el.textContent) as T[];
  } catch {
    return [];
  }
}

export function initNow(): void {
  const page = document.querySelector<HTMLElement>('[data-now-page]');
  if (!page) return;
  const input = page.querySelector<HTMLInputElement>('[data-now-city]');
  const status = page.querySelector<HTMLElement>('[data-now-status]');
  const results = page.querySelector<HTMLElement>('[data-now-results]');
  const locate = page.querySelector<HTMLButtonElement>('[data-now-locate]');
  if (!input || !status || !results) return;

  const events = readJson<NowEvent>('[data-now-events]');
  const milongas = readJson<NowMilonga>('[data-now-milongas]');
  const coordList = readJson<NowCoord>('[data-now-coords]');

  const knownCities = [...new Set([
    ...events.map((event) => event.ci),
    ...milongas.map((item) => item.c),
    ...coordList.map(([city]) => city),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'));

  const datalist = document.querySelector<HTMLDataListElement>('#now-cities');
  if (datalist) {
    datalist.innerHTML = knownCities.map((city) => `<option value="${escapeHtml(city)}" />`).join('');
  }

  const params = new URLSearchParams(window.location.search);
  let city = params.get('city') ?? guessCity();
  input.value = city;

  function syncUrl(): void {
    const next = new URLSearchParams();
    if (city) next.set('city', city);
    window.history.replaceState({}, '', next.toString() ? `/now?${next}` : '/now');
  }

  function render(): void {
    if (!city) {
      status.textContent = 'Pick a city, or let us use your location.';
      results.innerHTML = '';
      syncUrl();
      return;
    }
    rememberCity(city);
    const scope = nearbyCitySet(city, coordList);
    const match = (value: string) => scope.has(normalizeCity(value));

    const localEvents = events.filter((event) => match(event.ci) || match(event.co));
    const localMilongas = milongas.filter((item) => match(item.c));
    const nearbyCount = coordList.filter(
      ([name]) => scope.has(normalizeCity(name)) && normalizeCity(name) !== normalizeCity(city),
    ).length;

    status.textContent = `Showing ${city}${nearbyCount > 0 ? ` and ${nearbyCount} nearby ${nearbyCount === 1 ? 'city' : 'cities'}` : ''}.`;

    const eventsHtml = localEvents.length
      ? `<ul class="app-now-list">${localEvents
          .map(
            (event) =>
              `<li><a class="app-now-item" href="/news/${escapeHtml(event.slug)}">` +
              `<span class="app-now-item-title">${escapeHtml(event.t)}</span>` +
              `<span class="app-now-item-meta">${escapeHtml(event.dates)}` +
              (event.w ? ` · ${escapeHtml(event.w)}` : '') +
              `</span></a></li>`,
          )
          .join('')}</ul>`
      : `<p class="app-now-empty">Nothing running in ${escapeHtml(city)} right now.</p>`;

    const milongasHtml = localMilongas.length
      ? `<ul class="app-now-list">${localMilongas
          .map(
            (item) =>
              `<li><div class="app-now-item">` +
              `<span class="app-now-item-title">${escapeHtml(item.n)}</span>` +
              `<span class="app-now-item-meta">${escapeHtml(item.s)}${item.e ? `–${escapeHtml(item.e)}` : ''}` +
              (item.v ? ` · ${escapeHtml(item.v)}` : '') +
              (item.c ? ` · ${escapeHtml(item.c)}` : '') +
              `</span></div></li>`,
          )
          .join('')}</ul>`
      : `<p class="app-now-empty">No milongas listed tonight.</p>`;

    results.innerHTML =
      `<section class="app-now-section"><h2 class="app-now-heading">Events on now <span>${localEvents.length}</span></h2>${eventsHtml}</section>` +
      `<section class="app-now-section"><h2 class="app-now-heading">Milongas tonight <span>${localMilongas.length}</span></h2>${milongasHtml}` +
      `<a class="app-link" href="/milongas?city=${encodeURIComponent(city)}">All milongas in ${escapeHtml(city)}</a></section>`;
    syncUrl();
  }

  input.addEventListener('change', () => {
    city = input.value.trim();
    render();
  });

  locate?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = 'Your browser does not support location. Pick a city instead.';
      return;
    }
    status.textContent = 'Finding the nearest city…';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        let best: { city: string; km: number } | null = null;
        for (const [name, lat, lng] of coordList) {
          const km = distanceKm([position.coords.latitude, position.coords.longitude], [lat, lng]);
          if (!best || km < best.km) best = { city: name, km };
        }
        if (!best) {
          status.textContent = 'Could not match your location to a city. Pick one instead.';
          return;
        }
        city = best.city;
        input.value = city;
        render();
      },
      () => {
        status.textContent = 'Location permission denied. Pick a city instead.';
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  });

  render();
}
