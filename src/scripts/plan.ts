type PlanEvent = { s: string; t: string; st: string; en: string; ci: string; co: string; k: string; w: string };
type PlanMilonga = { n: string; c: string; d: string[]; s: string; e: string; v: string; ty: string; r: string };

const DAY = 86_400_000;
// `getUTCDay()` order, matching the `days` labels stored on milongas.
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A "plan" longer than a month is almost certainly a typo, and it would list the
// same recurring milonga dozens of times.
const MAX_DAYS = 31;

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

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}

function shortRange(start: string, end: string): string {
  if (!start) return '';
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end || start}T00:00:00Z`);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return a.getUTCDate() === b.getUTCDate()
      ? `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`
      : `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  }
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

function dayLabel(date: Date): string {
  return `${DAY_LONG[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function initPlan(): void {
  const page = document.querySelector<HTMLElement>('[data-plan-page]');
  if (!page) return;
  const form = page.querySelector<HTMLFormElement>('[data-plan-form]')!;
  const cityInput = page.querySelector<HTMLInputElement>('[data-plan-city]')!;
  const startInput = page.querySelector<HTMLInputElement>('[data-plan-start]')!;
  const endInput = page.querySelector<HTMLInputElement>('[data-plan-end]')!;
  const summary = page.querySelector<HTMLElement>('[data-plan-summary]')!;
  const results = page.querySelector<HTMLElement>('[data-plan-results]')!;
  const suggestBox = page.querySelector<HTMLElement>('[data-plan-suggest]')!;
  if (!form || !cityInput || !startInput || !endInput || !summary || !results || !suggestBox) return;

  const events = readList<PlanEvent>('[data-plan-events]');
  const milongas = readList<PlanMilonga>('[data-plan-milongas]');

  // City index for the combobox: the native datalist popup was unstylable and
  // dumped every city on screen at once, so suggestions are rendered here.
  const cityStats = new Map<string, { events: number; milongas: number }>();
  const bump = (name: string | undefined, key: 'events' | 'milongas') => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return;
    const entry = cityStats.get(trimmed) ?? { events: 0, milongas: 0 };
    entry[key] += 1;
    cityStats.set(trimmed, entry);
  };
  events.forEach((event) => bump(event.ci, 'events'));
  milongas.forEach((item) => bump(item.c, 'milongas'));
  const cityNames = [...cityStats.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  const SUGGEST_LIMIT = 8;

  const params = new URLSearchParams(window.location.search);

  let city = params.get('city') ?? '';
  let start = params.get('start') ?? '';
  let end = params.get('end') ?? '';

  // Older links used ?weekend=YYYY-MM-DD for a Friday–Sunday plan.
  const legacyWeekend = params.get('weekend');
  if (!start && legacyWeekend) {
    const legacyStart = parseIsoDate(legacyWeekend);
    if (legacyStart) {
      start = iso(legacyStart);
      end = iso(addDays(legacyStart, 2));
    }
  }

  start = parseIsoDate(start) ? start : startInput.value;
  end = parseIsoDate(end) ? end : endInput.value;
  cityInput.value = city;
  startInput.value = start;
  endInput.value = end;

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  // Normalise the pair. The start never moves on its own: an end that lands
  // before the start clamps forward to the start (and the native picker greys
  // those days out via `min`), and anything past the cap clamps to the cap.
  function keepRangeSane(): void {
    const fallback = parseIsoDate(start) ?? new Date();
    const from = parseIsoDate(startInput.value) ?? fallback;
    let to = parseIsoDate(endInput.value) ?? from;
    if (to < from) to = from;
    const capped = addDays(from, MAX_DAYS - 1);
    if (to > capped) to = capped;
    start = iso(from);
    end = iso(to);
    if (startInput.value !== start) startInput.value = start;
    if (endInput.value !== end) endInput.value = end;
    endInput.min = start;
  }

  function syncUrl(): void {
    const next = new URLSearchParams();
    if (city) next.set('city', city);
    if (start) next.set('start', start);
    if (end) next.set('end', end);
    window.history.replaceState({}, '', next.toString() ? `/plan?${next}` : '/plan');
  }

  function render(): void {
    const query = normalize(city);
    if (!query) {
      summary.textContent = 'Pick a city and your dates.';
      results.innerHTML =
        '<p class="app-plan-hint">Try <button type="button" class="app-plan-example" data-plan-example="Istanbul">Istanbul</button>, ' +
        '<button type="button" class="app-plan-example" data-plan-example="Berlin">Berlin</button> or ' +
        '<button type="button" class="app-plan-example" data-plan-example="Buenos Aires">Buenos Aires</button>.</p>';
      return;
    }

    const startDate = parseIsoDate(start) ?? parseIsoDate(startInput.value) ?? new Date();
    const endDate = parseIsoDate(end) ?? startDate;
    const startIso = iso(startDate);
    const endIso = iso(endDate);

    const matchesCity = (value: string) => normalize(value).includes(query);

    const matchedEvents = events
      .filter((event) => {
        if (!event.st) return false;
        const eventEnd = event.en || event.st;
        if (eventEnd < startIso || event.st > endIso) return false;
        return matchesCity(event.ci) || matchesCity(event.co) || matchesCity(event.w);
      })
      .sort((a, b) => a.st.localeCompare(b.st));

    const matchedMilongas = milongas
      .filter((item) => matchesCity(item.c))
      .sort((a, b) => (a.s || '99').localeCompare(b.s || '99') || a.n.localeCompare(b.n));

    // Recurring milongas repeat on every matching weekday, so the list is grouped
    // by calendar date rather than by weekday name.
    const groups: { label: string; rows: PlanMilonga[] }[] = [];
    for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
      const dayName = DAY_NAMES[cursor.getUTCDay()];
      const rows = matchedMilongas.filter((item) => item.d.includes(dayName));
      if (rows.length) groups.push({ label: dayLabel(cursor), rows });
    }
    const milongaCount = groups.reduce((total, group) => total + group.rows.length, 0);

    const eventWord = matchedEvents.length === 1 ? 'event' : 'events';
    const milongaWord = milongaCount === 1 ? 'milonga' : 'milongas';
    const range = shortRange(startIso, endIso);
    summary.textContent = `${matchedEvents.length} ${eventWord} · ${milongaCount} ${milongaWord} in ${city} · ${range}`;

    const eventsHtml = matchedEvents.length
      ? `<ul class="app-plan-list">${matchedEvents
          .map(
            (event) =>
              `<li><a class="app-plan-item" data-card data-detail-link href="/news/${escapeHtml(event.s)}">` +
              `<span class="app-plan-item-title">${escapeHtml(event.t)}</span>` +
              `<span class="app-plan-item-meta">${escapeHtml(shortRange(event.st, event.en))}` +
              (event.k ? ` · ${escapeHtml(event.k)}` : '') +
              (event.w ? ` · ${escapeHtml(event.w)}` : '') +
              `</span></a></li>`,
          )
          .join('')}</ul>`
      : '<p class="app-plan-empty">No festivals or marathons overlap these dates.</p>';

    const milongasHtml = groups.length
      ? groups
          .map(
            (group) =>
              `<h3 class="app-plan-day">${escapeHtml(group.label)}</h3>` +
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
      `<section class="app-plan-section"><h2 class="app-plan-heading">Milongas <span>${milongaCount}</span></h2>${milongasHtml}` +
      `<a class="app-link" href="/milongas?city=${encodeURIComponent(city)}">All milongas in ${escapeHtml(city)}</a></section>` +
      `</div>`;
    syncUrl();
  }

  let suggestItems: string[] = [];
  let suggestActive = -1;

  function hideSuggest(): void {
    suggestBox.hidden = true;
    suggestBox.innerHTML = '';
    suggestItems = [];
    suggestActive = -1;
    cityInput.setAttribute('aria-expanded', 'false');
    cityInput.removeAttribute('aria-activedescendant');
  }

  function paintActive(): void {
    const options = suggestBox.querySelectorAll<HTMLElement>('.app-suggest-item');
    options.forEach((option, index) => option.classList.toggle('is-active', index === suggestActive));
    const active = options[suggestActive];
    if (active) {
      cityInput.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      cityInput.removeAttribute('aria-activedescendant');
    }
  }

  function renderSuggest(query: string): void {
    const needle = normalize(query);
    if (!needle) {
      hideSuggest();
      return;
    }
    // Prefix matches first, then substring matches — "ber" should offer Berlin
    // before Oberammergau.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of cityNames) {
      const key = normalize(name);
      if (key.startsWith(needle)) starts.push(name);
      else if (key.includes(needle)) contains.push(name);
    }
    suggestItems = [...starts, ...contains].slice(0, SUGGEST_LIMIT);
    if (!suggestItems.length) {
      hideSuggest();
      return;
    }
    suggestActive = -1;
    suggestBox.innerHTML = suggestItems
      .map((name, index) => {
        const stat = cityStats.get(name);
        const meta = [
          stat?.events ? `${stat.events} ${stat.events === 1 ? 'event' : 'events'}` : '',
          stat?.milongas ? `${stat.milongas} ${stat.milongas === 1 ? 'milonga' : 'milongas'}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          `<button type="button" class="app-suggest-item" role="option" id="plan-city-option-${index}" data-plan-pick-index="${index}">` +
          `<span class="app-suggest-title">${escapeHtml(name)}</span>` +
          (meta ? `<span class="app-suggest-meta">${escapeHtml(meta)}</span>` : '') +
          `</button>`
        );
      })
      .join('');
    suggestBox.hidden = false;
    cityInput.setAttribute('aria-expanded', 'true');
  }

  function pickCity(name: string): void {
    cityInput.value = name;
    city = name;
    hideSuggest();
    render();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    city = cityInput.value.trim();
    hideSuggest();
    keepRangeSane();
    render();
  });

  cityInput.addEventListener('input', () => {
    city = cityInput.value.trim();
    renderSuggest(cityInput.value);
  });

  cityInput.addEventListener('focus', () => {
    if (cityInput.value.trim()) renderSuggest(cityInput.value);
  });

  cityInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestBox.hidden) {
        renderSuggest(cityInput.value);
        return;
      }
      if (!suggestItems.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      suggestActive = (suggestActive + delta + suggestItems.length) % suggestItems.length;
      paintActive();
      return;
    }
    if (event.key === 'Enter' && !suggestBox.hidden && suggestActive >= 0) {
      event.preventDefault();
      const picked = suggestItems[suggestActive];
      if (picked) pickCity(picked);
      return;
    }
    if (event.key === 'Escape') hideSuggest();
  });

  cityInput.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (!suggestBox.contains(document.activeElement)) hideSuggest();
    }, 120);
  });

  // mousedown (not click) so the field keeps focus while the value is picked.
  suggestBox.addEventListener('mousedown', (event) => {
    const option = (event.target as Element | null)?.closest<HTMLElement>('[data-plan-pick-index]');
    if (!option) return;
    event.preventDefault();
    const index = Number(option.dataset.planPickIndex);
    const picked = suggestItems[index];
    if (picked) pickCity(picked);
  });

  cityInput.addEventListener('change', () => {
    city = cityInput.value.trim();
    hideSuggest();
    render();
  });

  // Native date inputs are inconsistent: picking from the calendar fires both
  // `input` and `change`, typing the segments fires `input` per keystroke and
  // `change` only on blur. Listen to both, and ignore half-typed values so the
  // normaliser does not fight the user mid-edit.
  function onDateChange(): void {
    if (!ISO_DATE.test(startInput.value) || !ISO_DATE.test(endInput.value)) return;
    keepRangeSane();
    render();
  }

  startInput.addEventListener('input', onDateChange);
  startInput.addEventListener('change', onDateChange);
  endInput.addEventListener('input', onDateChange);
  endInput.addEventListener('change', onDateChange);

  results.addEventListener('click', (event) => {
    const example = (event.target as Element | null)?.closest<HTMLElement>('[data-plan-example]');
    if (!example) return;
    cityInput.value = example.dataset.planExample ?? '';
    city = cityInput.value;
    hideSuggest();
    render();
  });

  keepRangeSane();
  render();
  syncUrl();
}
