import { initDetailPanel } from './detail-panel';

type DetailApi = { open: (url: string, push: boolean, focus?: boolean) => void } | null;

type Filters = { kind: string; country: string; city: string; q: string };

type IndexItem = {
  s: string;
  t: string;
  m: string;
  ml: string;
  c: string;
  k: string;
  co: string;
  ci: string;
  w: string;
  q: string;
};

const KEYS = ['kind', 'country', 'city', 'q'] as const;

function emptyFilters(): Filters {
  return { kind: '', country: '', city: '', q: '' };
}

function readUrl(): Filters {
  const params = new URLSearchParams(window.location.search);
  return {
    kind: params.get('kind') ?? '',
    country: params.get('country') ?? '',
    city: params.get('city') ?? '',
    q: params.get('q') ?? '',
  };
}

function writeUrl(filters: Filters, basePath: string) {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  }
  const query = params.toString();
  const next = query ? `${basePath}?${query}` : basePath;
  window.history.replaceState(history.state ?? {}, '', next);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function initShare() {
  document.addEventListener('click', async (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-share]');
    if (!button) {
      return;
    }
    event.preventDefault();
    const url = button.dataset.shareUrl || window.location.href;
    const title = button.dataset.shareTitle || document.title;
    const copied = button.dataset.copied || 'Link copied';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      /* user cancelled or share failed; fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      const original = button.textContent;
      button.textContent = copied;
      window.setTimeout(() => {
        button.textContent = original;
      }, 1600);
    } catch {
      window.prompt(button.dataset.copyLabel || 'Copy link', url);
    }
  });
}

async function hydrateColumn(col: HTMLElement) {
  if (col.dataset.lazy !== 'true') {
    return;
  }
  const url = col.dataset.fragment;
  if (!url) {
    return;
  }
  const board = col.closest<HTMLElement>('[data-board]');
  const boardCategory = board?.dataset.boardCategory || '';
  const boardRegion = board?.dataset.boardRegion || '';
  col.dataset.lazy = 'loading';
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html' } });
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const incoming = doc.querySelector('[data-month-cards]');
    if (!incoming) {
      throw new Error('missing cards');
    }
    const target = col.querySelector<HTMLElement>('[data-month-grid]') ?? col;
    target.querySelectorAll('[data-card], [data-col-placeholder], .app-card-skeleton').forEach((node) => node.remove());
    const imported = document.importNode(incoming, true);
    if (boardCategory) {
      imported.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {
        if (card.dataset.category !== boardCategory) {
          card.remove();
        }
      });
    }
    if (boardRegion) {
      imported.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {
        if (card.dataset.region !== boardRegion) {
          card.remove();
        }
      });
    }
    target.append(...imported.children);
    col.dataset.lazy = 'ready';
    document.dispatchEvent(new Event('timeline:hydrated'));
  } catch {
    col.dataset.lazy = 'true';
  }
}

function initLazyMonths() {
  const board = document.querySelector<HTMLElement>('[data-board]');
  if (!board) {
    return;
  }
  const lazy = [...board.querySelectorAll<HTMLElement>('[data-month-col][data-lazy="true"]')];
  if (!lazy.length) {
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const col = entry.target as HTMLElement;
        observer.unobserve(col);
        void hydrateColumn(col);
      }
    },
    { root: board, rootMargin: '480px', threshold: 0.01 },
  );
  lazy.forEach((col) => observer.observe(col));
}

function initJumpTo() {
  const board = document.querySelector<HTMLElement>('[data-board]');
  const ribbon = document.querySelector<HTMLElement>('[data-month-ribbon]');
  if (!board || !ribbon) {
    return;
  }
  let activeMonth = '';

  function setActive(key: string) {
    activeMonth = key;
    ribbon!.querySelectorAll<HTMLElement>('[data-month]').forEach((chip) => {
      const on = chip.dataset.month === key;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    board!.dataset.view = key ? 'single' : 'all';
    board!.querySelectorAll<HTMLElement>('[data-month-col]').forEach((col) => {
      col.classList.toggle('is-month-active', col.dataset.month === key);
    });
    if (key) {
      board!.scrollTo({ top: 0 });
    }
  }

  ribbon.addEventListener('click', (event) => {
    const chip = (event.target as Element | null)?.closest<HTMLElement>('[data-month]');
    if (!chip) {
      return;
    }
    event.preventDefault();
    const key = chip.dataset.month || '';
    if (key === activeMonth) {
      setActive('');
      return;
    }
    const col = document.getElementById(`col-${key}`);
    if (!col) {
      return;
    }
    if (col.dataset.lazy === 'true') {
      void hydrateColumn(col).then(() => setActive(key));
      return;
    }
    setActive(key);
  });

  board.addEventListener('keydown', (event) => {
    if (board.dataset.view === 'single') {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      board.scrollBy({ top: 320, behavior: 'smooth' });
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      board.scrollBy({ top: -320, behavior: 'smooth' });
    }
  });

  setActive('');
  const nowKey = board.dataset.nowMonth;
  const nowCol = nowKey ? document.getElementById(`col-${nowKey}`) : null;
  if (nowCol) {
    board.scrollTo({ top: nowCol.offsetTop - 8 });
  }
}

function initFilters(detail: DetailApi) {
  const shell = document.querySelector<HTMLElement>('[data-app-shell]');
  const boardMode = shell?.dataset.mode === 'home' || shell?.dataset.mode === 'category';
  if (!shell || !boardMode) {
    return;
  }

  const board = document.querySelector<HTMLElement>('[data-board]');
  const viewport = document.querySelector<HTMLElement>('.app-viewport');
  const ribbon = document.querySelector<HTMLElement>('[data-month-ribbon]');
  const results = document.querySelector<HTMLElement>('[data-results]');
  const emptyEl = document.querySelector<HTMLElement>('[data-filter-empty]');
  const searches = [...document.querySelectorAll<HTMLInputElement>('[data-search-input]')];
  const chips = [...document.querySelectorAll<HTMLElement>('[data-filter-chip]')];
  const selects = [...document.querySelectorAll<HTMLSelectElement>('[data-filter-select]')];
  const cityMapEl = document.querySelector<HTMLElement>('[data-city-map]');
  const cityMap = cityMapEl ? (JSON.parse(cityMapEl.dataset.cityMap || '{}') as Record<string, string[]>) : {};
  const allCities = [...new Set(Object.values(cityMap).flat())].sort((a, b) => a.localeCompare(b, 'en'));
  const allLabel = cityMapEl?.dataset.i18nAll || 'All';
  const locale = shell.dataset.locale || 'en';
  const boardCategory = board?.dataset.boardCategory || '';
  const emptyText = emptyEl?.textContent?.trim() || 'No results';
  const newsBase = locale === 'tr' ? '/tr/haber/' : '/news/';
  let filters = readUrl();
  let index: IndexItem[] = [];
  let indexPromise: Promise<IndexItem[]> | null = null;

  function loadIndex(): Promise<IndexItem[]> {
    if (!indexPromise) {
      indexPromise = fetch(`/search-index/${locale}.json`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
        .then((response) => (response.ok ? response.json() : []))
        .then((data: unknown) => {
          index = Array.isArray(data) ? (data as IndexItem[]) : [];
          return index;
        })
        .catch(() => {
          index = [];
          return index;
        });
    }
    return indexPromise;
  }

  function fillCityOptions() {
    const citySelect = selects.find((select) => select.dataset.filterSelect === 'city');
    if (!citySelect) {
      return;
    }
    const list = filters.country ? (cityMap[filters.country] ?? []) : allCities;
    citySelect.innerHTML =
      `<option value="">${allLabel}</option>` +
      list.map((city) => `<option value="${city}">${city}</option>`).join('');
    if (filters.city && list.includes(filters.city)) {
      citySelect.value = filters.city;
    } else {
      filters.city = '';
      citySelect.value = '';
    }
  }

  function syncControls() {
    chips.forEach((chip) => {
      const key = chip.dataset.filterChip as 'kind' | 'country' | 'city';
      const value = chip.dataset.value || '';
      const on = filters[key] === value && Boolean(value);
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    selects.forEach((select) => {
      const key = select.dataset.filterSelect as 'country' | 'city';
      if (key !== 'city') {
        select.value = filters[key];
      }
    });
    fillCityOptions();
    searches.forEach((input) => {
      input.value = filters.q;
    });
  }

  function isActive(): boolean {
    return Boolean(filters.kind || filters.country || filters.city || filters.q);
  }

  function renderSummary() {
    const el = document.querySelector<HTMLElement>('[data-menu-summary]');
    if (!el) {
      return;
    }
    const parts = [filters.kind, filters.country, filters.city, filters.q].filter(Boolean);
    el.innerHTML = parts.length
      ? parts.map((part) => `<span class="is-chip">${escapeHtml(part)}</span>`).join('')
      : '';
  }

  function setMode(searching: boolean) {
    if (viewport) {
      viewport.hidden = searching;
    }
    if (ribbon) {
      ribbon.hidden = searching;
    }
    if (results) {
      results.hidden = !searching;
    }
    if (emptyEl) {
      emptyEl.hidden = true;
    }
  }

  function renderResults(): IndexItem[] {
    if (!results) {
      return [];
    }
    const query = filters.q.toLowerCase();
    const items = index.filter((item) => {
      if (boardCategory && item.c !== boardCategory) {
        return false;
      }
      if (filters.kind && !item.k.split(',').includes(filters.kind)) {
        return false;
      }
      if (filters.country && item.co !== filters.country) {
        return false;
      }
      if (filters.city && item.ci !== filters.city) {
        return false;
      }
      if (query && !item.q.includes(query)) {
        return false;
      }
      return true;
    });
    if (!items.length) {
      results.innerHTML = `<p class="app-empty">${escapeHtml(emptyText)}</p>`;
      return items;
    }
    const tpl = shell!.dataset.i18nCount || '{n}';
    const countLabel = tpl.replace('{n}', String(items.length));
    results.innerHTML =
      `<p class="app-results-count">${escapeHtml(countLabel)}</p>` +
      items
        .slice(0, 80)
        .map(
          (item) =>
            `<button type="button" class="app-result" data-result data-month="${item.m}" data-href="${newsBase}${item.s}">` +
            `<span class="app-result-month">${escapeHtml(item.ml)}</span>` +
            `<span class="app-result-title">${escapeHtml(item.t)}</span>` +
            (item.w ? `<span class="app-result-where">${escapeHtml(item.w)}</span>` : '') +
            `</button>`,
        )
        .join('');
    return items;
  }

  async function apply(options: { preview?: boolean } = {}) {
    writeUrl(filters, shell!.dataset.closePath || window.location.pathname);
    syncControls();
    renderSummary();
    if (!isActive()) {
      setMode(false);
      return;
    }
    setMode(true);
    if (results) {
      results.innerHTML =
        '<div class="app-results-skeleton"><div class="app-card-skeleton"></div><div class="app-card-skeleton"></div><div class="app-card-skeleton"></div></div>';
    }
    await loadIndex();
    const items = renderResults();
    if (options.preview && items.length && !window.matchMedia('(max-width: 1279px)').matches) {
      detail?.open(`${newsBase}${items[0]!.s}`, false, false);
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-filter-clear]')) {
      event.preventDefault();
      filters = emptyFilters();
      void apply({ preview: true });
      return;
    }
    const result = target.closest<HTMLElement>('[data-result]');
    if (result) {
      event.preventDefault();
      const href = result.dataset.href || '';
      results
        ?.querySelectorAll<HTMLElement>('[data-result]')
        .forEach((el) => el.classList.toggle('is-active', el === result));
      if (href) {
        detail?.open(href, true);
      }
      return;
    }
    const chip = target.closest<HTMLElement>('[data-filter-chip]');
    if (!chip) {
      return;
    }
    event.preventDefault();
    const key = chip.dataset.filterChip as 'kind' | 'country';
    const value = chip.dataset.value || '';
    filters[key] = filters[key] === value ? '' : value;
    void apply({ preview: true });
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.dataset.filterSelect) {
      return;
    }
    const key = target.dataset.filterSelect as 'country' | 'city';
    filters[key] = target.value;
    if (key === 'country') {
      filters.city = '';
    }
    syncControls();
    void apply({ preview: true });
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
        void apply();
      }, 150);
    });
  });

  syncControls();
  void apply({ preview: true });
}

export function initAppShell() {
  const detail = initDetailPanel();
  initFilters(detail);
  initLazyMonths();
  initJumpTo();
  initShare();
}
