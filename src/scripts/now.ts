import { distanceKm, guessCity, nearbyCitySet, normalizeCity, rememberCity } from '../lib/now-core';
import type { NowCoord, NowEvent, NowMilonga } from '../lib/now-data';

type Picked = { kind: 'city' | 'country' | 'none'; label: string };

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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'));
}

export function initNow(): void {
  const page = document.querySelector<HTMLElement>('[data-now-page]');
  if (!page) return;
  const form = page.querySelector<HTMLFormElement>('[data-now-form]');
  const input = page.querySelector<HTMLInputElement>('[data-now-city]');
  const status = page.querySelector<HTMLElement>('[data-now-status]');
  const results = page.querySelector<HTMLElement>('[data-now-results]');
  const locate = page.querySelector<HTMLButtonElement>('[data-now-locate]');
  if (!input || !status || !results) return;

  const events = readJson<NowEvent>('[data-now-events]');
  const milongas = readJson<NowMilonga>('[data-now-milongas]');
  const coordList = readJson<NowCoord>('[data-now-coords]');
  const knownCities = readJson<string>('[data-now-cities]');
  const knownCountries = readJson<string>('[data-now-countries]');

  // The place picker knows every city and country in the collection, even when
  // nothing is happening there tonight; the result lists stay scoped to today.
  const cityNames = knownCities.length
    ? uniqueSorted(knownCities)
    : uniqueSorted([
        ...events.map((event) => event.ci),
        ...milongas.map((item) => item.c),
        ...coordList.map(([city]) => city),
      ]);
  const countryNames = knownCountries.length
    ? uniqueSorted(knownCountries)
    : uniqueSorted([...events.map((event) => event.co), ...milongas.map((item) => item.co)]);

  const params = new URLSearchParams(window.location.search);
  let place = params.get('city') ?? guessCity();
  input.value = place;

  // A city wins when the query matches one; otherwise the query is treated as a
  // country. Partial matches are accepted so "istan" and "germ" work. When two
  // spellings normalise to the same place (Istanbul / İstanbul), prefer the
  // plain ASCII one so the English site stays consistent.
  function asciiCount(value: string): number {
    return [...value].filter((char) => (char.codePointAt(0) ?? 0) < 128).length;
  }

  function isAscii(value: string): boolean {
    return [...value].every((char) => (char.codePointAt(0) ?? 0) < 128);
  }

  function pickName(names: string[], needle: string): string | undefined {
    const groups = [
      names.filter((name) => normalizeCity(name) === needle),
      names.filter((name) => normalizeCity(name).startsWith(needle)),
      names.filter((name) => normalizeCity(name).includes(needle)),
    ];
    for (const group of groups) {
      if (group.length) {
        return [...group].sort(
          (a, b) =>
            Number(isAscii(b)) - Number(isAscii(a)) ||
            asciiCount(b) - asciiCount(a) ||
            a.localeCompare(b, 'en'),
        )[0];
      }
    }
    return undefined;
  }

  function pick(query: string): Picked {
    const needle = normalizeCity(query);
    if (!needle) return { kind: 'none', label: '' };
    const city = pickName(cityNames, needle);
    if (city) return { kind: 'city', label: city };
    const country = pickName(countryNames, needle);
    if (country) return { kind: 'country', label: country };
    return { kind: 'none', label: '' };
  }

  function syncUrl(label: string): void {
    const next = new URLSearchParams();
    if (label) next.set('city', label);
    window.history.replaceState({}, '', next.toString() ? `/now?${next}` : '/now');
  }

  function render(): void {
    const picked = pick(place);
    if (picked.kind === 'none') {
      status.textContent = place
        ? `No city or country matches “${place}”. Try a larger place nearby.`
        : 'Type a city or country, or let us use your location.';
      results.innerHTML = '';
      syncUrl(place);
      return;
    }

    const label = picked.label;
    place = label;
    input.value = label;
    rememberCity(label);
    const needle = normalizeCity(label);

    let scope: Set<string>;
    let country = '';
    if (picked.kind === 'city') {
      scope = nearbyCitySet(label, coordList);
    } else {
      country = needle;
      scope = new Set<string>([country]);
      for (const event of events) {
        if (normalizeCity(event.co) === country) scope.add(normalizeCity(event.ci));
      }
      for (const item of milongas) {
        if (normalizeCity(item.co) === country) scope.add(normalizeCity(item.c));
      }
    }

    const matchCountry = (value: string) => Boolean(country) && normalizeCity(value) === country;
    const matchPlace = (value: string) => scope.has(normalizeCity(value));

    const localEvents = events.filter(
      (event) => matchPlace(event.ci) || matchCountry(event.co) || matchCountry(event.ci),
    );
    const localMilongas = milongas.filter(
      (item) => matchPlace(item.c) || matchCountry(item.co),
    );

    const nearbyCount = coordList.filter(
      ([name]) => scope.has(normalizeCity(name)) && normalizeCity(name) !== needle,
    ).length;

    if (picked.kind === 'country') {
      const cities = [...scope].filter((name) => name !== country).length;
      status.textContent = `Showing ${label}${cities ? ` — ${cities} ${cities === 1 ? 'city' : 'cities'}` : ''}.`;
    } else {
      status.textContent = `Showing ${label}${nearbyCount > 0 ? ` and ${nearbyCount} nearby ${nearbyCount === 1 ? 'city' : 'cities'}` : ''}.`;
    }

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
      : `<p class="app-now-empty">Nothing running in ${escapeHtml(label)} right now.</p>`;

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

    const milongasHref =
      picked.kind === 'city'
        ? `/milongas?city=${encodeURIComponent(label)}`
        : '/milongas';

    results.innerHTML =
      `<section class="app-now-section"><h2 class="app-now-heading">Events on now <span>${localEvents.length}</span></h2>${eventsHtml}</section>` +
      `<section class="app-now-section"><h2 class="app-now-heading">Milongas tonight <span>${localMilongas.length}</span></h2>${milongasHtml}` +
      `<a class="app-link" href="${milongasHref}">All milongas in ${escapeHtml(label)}</a></section>`;
    syncUrl(label);
  }

  function applyInput(): void {
    place = input.value.trim();
    render();
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    applyInput();
  });

  input.addEventListener('change', applyInput);

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
        place = best.city;
        input.value = place;
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
