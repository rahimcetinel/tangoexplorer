import { regionLabel, type HoyData, type Milonga } from '../lib/hoy';
import { ui, weekdaysShort, type Locale } from '../lib/i18n';
import {
  citiesForRegion,
  cityColorsFor,
  detailHtml,
  escapeHtml,
  listHtml,
  matchesMilonga,
  tabsHtml,
  tonightCount,
  type MilongaFilters,
} from '../lib/milonga-html';

const DAY_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

export function initMilongas() {
  const shell = document.querySelector<HTMLElement>('[data-app-shell]');
  const listEl = document.querySelector<HTMLElement>('[data-milonga-list]');
  const tabsEl = document.querySelector<HTMLElement>('[data-milonga-tabs]');
  const emptyEl = document.querySelector<HTMLElement>('[data-milonga-empty]');
  const detailEl = document.querySelector<HTMLElement>('[data-milonga-detail]');
  const regionSel = document.querySelector<HTMLSelectElement>('[data-milonga-region]');
  const citySel = document.querySelector<HTMLSelectElement>('[data-milonga-city]');
  const dataEl = document.querySelector<HTMLScriptElement>('[data-milonga-data]');
  const searches = [...document.querySelectorAll<HTMLInputElement>('[data-search-input]')];
  const backdrop = document.querySelector<HTMLElement>('[data-detail-backdrop]');
  const panel = document.querySelector<HTMLElement>('.app-detail');
  if (!shell || !listEl || !regionSel || !citySel) {
    return;
  }
  const locale = (shell.dataset.locale as Locale) || 'en';
  const copy = ui[locale];

  let items: Milonga[] = [];
  try {
    items = dataEl?.textContent ? ((JSON.parse(dataEl.textContent) as Milonga[]) ?? []) : [];
  } catch {
    items = [];
  }
  let selected: string | null = null;
  let filters = readUrl();
  let cityColors = new Map<string, string>();

  function readUrl(): MilongaFilters {
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
      filters.day ? weekdaysShort[locale][DAY_INDEX[filters.day]!] : '',
      filters.type ? (filters.type === 'practica' ? copy.milongaTypePractica : copy.milongaTypeMilonga) : '',
      filters.q,
    ].filter(Boolean);
    el.innerHTML = parts.length
      ? parts.map((part) => `<span class="is-chip">${escapeHtml(part)}</span>`).join('')
      : '';
  }

  function renderCounts() {
    const total = items.filter((item) => item.region === filters.region).length;
    const tonight = tonightCount(items, filters.region);
    const totalEl = document.querySelector<HTMLElement>('[data-milonga-total]');
    const tonightEl = document.querySelector<HTMLElement>('[data-milonga-tonight]');
    if (totalEl) totalEl.textContent = String(total);
    if (tonightEl) tonightEl.textContent = String(tonight);
  }

  function fillCities() {
    const cities = citiesForRegion(items, filters.region);
    if (filters.city && !cities.includes(filters.city)) filters.city = '';
    citySel!.innerHTML =
      `<option value="">${copy.filterAll}</option>` +
      cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join('');
    citySel!.value = filters.city;
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
    if (tabsEl) tabsEl.innerHTML = tabsHtml(items, filters, locale, copy);
  }

  function renderList() {
    cityColors = cityColorsFor(items, filters.region);
    listEl!.innerHTML = listHtml(items, filters, locale, copy, cityColors, selected);
    if (emptyEl) emptyEl.hidden = items.some((item) => matchesMilonga(item, filters));
  }

  function renderDetail() {
    if (!detailEl) return;
    const item = items.find((row) => row.id === selected) ?? null;
    detailEl.innerHTML = detailHtml(item, locale, copy);
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
    selected = null;
    renderDetail();
  }

  function fullRender() {
    fillCities();
    syncRail();
    renderTabs();
    renderList();
    renderDetail();
    renderCounts();
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

  fullRender();
}
