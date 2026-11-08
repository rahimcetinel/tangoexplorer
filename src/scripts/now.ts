type NowEvent = { t: string; slug: string; ci: string; co: string; dates: string; w: string };
type NowMilonga = { n: string; c: string; s: string; e: string; v: string; ty: string };
type Coord = [string, number, number];

const RADIUS_KM = 150;
const STORAGE_KEY = 'te-city';

const TIMEZONE_CITY: Record<string, string> = {
  'Europe/Istanbul': 'Istanbul',
  'Europe/Berlin': 'Berlin',
  'Europe/Vienna': 'Vienna',
  'Europe/Zurich': 'Zürich',
  'Europe/Athens': 'Athens',
  'Europe/Madrid': 'Madrid',
  'Europe/Paris': 'Paris',
  'Europe/Rome': 'Rome',
  'Europe/London': 'London',
  'Europe/Warsaw': 'Warsaw',
  'Europe/Lisbon': 'Lisbon',
  'Europe/Amsterdam': 'Amsterdam',
  'Europe/Brussels': 'Brussels',
  'Europe/Copenhagen': 'Copenhagen',
  'Europe/Stockholm': 'Stockholm',
  'Europe/Helsinki': 'Helsinki',
  'America/Argentina/Buenos_Aires': 'Buenos Aires',
  'America/Sao_Paulo': 'São Paulo',
  'America/New_York': 'New York',
  'America/Chicago': 'Chicago',
  'America/Los_Angeles': 'Los Angeles',
  'America/Mexico_City': 'Mexico City',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .trim();
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

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
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
  const coordList = readJson<Coord>('[data-now-coords]');
  const coords = new Map(coordList.map(([city, lat, lng]) => [normalize(city), { city, lat, lng }]));

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
  let city = params.get('city') ?? localStorage.getItem(STORAGE_KEY) ?? '';

  if (!city) {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    city = TIMEZONE_CITY[zone] ?? '';
  }
  input.value = city;

  function nearbyCities(): Set<string> {
    const origin = coords.get(normalize(city));
    const set = new Set<string>([normalize(city)]);
    if (!origin) return set;
    for (const entry of coords.values()) {
      if (distanceKm([origin.lat, origin.lng], [entry.lat, entry.lng]) <= RADIUS_KM) {
        set.add(normalize(entry.city));
      }
    }
    return set;
  }

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
    localStorage.setItem(STORAGE_KEY, city);
    const scope = nearbyCities();
    const match = (value: string) => scope.has(normalize(value));

    const localEvents = events.filter((event) => match(event.ci) || match(event.co));
    const localMilongas = milongas.filter((item) => match(item.c));
    const nearbyCount = coordList.filter(([name]) => scope.has(normalize(name)) && normalize(name) !== normalize(city)).length;

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
