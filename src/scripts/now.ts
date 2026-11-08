import { distanceKm, guessCity, nearbyCitySet, normalizeCity, rememberCity } from '../lib/now-core';
import type { NowAllEvent, NowAllMilonga, NowCoord } from '../lib/now-data';

type Picked = { kind: 'city' | 'country' | 'none'; label: string };
type Scope = 'today' | 'week' | 'month';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_SHORT: Record<string, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
};

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

function ymd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

type Window = { start: string; end: string; days: string[]; label: string };

function windowFor(scope: Scope, now: Date): Window {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (scope === 'today') {
    return { start: ymd(start), end: ymd(start), days: [WEEKDAYS[start.getDay()]!], label: 'today' };
  }
  if (scope === 'week') {
    // Upcoming seven days rather than the Monday-to-Sunday block: on a Sunday
    // the ISO week is already over, which made the view look empty.
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: ymd(start),
      end: ymd(end),
      days: [...WEEKDAYS],
      label: 'this week',
    };
  }
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return {
    start: ymd(start),
    end: ymd(last),
    days: [...WEEKDAYS],
    label: 'this month',
  };
}

export function initNow(): void {
  const page = document.querySelector<HTMLElement>('[data-now-page]');
  if (!page) return;
  const form = page.querySelector<HTMLFormElement>('[data-now-form]');
  const input = page.querySelector<HTMLInputElement>('[data-now-city]');
  const status = page.querySelector<HTMLElement>('[data-now-status]');
  const results = page.querySelector<HTMLElement>('[data-now-results]');
  const locate = page.querySelector<HTMLButtonElement>('[data-now-locate]');
  const scopeButtons = [...page.querySelectorAll<HTMLButtonElement>('[data-now-when]')];
  if (!input || !status || !results) return;

  const coordList = readJson<NowCoord>('[data-now-coords]');
  const knownCities = readJson<string>('[data-now-cities]');
  const knownCountries = readJson<string>('[data-now-countries]');
  const allEvents = readJson<NowAllEvent>('[data-now-all-events]');
  const allMilongas = readJson<NowAllMilonga>('[data-now-all-milongas]');

  const cityNames = uniqueSorted(
    knownCities.length
      ? knownCities
      : [...allEvents.map((event) => event.ci), ...allMilongas.map((item) => item.c), ...coordList.map(([city]) => city)],
  );
  const countryNames = uniqueSorted(
    knownCountries.length
      ? knownCountries
      : [...allEvents.map((event) => event.co), ...allMilongas.map((item) => item.co)],
  );

  const params = new URLSearchParams(window.location.search);
  let place = params.get('city') ?? guessCity();
  let scope: Scope = params.get('when') === 'week' ? 'week' : params.get('when') === 'month' ? 'month' : 'today';
  input.value = place;

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

  function syncUrl(label: string, selected: Scope): void {
    const next = new URLSearchParams();
    if (label) next.set('city', label);
    if (selected !== 'today') next.set('when', selected);
    window.history.replaceState({}, '', next.toString() ? `/now?${next}` : '/now');
  }

  function syncScopeButtons(): void {
    scopeButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.nowWhen === scope));
    });
  }

  function render(): void {
    syncScopeButtons();
    const picked = pick(place);
    if (picked.kind === 'none') {
      status.textContent = place
        ? `No city or country matches “${place}”. Try a larger place nearby.`
        : 'Type a city or country, or let us use your location.';
      results.innerHTML = '';
      syncUrl(place, scope);
      return;
    }

    const label = picked.label;
    place = label;
    input.value = label;
    rememberCity(label);
    const needle = normalizeCity(label);
    const window = windowFor(scope, new Date());

    let scopeSet: Set<string>;
    let country = '';
    if (picked.kind === 'city') {
      scopeSet = nearbyCitySet(label, coordList);
    } else {
      country = needle;
      scopeSet = new Set<string>([country]);
      for (const event of allEvents) {
        if (normalizeCity(event.co) === country) scopeSet.add(normalizeCity(event.ci));
      }
      for (const item of allMilongas) {
        if (normalizeCity(item.co) === country) scopeSet.add(normalizeCity(item.c));
      }
    }

    const matchCountry = (value: string) => Boolean(country) && normalizeCity(value) === country;
    const matchPlace = (value: string) => scopeSet.has(normalizeCity(value));

    const localEvents = allEvents
      .filter((event) => (matchPlace(event.ci) || matchCountry(event.co)) && event.st <= window.end && event.en >= window.start)
      .sort((a, b) => a.st.localeCompare(b.st));

    const daySet = new Set(window.days);
    const localMilongas = allMilongas
      .filter((item) => (matchPlace(item.c) || matchCountry(item.co)) && item.days.some((day) => daySet.has(day)))
      .sort((a, b) => (a.s || '99').localeCompare(b.s || '99') || a.n.localeCompare(b.n));

    const nearbyCount = coordList.filter(
      ([name]) => scopeSet.has(normalizeCity(name)) && normalizeCity(name) !== needle,
    ).length;

    const placeNote =
      picked.kind === 'country'
        ? (() => {
            const cities = [...scopeSet].filter((name) => name !== country).length;
            return cities ? ` — ${cities} ${cities === 1 ? 'city' : 'cities'}` : '';
          })()
        : nearbyCount > 0
          ? ` and ${nearbyCount} nearby ${nearbyCount === 1 ? 'city' : 'cities'}`
          : '';
    status.textContent = `Showing ${label}${placeNote} · ${window.label}.`;

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
      : `<p class="app-now-empty">No events in ${escapeHtml(label)} ${window.label}.</p>`;

    const milongasHtml = localMilongas.length
      ? `<ul class="app-now-list">${localMilongas
          .map((item) => {
            const days = item.days
              .filter((day) => daySet.has(day))
              .map((day) => DAY_SHORT[day] ?? day)
              .join(', ');
            return (
              `<li><div class="app-now-item">` +
              `<span class="app-now-item-title">${escapeHtml(item.n)}</span>` +
              `<span class="app-now-item-meta">${escapeHtml(days)} · ${escapeHtml(item.s)}${item.e ? `–${escapeHtml(item.e)}` : ''}` +
              (item.v ? ` · ${escapeHtml(item.v)}` : '') +
              (item.c ? ` · ${escapeHtml(item.c)}` : '') +
              `</span></div></li>`
            );
          })
          .join('')}</ul>`
      : `<p class="app-now-empty">No milongas listed ${window.label}.</p>`;

    const milongasHref =
      picked.kind === 'city'
        ? `/milongas?city=${encodeURIComponent(label)}`
        : '/milongas';

    results.innerHTML =
      `<section class="app-now-section"><h2 class="app-now-heading">Events <span>${localEvents.length}</span></h2>${eventsHtml}</section>` +
      `<section class="app-now-section"><h2 class="app-now-heading">Milongas <span>${localMilongas.length}</span></h2>${milongasHtml}` +
      `<a class="app-link" href="${milongasHref}">All milongas in ${escapeHtml(label)}</a></section>`;
    syncUrl(label, scope);
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

  scopeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      scope = button.dataset.nowWhen === 'week' ? 'week' : button.dataset.nowWhen === 'month' ? 'month' : 'today';
      render();
    });
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
