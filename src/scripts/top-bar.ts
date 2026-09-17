export function initTopBar() {
  const head = document.querySelector<HTMLElement>('[data-app-head]');
  const toggle = document.querySelector<HTMLElement>('[data-menu-toggle]');
  const panel = document.querySelector<HTMLElement>('[data-menu-panel]');
  const backdrop = document.querySelector<HTMLElement>('[data-menu-backdrop]');
  if (!toggle || !panel) {
    return;
  }

  function setHeadHeight() {
    if (head) {
      document.documentElement.style.setProperty('--head-h', `${head.offsetHeight}px`);
    }
  }

  function setOpen(open: boolean) {
    panel!.hidden = !open;
    toggle!.setAttribute('aria-expanded', String(open));
    toggle!.classList.toggle('is-open', open);
    backdrop?.toggleAttribute('hidden', !open);
    document.body.classList.toggle('menu-open', open);
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  backdrop?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });

  const mq = window.matchMedia('(max-width: 859px)');
  function applyAccordions() {
    document.querySelectorAll<HTMLElement>('[data-acc]').forEach((acc) => {
      const accHead = acc.querySelector<HTMLElement>('[data-acc-head]');
      const body = acc.querySelector<HTMLElement>('[data-acc-body]');
      if (!accHead || !body) {
        return;
      }
      const open = !mq.matches;
      body.hidden = !open;
      accHead.setAttribute('aria-expanded', String(open));
      acc.classList.toggle('is-open', open);
    });
  }
  document.querySelectorAll<HTMLElement>('[data-acc-head]').forEach((accHead) => {
    accHead.addEventListener('click', () => {
      const acc = accHead.closest<HTMLElement>('[data-acc]');
      const body = acc?.querySelector<HTMLElement>('[data-acc-body]');
      if (!body) {
        return;
      }
      const open = body.hidden;
      body.hidden = !open;
      accHead.setAttribute('aria-expanded', String(open));
      acc?.classList.toggle('is-open', open);
    });
  });

  mq.addEventListener('change', applyAccordions);
  applyAccordions();

  setHeadHeight();
  window.addEventListener('resize', setHeadHeight);
  window.addEventListener('load', setHeadHeight);
  if (typeof ResizeObserver !== 'undefined' && head) {
    new ResizeObserver(setHeadHeight).observe(head);
  }
}
