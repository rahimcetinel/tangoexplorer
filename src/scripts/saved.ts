const STORAGE_KEY = 'te-saved';

function read(): string[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Private mode: the buttons still toggle for this page view.
  }
  document.dispatchEvent(new CustomEvent('saved:change', { detail: list }));
}

export function savedSlugs(): string[] {
  return read();
}

function syncButtons(): void {
  const saved = new Set(read());
  document.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((button) => {
    const slug = button.dataset.save || '';
    const on = saved.has(slug);
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('is-saved', on);
    const label = button.querySelector<HTMLElement>('[data-save-label]');
    if (label) label.textContent = on ? 'Saved' : 'Save';
    const icon = button.querySelector<HTMLElement>('[data-save-icon]');
    if (icon) icon.textContent = on ? '★' : '☆';
  });
  document.querySelectorAll<HTMLElement>('[data-saved-count]').forEach((el) => {
    el.textContent = String(saved.size);
  });
}

export function initSaved(): void {
  syncButtons();

  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-save]');
    if (!button) return;
    event.preventDefault();
    const slug = button.dataset.save || '';
    if (!slug) return;
    const saved = read();
    const next = saved.includes(slug) ? saved.filter((item) => item !== slug) : [...saved, slug];
    write(next);
    syncButtons();
  });

  document.addEventListener('saved:change', syncButtons);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) syncButtons();
  });
}

type SavedItem = { s: string; t: string; st?: string; en?: string; w?: string; kn?: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function shortRange(start?: string, end?: string): string {
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

function icsFor(items: SavedItem[]): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const ymd = (value: Date) =>
    `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}`;
  const nextDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + 1));
  const escape = (value: string) =>
    value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TangoExplorer//Saved//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:TangoExplorer — saved events',
  ];
  for (const item of items) {
    if (!item.st) continue;
    const start = new Date(`${item.st}T00:00:00Z`);
    const end = new Date(`${item.en || item.st}T00:00:00Z`);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.s}@tangoexplorer.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(end))}`,
      `SUMMARY:${escape(item.t)}`,
      item.w ? `LOCATION:${escape(item.w)}` : '',
      `URL:https://tangoexplorer.com/news/${item.s}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

export async function initSavedPage(): Promise<void> {
  const page = document.querySelector<HTMLElement>('[data-saved-page]');
  if (!page) return;
  const list = page.querySelector<HTMLElement>('[data-saved-list]');
  const empty = page.querySelector<HTMLElement>('[data-saved-empty]');
  const download = page.querySelector<HTMLAnchorElement>('[data-saved-ics]');
  if (!list || !empty) return;

  let index: SavedItem[] = [];
  try {
    const response = await fetch('/search-index.json', { headers: { Accept: 'application/json' } });
    index = response.ok ? ((await response.json()) as SavedItem[]) : [];
  } catch {
    index = [];
  }

  function render(): void {
    const saved = savedSlugs();
    const items = saved
      .map((slug) => index.find((item) => item.s === slug))
      .filter((item): item is SavedItem => Boolean(item));

    empty.hidden = items.length > 0;
    list.innerHTML = items
      .map(
        (item) =>
          `<li class="app-saved-item">` +
          `<a class="app-saved-link" href="/news/${escapeHtml(item.s)}">${escapeHtml(item.t)}</a>` +
          `<span class="app-saved-meta">${escapeHtml(shortRange(item.st, item.en))}${
            item.w ? ` · ${escapeHtml(item.w)}` : ''
          }</span>` +
          `<button type="button" class="app-saved-remove" data-unsave="${escapeHtml(item.s)}">Remove</button>` +
          `</li>`,
      )
      .join('');

    if (download) {
      download.hidden = items.length === 0;
      download.href = items.length
        ? `data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(items))}`
        : '#';
    }
    const count = page!.querySelector<HTMLElement>('[data-saved-total]');
    if (count) count.textContent = String(items.length);
  }

  list.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-unsave]');
    if (!button) return;
    event.preventDefault();
    const slug = button.dataset.unsave || '';
    write(read().filter((item) => item !== slug));
    render();
  });

  document.addEventListener('saved:change', render);
  render();
}
