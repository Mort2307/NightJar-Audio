const scrollRootToTop = () => {
  const root = document.scrollingElement;
  if (root) {
    root.scrollTop = 0;
    root.scrollLeft = 0;
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
};

export const scrollNightjarToTop = () => {
  scrollRootToTop();
  window.requestAnimationFrame(() => {
    scrollRootToTop();
    window.requestAnimationFrame(scrollRootToTop);
  });
};

const isNightjarNavigationControl = (target: Element) => {
  const interactive = target.closest('a,button,[role="tab"]');
  if (!interactive) return false;

  if (interactive instanceof HTMLButtonElement && interactive.disabled) return false;
  if (interactive.getAttribute('aria-disabled') === 'true') return false;

  const anchor = interactive instanceof HTMLAnchorElement ? interactive : null;
  if (anchor) {
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) return false;
    } catch {
      return false;
    }
  }

  if (interactive.getAttribute('role') === 'tab') return true;
  if (interactive.hasAttribute('aria-selected')) return true;
  if (interactive.hasAttribute('data-nightjar-scroll-top')) return true;

  return Boolean(interactive.closest(
    'nav,[role="tablist"],[class*="-tabs"],[class^="tabs"],[class*=" tabs"],[class*="-subnav"],[class*="-navigation"]',
  ));
};

let installed = false;

export const installNightjarScrollPolicy = () => {
  if (installed) return () => {};
  installed = true;

  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

  const onNavigationClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element) || !isNightjarNavigationControl(target)) return;
    scrollNightjarToTop();
  };

  document.addEventListener('click', onNavigationClick, true);

  return () => {
    document.removeEventListener('click', onNavigationClick, true);
    installed = false;
  };
};
