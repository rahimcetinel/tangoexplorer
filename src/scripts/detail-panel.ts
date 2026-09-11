const NEWS_RE = /\/(news|haber)\//;

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function demoteHeadings(root: Element) {
  root.querySelectorAll('h1').forEach((heading) => {
    const next = document.createElement('h2');
    next.className = heading.className;
    next.replaceChildren(...heading.childNodes);
    heading.replaceWith(next);
  });
}

export function initDetailPanel() {
  const shell = document.querySelector<HTMLElement>('[data-app-shell]');
  const panel = document.querySelector<HTMLElement>('[data-detail-panel]');
  const frame = document.querySelector<HTMLElement>('[data-article-frame]');
  const backdrop = document.querySelector<HTMLElement>('[data-detail-backdrop]');
  if (!shell || !panel || !frame || shell.dataset.mode !== 'home') {
    return;
  }

  const homePath = shell.dataset.homePath || '/';
  let lastTrigger: HTMLElement | null = null;

  function setSelected(url: string | null) {
    const path = url ? new URL(url, window.location.origin).pathname : '';
    document.querySelectorAll<HTMLElement>('[data-detail-link]').forEach((link) => {
      const href = link.getAttribute('href');
      const on = Boolean(href && path && new URL(href, window.location.origin).pathname === path);
      link.closest('[data-card]')?.classList.toggle('is-selected', on);
      if (on) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function setOpen(open: boolean) {
    panel!.classList.toggle('is-open', open);
    panel!.setAttribute('aria-hidden', String(!open));
    backdrop?.toggleAttribute('hidden', !open);
    document.body.classList.toggle('detail-open', open);
  }

  const skeleton = panel.querySelector<HTMLElement>('[data-detail-skeleton]');
  const errorBox = panel.querySelector<HTMLElement>('[data-detail-error]');
  const errorLink = panel.querySelector<HTMLAnchorElement>('[data-detail-error-link]');

  async function open(url: string, push: boolean) {
    panel!.setAttribute('aria-busy', 'true');
    skeleton?.removeAttribute('hidden');
    errorBox?.setAttribute('hidden', '');
    frame!.hidden = true;
    try {
      const response = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const article = doc.querySelector('[data-article]');
      if (!article) {
        throw new Error('missing article');
      }
      const imported = document.importNode(article, true);
      demoteHeadings(imported);
      frame!.replaceChildren(imported);
      frame!.hidden = false;
      skeleton?.setAttribute('hidden', '');
      setOpen(true);
      setSelected(url);
      if (push) {
        history.pushState({ detail: url }, '', url);
      }
      const focusTarget =
        panel!.querySelector<HTMLElement>('[data-detail-close]') ??
        imported.querySelector<HTMLElement>('h1, h2');
      focusTarget?.focus();
    } catch {
      skeleton?.setAttribute('hidden', '');
      if (errorLink) {
        errorLink.href = url;
      }
      errorBox?.removeAttribute('hidden');
      setOpen(true);
    } finally {
      panel!.removeAttribute('aria-busy');
    }
  }

  function close(push: boolean) {
    setOpen(false);
    setSelected(null);
    if (push) {
      const query = window.location.search;
      const next = `${homePath}${query}`;
      history.pushState({ detail: null }, '', next);
    }
    lastTrigger?.focus();
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-detail-close]') || target.closest('[data-detail-backdrop]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(true);
        return;
      }
      const link = target.closest<HTMLAnchorElement>('a[data-detail-link]');
      if (!link || isModifiedClick(event as MouseEvent)) {
        return;
      }
      if (link.origin !== window.location.origin || !NEWS_RE.test(link.pathname)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      lastTrigger = link;
      void open(link.href, true);
    },
    true,
  );

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (panel!.classList.contains('is-open') || NEWS_RE.test(window.location.pathname))) {
      close(true);
    }
  });

  window.addEventListener('popstate', () => {
    if (NEWS_RE.test(window.location.pathname)) {
      void open(window.location.href, false);
      return;
    }
    close(false);
  });

  if (NEWS_RE.test(window.location.pathname)) {
    setOpen(true);
    setSelected(window.location.href);
  } else {
    const selected = document.querySelector<HTMLElement>('[data-card].is-selected a[data-detail-link]');
    if (selected) {
      setSelected(selected.href);
    }
  }
}
