import { whenWindow } from '../lib/when';

type SearchItem = {
  s: string;
  t: string;
  m: string;
  ml: string;
  c: string;
  k: string;
  kn: string;
  co: string;
  cn: string;
  ci: string;
  w: string;
  st: string;
  en: string;
  q: string;
};

const PAGE_SIZE = 24;

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
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/[’']/g, '')
    .toLowerCase();
}

function scoreItem(item: SearchItem, terms: string[]): number {
  const title = normalize(item.t);
  const place = normalize(`${item.w} ${item.cn}`);
  let score = 0;
  for (const term of terms) {
    if (title.startsWith(term)) {
      score += 6;
    } else if (title.includes(term)) {
      score += 4;
    } else if (place.includes(term)) {
      score += 2;
    } else {
      score += 1;
    }
  }
  return score;
}

function matchesItem(item: SearchItem, terms: string[]): boolean {
  const haystack = normalize(`${item.t} ${item.w} ${item.kn} ${item.cn} ${item.q}`);
  return terms.every((term) => haystack.includes(term));
}

// Distance-1 fallback so "istambul" still finds Istanbul.
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (a.length > b.length) {
      i += 1;
    } else if (b.length > a.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function fuzzyMatches(item: SearchItem, terms: string[]): boolean {
  const words = normalize(`${item.t} ${item.w} ${item.kn} ${item.cn}`)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return terms.every(
    (term) => term.length > 3 && words.some((word) => word.includes(term) || withinOneEdit(word, term)),
  );
}

export function initSearchPage(): void {
  const page = document.querySelector<HTMLElement>('[data-search-page]');
  if (!page) {
    return;
  }

  const form = page.querySelector<HTMLFormElement>('[data-search-form]');
  const input = page.querySelector<HTMLInputElement>('[data-search-input]');
  const results = page.querySelector<HTMLElement>('[data-search-results]');
  const summary = page.querySelector<HTMLElement>('[data-search-summary]');
  const moreButton = page.querySelector<HTMLButtonElement>('[data-search-more]');
  const kindButtons = [...page.querySelectorAll<HTMLButtonElement>('[data-search-kind]')];
  const whenButtons = [...page.querySelectorAll<HTMLButtonElement>('[data-search-when]')];
  if (!input || !results) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  let query = params.get('q') ?? '';
  let kind = params.get('kind') ?? '';
  let when = params.get('when') ?? '';
  let shown = PAGE_SIZE;
  let items: SearchItem[] = [];
  let loaded = false;

  input.value = query;

  function syncChips(): void {
    kindButtons.forEach((button) => {
      const on = button.dataset.searchKind === kind;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });
    whenButtons.forEach((button) => {
      const on = button.dataset.searchWhen === when;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  function syncUrl(): void {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (kind) next.set('kind', kind);
    if (when) next.set('when', when);
    const qs = next.toString();
    window.history.replaceState({}, '', qs ? `/search?${qs}` : '/search');
  }

  function renderEmpty(): void {
    const copy = page!.dataset;
    results!.innerHTML =
      `<div class="app-search-empty">` +
      `<p class="app-search-empty-title">${escapeHtml(copy.i18nEmptyTitle ?? 'No matches')}</p>` +
      `<p class="app-search-empty-lead">${escapeHtml(copy.i18nEmptyLead ?? '')}</p>` +
      `</div>`;
  }

  function render(): void {
    if (!results || !summary) {
      return;
    }
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const filterWindow = whenWindow(when);

    if (!terms.length && !kind && !when) {
      summary.textContent = '';
      results.innerHTML =
        `<p class="app-search-hint">${escapeHtml(page!.dataset.i18nHint ?? '')}</p>`;
      if (moreButton) moreButton.hidden = true;
      return;
    }

    let found = items.filter((item) => {
      if (kind && !item.k.split(',').includes(kind)) return false;
      if (filterWindow) {
        const start = item.st || item.en;
        const end = item.en || item.st;
        if (!start) return false;
        if (end < filterWindow.from || start > filterWindow.to) return false;
      }
      return terms.length ? matchesItem(item, terms) : true;
    });

    let fuzzy = false;
    if (!found.length && terms.length) {
      found = items.filter((item) => {
        if (kind && !item.k.split(',').includes(kind)) return false;
        if (filterWindow) {
          const start = item.st || item.en;
          const end = item.en || item.st;
          if (!start) return false;
          if (end < filterWindow.from || start > filterWindow.to) return false;
        }
        return fuzzyMatches(item, terms);
      });
      fuzzy = found.length > 0;
    }

    found = found.sort((a, b) => {
      const byDate = (a.st || '9999').localeCompare(b.st || '9999');
      if (byDate !== 0) return byDate;
      const byScore = terms.length ? scoreItem(b, terms) - scoreItem(a, terms) : 0;
      return byScore || a.t.localeCompare(b.t);
    });

    const countLabel = page!.dataset.i18nResults ?? '{n}';
    const label = countLabel.replace('{n}', String(found.length));
    const closeLabel = page!.dataset.i18nClose ?? '';
    summary.textContent = `${query ? `${label} for “${query}”` : label}${fuzzy && closeLabel ? ` · ${closeLabel}` : ''}`;

    if (!found.length) {
      renderEmpty();
      if (moreButton) moreButton.hidden = true;
      return;
    }

    const visible = found.slice(0, shown);
    const groups = new Map<string, { label: string; items: SearchItem[] }>();
    for (const item of visible) {
      const group = groups.get(item.m);
      if (group) {
        group.items.push(item);
      } else {
        groups.set(item.m, { label: item.ml, items: [item] });
      }
    }

    results.innerHTML = [...groups.values()]
      .map(
        (group) =>
          `<section class="app-search-group">` +
          `<h2 class="app-search-month">${escapeHtml(group.label)}</h2>` +
          `<ul class="app-search-list">` +
          group.items
            .map(
              (item) =>
                `<li data-card><a class="app-search-result" href="/news/${escapeHtml(item.s)}" data-detail-link>` +
                `<span class="app-search-title">${escapeHtml(item.t)}</span>` +
                `<span class="app-search-meta">` +
                [item.kn, item.w].filter(Boolean).map((part) => escapeHtml(part)).join(' · ') +
                `</span></a></li>`,
            )
            .join('') +
          `</ul></section>`,
      )
      .join('');

    if (moreButton) {
      moreButton.hidden = found.length <= shown;
      moreButton.textContent = (page!.dataset.i18nMore ?? 'Load more') + ` (${found.length - shown})`;
    }
  }

  async function load(): Promise<void> {
    if (loaded) return;
    try {
      const response = await fetch('/search-index.json', { headers: { Accept: 'application/json' } });
      items = response.ok ? ((await response.json()) as SearchItem[]) : [];
    } catch {
      items = [];
    }
    loaded = true;
    render();
  }

  function update(): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      query = input!.value.trim();
      shown = PAGE_SIZE;
      syncUrl();
      syncChips();
      void load().then(render);
    }, 120);
  }

  let timer = 0;

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(timer);
    query = input.value.trim();
    shown = PAGE_SIZE;
    syncUrl();
    void load().then(render);
  });

  input.addEventListener('input', update);

  kindButtons.forEach((button) => {
    button.addEventListener('click', () => {
      kind = button.dataset.searchKind || '';
      shown = PAGE_SIZE;
      syncChips();
      syncUrl();
      void load().then(render);
    });
  });

  whenButtons.forEach((button) => {
    button.addEventListener('click', () => {
      when = button.dataset.searchWhen || '';
      shown = PAGE_SIZE;
      syncChips();
      syncUrl();
      void load().then(render);
    });
  });

  moreButton?.addEventListener('click', () => {
    shown += PAGE_SIZE;
    render();
  });

  if (query || kind || when) {
    void load();
  } else {
    render();
  }
  syncChips();
}
