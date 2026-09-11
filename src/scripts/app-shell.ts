import { initDetailPanel } from './detail-panel';

type Filters = { kind: string; country: string; q: string };

function emptyFilters(): Filters {
  return { kind: '', country: '', q: '' };
}

function readUrl(): Filters {
  const params = new URLSearchParams(window.location.search);
  return {
    kind: params.get('kind') ?? '',
    country: params.get('country') ?? '',
    q: params.get('q') ?? '',
  };
}

function writeUrl(filters: Filters) {
  const params = new URLSearchParams();
  for (const key of ['kind', 'country', 'q'] as const) {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  }
  const query = params.toString();
  const path = window.location.pathname;
  const next = query ? `${path}?${query}` : path;
  window.history.replaceState(history.state ?? {}, '', next);
}

function matches(card: HTMLElement, filters: Filters): boolean {
  const kinds = (card.dataset.kinds || '').split(',').filter(Boolean);
  if (filters.kind && !kinds.includes(filters.kind)) {
    return false;
  }
  if (filters.country && card.dataset.country !== filters.country) {
    return false;
  }
  if (filters.q) {
    const haystack = (card.dataset.search || '').toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) {
      return false;
    }
  }
  return true;
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
    col.querySelectorAll('[data-card]').forEach((card) => card.remove());
    const imported = document.importNode(incoming, true);
    col.append(...imported.children);
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
    { root: board, rootMargin: '280px', threshold: 0.01 },
  );
  lazy.forEach((col) => observer.observe(col));
}

function initJumpTo() {
  const board = document.querySelector<HTMLElement>('[data-board]');
  const ribbon = document.querySelector<HTMLElement>('[data-month-ribbon]');
  if (!board || !ribbon) {
    return;
  }

  function setActive(key: string) {
    ribbon!.querySelectorAll<HTMLElement>('[data-month]').forEach((chip) => {
      const on = chip.dataset.month === key;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
  }

  ribbon.addEventListener('click', (event) => {
    const chip = (event.target as Element | null)?.closest<HTMLAnchorElement>('[data-month]');
    if (!chip) {
      return;
    }
    const col = document.getElementById(`col-${chip.dataset.month}`);
    if (!col) {
      return;
    }
    event.preventDefault();
    void hydrateColumn(col);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    board.scrollTo({ left: col.offsetLeft - 16, behavior: reduce ? 'auto' : 'smooth' });
    setActive(chip.dataset.month || '');
  });

  board.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      board.scrollBy({ left: 268, behavior: 'smooth' });
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      board.scrollBy({ left: -268, behavior: 'smooth' });
    }
  });

  const nowKey = board.dataset.nowMonth;
  const nowCol = nowKey ? document.getElementById(`col-${nowKey}`) : null;
  if (nowCol) {
    board.scrollTo({ left: nowCol.offsetLeft - 16 });
    setActive(nowKey!);
  } else {
    const first = ribbon.querySelector<HTMLElement>('[data-month]');
    if (first?.dataset.month) {
      setActive(first.dataset.month);
    }
  }
}

function initFilters() {
  const shell = document.querySelector<HTMLElement>('[data-app-shell]');
  if (!shell || shell.dataset.mode !== 'home') {
    return;
  }

  const columns = [...document.querySelectorAll<HTMLElement>('[data-month-col]')];
  const chips = [...document.querySelectorAll<HTMLElement>('[data-filter-chip]')];
  const empty = document.querySelector<HTMLElement>('[data-filter-empty]');
  const countEls = [...document.querySelectorAll<HTMLElement>('[data-filter-count]')];
  const search = document.querySelector<HTMLInputElement>('[data-search-input]');
  const clearButtons = [...document.querySelectorAll<HTMLElement>('[data-filter-clear]')];
  let filters = readUrl();

  function cards(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[data-card]')];
  }

  function syncChips() {
    chips.forEach((chip) => {
      const key = chip.dataset.filterChip as 'kind' | 'country';
      const value = chip.dataset.value || '';
      const on = filters[key] === value && Boolean(value);
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    if (search) {
      search.value = filters.q;
    }
  }

  function apply() {
    let visible = 0;
    for (const card of cards()) {
      const show = matches(card, filters);
      card.hidden = !show;
      if (show) {
        visible += 1;
      }
    }
    for (const col of columns) {
      const any = [...col.querySelectorAll<HTMLElement>('[data-card]')].some((card) => !card.hidden);
      col.hidden = !any;
      const count = [...col.querySelectorAll<HTMLElement>('[data-card]')].filter((card) => !card.hidden).length;
      const badge = col.querySelector('[data-col-count]');
      if (badge) {
        badge.textContent = String(count);
      }
    }
    document.querySelectorAll<HTMLElement>('[data-month]').forEach((chip) => {
      const col = document.getElementById(`col-${chip.dataset.month}`);
      chip.hidden = Boolean(col?.hidden);
      const count = chip.querySelector('[data-month-count]');
      if (count && col) {
        const n = [...col.querySelectorAll<HTMLElement>('[data-card]')].filter((card) => !card.hidden).length;
        count.textContent = String(n);
      }
    });
    if (empty) {
      empty.hidden = visible > 0;
    }
    const tpl = shell.dataset.i18nCount || '{n}';
    const label = tpl.replace('{n}', String(visible));
    countEls.forEach((el) => {
      el.textContent = label;
    });
    writeUrl(filters);
    syncChips();
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-filter-clear]')) {
      event.preventDefault();
      filters = emptyFilters();
      apply();
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
    apply();
  });

  let searchTimer = 0;
  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      filters.q = search.value.trim();
      apply();
    }, 150);
  });

  clearButtons.forEach(() => undefined);
  document.addEventListener('timeline:hydrated', () => apply());
  syncChips();
  apply();
}

export function initAppShell() {
  initFilters();
  initLazyMonths();
  initJumpTo();
  initDetailPanel();
  initShare();
}
