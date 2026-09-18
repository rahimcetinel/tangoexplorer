import { DAYS_ORDER, regionLabel, type HoyData, type Milonga } from '../lib/hoy';
import { PALETTE } from '../lib/country-color';
import { ui, weekdaysLong, weekdaysShort, type Locale } from '../lib/i18n';

type Filters = { region: string; city: string; day: string; type: string; q: string };

const DAY_INDEX: Record<string, number> = Object.fromEntries(DAYS_ORDER.map((day, index) => [day, index]));

const todayIndex = (new Date().getDay() + 6) % 7;
const TODAY_SLUG = DAYS_ORDER[todayIndex];
const ORDERED_DAYS: string[] = [...DAYS_ORDER.slice(todayIndex), ...DAYS_ORDER.slice(0, todayIndex)];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function initMilongas() {
  const shell = document.querySelector<HTMLElement>('[data-app-shell]');
  const listEl = document.querySelector<HTMLElement>('[data-milonga-list]');
  const tabsEl = document.querySelector<HTMLElement>('[data-milonga-tabs]');
  const emptyEl = document.querySelector<HTMLElement>('[data-milonga-empty]');
  const detailEl = document.querySelector<HTMLElement>('[data-milonga-detail]');
  const regionSel = document.querySelector<HTMLSelectElement>('[data-milonga-region]');
  const citySel = document.querySelector<HTMLSelectElement>('[data-milonga-city]');
  const searches = [...document.querySelectorAll<HTMLInputElement>('[data-search-input]')];
  const backdrop = document.querySelector<HTMLElement>('[data-detail-backdrop]');
  const panel = document.querySelector<HTMLElement>('.app-detail');
  if (!shell || !listEl || !regionSel || !citySel) {
    return;
  }
  const locale = (shell.dataset.locale as Locale) || 'en';
  const copy = ui[locale];

  let items: Milonga[] = [];
  let selected: string | null = null;
  let filters = readUrl();
  let cityColors = new Map<string, string>();

  function readUrl(): Filters {
    const params = new URLSearchParams(window.location.search);
    return {
      region: params.get('region') || 'turkiye',
      city: params.get('city') || '',
      day: params.get('day') || '',
      type: params.get('type') || '',
      q: params.get('q') || '',
    };
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (filters.region && filters.region !== 'turkiye') params.set('region', filters.region);
    if (filters.city) params.set('city', filters.city);
    if (filters.day) params.set('day', filters.day);
    if (filters.type) params.set('type', filters.type);
    if (filters.q) params.set('q', filters.q);
    const query = params.toString();
    window.history.replaceState(history.state ?? {}, '', query ? `?${query}` : window.location.pathname);
    renderSummary();
  }

  function renderSummary() {
    const el = document.querySelector<HTMLElement>('[data-menu-summary]');
    if (!el) return;
    const parts = [
      regionLabel(filters.region, locale),
      filters.city,
      filters.day ? weekdaysShort[locale][DAY_INDEX[filters.day]] : '',
      filters.type ? (filters.type === 'practica' ? copy.milongaTypePractica : copy.milongaTypeMilonga) : '',
      filters.q,
    ].filter(Boolean);
    el.innerHTML = parts.length
      ? parts.map((part) => `<span class="is-chip">${escapeHtml(part)}</span>`).join('')
      : '';
  }

  function citiesForRegion(): string[] {
    const set = new Set<string>();
    for (const item of items) {
      if (item.region === filters.region && item.city) set.add(item.city);
    }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }

  function fillCities() {
    const cities = citiesForRegion();
    if (filters.city && !cities.includes(filters.city)) filters.city = '';
    citySel!.innerHTML =
      `<option value="">${copy.filterAll}</option>` +
      cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join('');
    citySel!.value = filters.city;
  }

  function matches(item: Milonga): boolean {
    if (item.region !== filters.region) return false;
    if (filters.city && item.city !== filters.city) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.day && !item.days.includes(filters.day)) return false;
    if (filters.q) {
      const hay = `${item.name} ${item.venue} ${item.area} ${item.city} ${item.country}`.toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  }

  function byTime(a: Milonga, b: Milonga): number {
    return (a.start || '99').localeCompare(b.start || '99') || a.name.localeCompare(b.name);
  }

  function syncRail() {
    regionSel!.value = filters.region;
    document.querySelectorAll<HTMLElement>('[data-milonga-day]').forEach((chip) => {
      const on = (chip.dataset.milongaDay || '') === filters.day;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll<HTMLElement>('[data-milonga-type]').forEach((chip) => {
      const on = (chip.dataset.milongaType || '') === filters.type;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    searches.forEach((input) => {
      input.value = filters.q;
    });
  }

  function renderTabs() {
    if (!tabsEl) return;
    const present = ORDERED_DAYS.filter((day) =>
      items.some(
        (item) =>
          item.region === filters.region &&
          item.days.includes(day) &&
          (!filters.type || item.type === filters.type) &&
          (!filters.city || item.city === filters.city),
      ),
    );
    tabsEl.innerHTML =
      `<button type="button" class="app-mtab${filters.day ? '' : ' is-active'}" data-day="">${copy.milongaAllDays}</button>` +
      present
        .map(
          (day) =>
            `<button type="button" class="app-mtab${filters.day === day ? ' is-active' : ''}${day === TODAY_SLUG ? ' is-today' : ''}" data-day="${day}">${weekdaysShort[locale][DAY_INDEX[day]]}</button>`,
        )
        .join('');
  }

  function itemHtml(item: Milonga): string {
    const time = item.start ? `${item.start}${item.end ? `–${item.end}` : ''}` : '—';
    const meta = item.venue || item.area;
    const typeLabel = item.type === 'practica' ? copy.milongaTypePractica : copy.milongaTypeMilonga;
    return (
      `<button type="button" class="app-mitem${selected === item.id ? ' is-selected' : ''}" data-milonga-id="${escapeHtml(item.id)}">` +
      `<span class="app-mitem-time">${escapeHtml(time)}</span>` +
      `<span class="app-mitem-body">` +
      `<span class="app-mitem-name">${escapeHtml(item.name)}</span>` +
      (meta ? `<span class="app-mitem-meta">${escapeHtml(meta)}</span>` : '') +
      `</span>` +
      `<span class="app-mitem-tags">` +
      `<span class="app-mitem-type is-${item.type}">${typeLabel}</span>` +
      (item.city
        ? `<span class="app-mitem-city" style="--cc:${cityColors.get(item.city) || ''}">${escapeHtml(item.city)}</span>`
        : '') +
      (item.price ? `<span class="app-mitem-price">${escapeHtml(item.price)}</span>` : '') +
      `</span>` +
      `</button>`
    );
  }

  function renderList() {
    const filtered = items.filter(matches);
    cityColors = new Map(citiesForRegion().map((city, index) => [city, PALETTE[index % PALETTE.length]]));
    if (emptyEl) emptyEl.hidden = filtered.length > 0;
    const groups: { day: string; rows: Milonga[] }[] = [];
    if (filters.day) {
      const rows = filtered.slice().sort(byTime);
      if (rows.length) groups.push({ day: filters.day, rows });
    } else {
      for (const day of ORDERED_DAYS) {
        const rows = filtered.filter((item) => item.days.includes(day)).sort(byTime);
        if (rows.length) groups.push({ day, rows });
      }
      const undated = filtered.filter((item) => !item.days.length).sort(byTime);
      if (undated.length) groups.push({ day: '', rows: undated });
    }
    listEl!.innerHTML = groups
      .map(
        (group) =>
          `<section class="app-mgroup">` +
          `<h2 class="app-mgroup-head${group.day === TODAY_SLUG ? ' is-today' : ''}">` +
          `${group.day ? weekdaysLong[locale][DAY_INDEX[group.day]] : copy.milongaAllDays}` +
          (group.day === TODAY_SLUG ? `<em>${copy.whenToday}</em>` : '') +
          `<span>${group.rows.length}</span></h2>` +
          group.rows.map(itemHtml).join('') +
          `</section>`,
      )
      .join('');
  }

  function renderDetail() {
    if (!detailEl) return;
    const item = items.find((row) => row.id === selected);
    const head =
      `<div class="app-detail-eyebrow"><span>${copy.milongas}</span>` +
      `<button type="button" class="app-detail-close" data-milonga-close aria-label="${copy.closeDetail}">×</button></div>`;
    if (!item) {
      detailEl.innerHTML = head + `<p class="app-empty">${copy.milongaPick}</p>`;
      return;
    }
    const typeLabel = item.type === 'practica' ? copy.milongaTypePractica : copy.milongaTypeMilonga;
    const dayLabels = item.days.map((day) => weekdaysLong[locale][DAY_INDEX[day]]).join(', ');
    const time = item.start ? `${item.start}${item.end ? `–${item.end}` : ''}` : '';
    const rows: string[] = [];
    if (dayLabels) rows.push(`<div><dt>${copy.milongaDay}</dt><dd>${dayLabels}</dd></div>`);
    if (time) rows.push(`<div><dt>${copy.milongaTime}</dt><dd>${escapeHtml(time)}</dd></div>`);
    if (item.venue) rows.push(`<div><dt>${copy.milongaVenue}</dt><dd>${escapeHtml(item.venue)}</dd></div>`);
    if (item.address) rows.push(`<div><dt>${copy.milongaAddress}</dt><dd>${escapeHtml(item.address)}</dd></div>`);
    if (item.city) rows.push(`<div><dt>${copy.filterCity}</dt><dd>${escapeHtml(item.city)}</dd></div>`);
    if (item.price) rows.push(`<div><dt>${copy.milongaPrice}</dt><dd>${escapeHtml(item.price)}</dd></div>`);
    if (item.organizers) rows.push(`<div><dt>${copy.milongaOrganizers}</dt><dd>${escapeHtml(item.organizers)}</dd></div>`);
    const links: string[] = [];
    if (item.mapUrl) links.push(`<a class="app-link" href="${escapeHtml(item.mapUrl)}" target="_blank" rel="noopener">${copy.milongaMap}</a>`);
    if (item.website) links.push(`<a class="app-link" href="${escapeHtml(item.website)}" target="_blank" rel="noopener">Website</a>`);
    if (item.instagram) links.push(`<a class="app-link" href="${escapeHtml(item.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
    if (item.facebook) links.push(`<a class="app-link" href="${escapeHtml(item.facebook)}" target="_blank" rel="noopener">Facebook</a>`);
    if (item.phone) links.push(`<span class="app-link">${escapeHtml(item.phone)}</span>`);
    detailEl.innerHTML =
      head +
      `<h2 class="app-article-title">${escapeHtml(item.name)}</h2>` +
      `<p class="app-kicker">${typeLabel} · ${regionLabel(item.region, locale)}</p>` +
      `<dl class="app-facts-dl">${rows.join('')}</dl>` +
      `<div class="app-actions">` +
      (item.mapUrl ? `<a class="app-btn" href="${escapeHtml(item.mapUrl)}" target="_blank" rel="noopener">${copy.milongaMap}</a>` : '') +
      (item.detailUrl ? `<a class="app-btn app-btn-solid" href="${escapeHtml(item.detailUrl)}" target="_blank" rel="noopener">${copy.milongaOpenSource}</a>` : '') +
      `</div>` +
      (links.length ? `<p class="app-links">${links.join(' · ')}</p>` : '') +
      (item.verified ? `<p class="app-source">${copy.milongaVerified}: ${escapeHtml(item.verified)}</p>` : '');
  }

  function openDetail() {
    panel?.classList.add('is-open');
    if (backdrop) backdrop.hidden = false;
    if (window.matchMedia('(max-width: 1279px)').matches) {
      document.body.classList.add('detail-open');
    }
    panel?.scrollTo({ top: 0 });
  }

  function closeDetail() {
    panel?.classList.remove('is-open');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('detail-open');
  }

  function fullRender() {
    fillCities();
    syncRail();
    renderTabs();
    renderList();
    renderDetail();
    writeUrl();
  }

  regionSel.addEventListener('change', () => {
    filters.region = regionSel.value;
    filters.city = '';
    fullRender();
  });
  citySel.addEventListener('change', () => {
    filters.city = citySel.value;
    renderTabs();
    renderList();
    writeUrl();
  });

  listEl.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-milonga-id]');
    if (!target) return;
    selected = target.dataset.milongaId || null;
    renderList();
    renderDetail();
    openDetail();
  });

  tabsEl?.addEventListener('click', (event) => {
    const tab = (event.target as Element | null)?.closest<HTMLElement>('[data-day]');
    if (!tab) return;
    filters.day = tab.dataset.day || '';
    renderTabs();
    renderList();
    writeUrl();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const dayChip = target?.closest<HTMLElement>('[data-milonga-day]');
    if (dayChip) {
      filters.day = dayChip.dataset.milongaDay || '';
      fullRender();
      return;
    }
    const typeChip = target?.closest<HTMLElement>('[data-milonga-type]');
    if (typeChip) {
      filters.type = typeChip.dataset.milongaType || '';
      fullRender();
      return;
    }
    if (target?.closest('[data-milonga-clear]')) {
      filters.city = '';
      filters.day = '';
      filters.type = '';
      filters.q = '';
      fullRender();
      return;
    }
    if (target?.closest('[data-milonga-close]') || target?.closest('[data-detail-backdrop]')) {
      closeDetail();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetail();
  });

  let searchTimer = 0;
  searches.forEach((input) => {
    input.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        filters.q = input.value.trim();
        searches.forEach((other) => {
          if (other !== input) {
            other.value = filters.q;
          }
        });
        renderTabs();
        renderList();
        writeUrl();
      }, 150);
    });
  });

  async function load() {
    listEl!.innerHTML =
      '<div class="app-results-skeleton"><div class="app-card-skeleton"></div><div class="app-card-skeleton"></div><div class="app-card-skeleton"></div></div>';
    try {
      const response = await fetch('/hoy-milongas.json', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = (await response.json()) as HoyData;
      items = data.items || [];
    } catch {
      items = [];
    }
    fullRender();
  }

  void load();
}
