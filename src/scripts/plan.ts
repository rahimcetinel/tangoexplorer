type PlanEvent = { s: string; t: string; st: string; en: string; ci: string; co: string; k: string; w: string };
type PlanMilonga = { n: string; c: string; d: string[]; s: string; e: string; v: string; ty: string; r: string };

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
    .replace(/[’']/g, '')
    .toLowerCase()
    .trim();
}

function readList<T>(selector: string): T[] {
  const el = document.querySelector<HTMLScriptElement>(selector);
  if (!el?.textContent) return [];
  try {
    return JSON.parse(el.textContent) as T[];
  } catch {
    return [];
  }
}

function shortRange(start: string, end: string): string {
  if (!start) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end || start}T00:00:00Z`);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return a.getUTCDate() === b.getUTCDate()
      ? `${a.getUTCDate()} ${months[a.getUTCMonth()]}`
      : `${a.getUTCDate()}–${b.getUTCDate()} ${months[a.getUTCMonth()]}`;
  }
  return `${a.getUTCDate()} ${months[a.getUTCMonth()]} – ${b.getUTCDate()} ${months[b.getUTCMonth()]}`;
}

export function initPlan(): void {
  const page = document.querySelector<HTMLElement>('[data-plan-page]');
  if (!page) return;
  const form = page.querySelector<HTMLFormElement>('[data-plan-form]');
  const cityInput = page.querySelector<HTMLInputElement>('[data-plan-city]');
  const weekendSelect = page.querySelector<HTMLSelectElement>('[data-plan-weekend]');
  const summary = page.querySelector<HTMLElement>('[data-plan-summary]');
  const results = page.querySelector<HTMLElement>('[data-plan-results]');
  if (!form || !cityInput || !weekendSelect || !summary || !results) return;

  const events = readList<PlanEvent>('[data-plan-events]');
  const milongas = readList<PlanMilonga>('[data-plan-milongas]');
  const params = new URLSearchParams(window.location.search);
  let city = params.get('city') ?? '';
  let weekend = params.get('weekend') ?? weekendSelect.value;

  if (params.get('weekend')) {
    const exists = [...weekendSelect.options].some((option) => option.value === weekend);
    weekendSelect.value = exists ? weekend : weekendSelect.value;
    weekend = weekendSelect.value;
  }
  cityInput.value = city;

  function syncUrl(): void {
    const next = new URLSearchParams();
    if (city) next.set('city', city);
    if (weekend) next.set('weekend', weekend);
    window.history.replaceState({}, '', next.toString() ? `/plan?${next}` : '/plan');
  }

  function render(): void {
    const query = normalize(city);
    if (!query) {
      summary.textContent = 'Pick a city to see its weekend.';
      results.innerHTML =
        '<p class="app-plan-hint">Try <button type="button" class="app-plan-example" data-plan-example="Istanbul">Istanbul</button>, ' +
        '<button type="button" class="app-plan-example" data-plan-example="Berlin">Berlin</button> or ' +
        '<button type="button" class="app-plan-example" data-plan-example="Buenos Aires">Buenos Aires</button>.</p>';
      return;
    }

    const [year, month, day] = weekend.split('-').map(Number);
    const friday = new Date(Date.UTC(year!, month! - 1, day!));
    const sunday = new Date(friday.getTime() + 2 * 86_400_000);
    const fridayIso = friday.toISOString().slice(0, 10);
    const sundayIso = sunday.toISOString().slice(0, 10);
    const weekendDays = ['friday', 'saturday', 'sunday'];

    const matchesCity = (value: string) => normalize(value).includes(query);

    const matchedEvents = events
      .filter((event) => {
        if (!event.st) return false;
        const end = event.en || event.st;
        if (end < fridayIso || event.st > sundayIso) return false;
        return matchesCity(event.ci) || matchesCity(event.co) || matchesCity(event.w);
      })
      .sort((a, b) => a.st.localeCompare(b.st));

    const matchedMilongas = milongas
      .filter((item) => matchesCity(item.c) && item.d.some((label) => weekendDays.includes(label)))
      .sort((a, b) => (a.s || '99').localeCompare(b.s || '99') || a.n.localeCompare(b.n));

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label =
      friday.getUTCMonth() === sunday.getUTCMonth()
        ? `${friday.getUTCDate()}–${sunday.getUTCDate()} ${months[sunday.getUTCMonth()]}`
        : `${friday.getUTCDate()} ${months[friday.getUTCMonth()]} – ${sunday.getUTCDate()} ${months[sunday.getUTCMonth()]}`;
    const eventWord = matchedEvents.length === 1 ? 'event' : 'events';
    const milongaWord = matchedMilongas.length === 1 ? 'milonga' : 'milongas';
    summary.textContent = `${matchedEvents.length} ${eventWord} · ${matchedMilongas.length} ${milongaWord} in ${city} for ${label}`;

    const eventsHtml = matchedEvents.length
      ? `<ul class="app-plan-list">${matchedEvents
          .map(
            (event) =>
              `<li><a class="app-plan-item" href="/news/${escapeHtml(event.s)}">` +
              `<span class="app-plan-item-title">${escapeHtml(event.t)}</span>` +
              `<span class="app-plan-item-meta">${escapeHtml(shortRange(event.st, event.en))}` +
              (event.k ? ` · ${escapeHtml(event.k)}` : '') +
              (event.w ? ` · ${escapeHtml(event.w)}` : '') +
              `</span></a></li>`,
          )
          .join('')}</ul>`
      : '<p class="app-plan-empty">No festivals or marathons overlap this weekend.</p>';

    const milongaGroups = ['friday', 'saturday', 'sunday']
      .map((day) => ({
        day,
        rows: matchedMilongas.filter((item) => item.d.includes(day)),
      }))
      .filter((group) => group.rows.length);

    const milongasHtml = milongaGroups.length
      ? milongaGroups
          .map(
            (group) =>
              `<h3 class="app-plan-day">${group.day.charAt(0).toUpperCase() + group.day.slice(1)}</h3>` +
              `<ul class="app-plan-list">${group.rows
                .map(
                  (item) =>
                    `<li><div class="app-plan-item">` +
                    `<span class="app-plan-item-title">${escapeHtml(item.n)}</span>` +
                    `<span class="app-plan-item-meta">${escapeHtml(item.s)}${item.e ? `–${escapeHtml(item.e)}` : ''}` +
                    (item.v ? ` · ${escapeHtml(item.v)}` : '') +
                    ` · ${item.ty === 'practica' ? 'Practica' : 'Milonga'}` +
                    `</span></div></li>`,
                )
                .join('')}</ul>`,
          )
          .join('')
      : '<p class="app-plan-empty">No milongas listed for those days.</p>';

    results.innerHTML =
      `<div class="app-plan-columns">` +
      `<section class="app-plan-section"><h2 class="app-plan-heading">Events <span>${matchedEvents.length}</span></h2>${eventsHtml}` +
      `<a class="app-link" href="/?q=${encodeURIComponent(city)}">Search all events in ${escapeHtml(city)}</a></section>` +
      `<section class="app-plan-section"><h2 class="app-plan-heading">Milongas <span>${matchedMilongas.length}</span></h2>${milongasHtml}` +
      `<a class="app-link" href="/milongas?city=${encodeURIComponent(city)}">All milongas in ${escapeHtml(city)}</a></section>` +
      `</div>`;
    syncUrl();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    city = cityInput.value.trim();
    weekend = weekendSelect.value;
    render();
  });

  cityInput.addEventListener('change', () => {
    city = cityInput.value.trim();
    weekend = weekendSelect.value;
    render();
  });

  weekendSelect.addEventListener('change', () => {
    weekend = weekendSelect.value;
    render();
  });

  results.addEventListener('click', (event) => {
    const example = (event.target as Element | null)?.closest<HTMLElement>('[data-plan-example]');
    if (!example) return;
    cityInput.value = example.dataset.planExample ?? '';
    city = cityInput.value;
    render();
  });

  if (city) {
    render();
  } else {
    render();
  }
  syncUrl();
}