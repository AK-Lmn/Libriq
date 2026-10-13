const TOP_ROUTES = new Set();

export function applyNavigationChrome(route, root = document) {
  root.body?.setAttribute?.('data-route', route);
  const top = TOP_ROUTES.has(route) && (globalThis.matchMedia?.('(min-width: 769px)').matches ?? false);
  root.body?.setAttribute?.('data-navigation', top ? 'top' : 'side');
  root.querySelectorAll('.nav-hub').forEach(hub => {
    if (top) hub.setAttribute('name', 'navigation-hub');
    else hub.removeAttribute('name');
    hub.open = !top;
    hub.classList.toggle('current-hub', Boolean(hub.querySelector(`[data-page="${route}"]`)));
  });
  const sidebar = root.getElementById?.('sidebar');
  if (sidebar) {
    const mobile = globalThis.matchMedia?.('(max-width: 768px)').matches ?? false;
    if (!mobile && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      root.getElementById?.('sidebarOverlay')?.classList.remove('visible');
      root.body.style.overflow = '';
    }
    const hidden = mobile && !sidebar.classList.contains('open');
    if (hidden && sidebar.contains?.(root.activeElement)) root.getElementById?.('mobileMenuBtn')?.focus();
    sidebar.inert = hidden;
    sidebar.setAttribute('aria-hidden', String(hidden));
  }
}

export function initializeNavigationChrome(getRoute, root = document) {
  const hubs = [...root.querySelectorAll('.nav-hub')];
  const isTop = () => root.body?.getAttribute?.('data-navigation') === 'top';
  const close = () => { if (isTop()) hubs.forEach(hub => { hub.open = false; }); };
  hubs.forEach(hub => hub.addEventListener('toggle', () => {
    if (isTop() && hub.open) hubs.filter(other => other !== hub).forEach(other => { other.open = false; });
  }));
  root.addEventListener('click', event => {
    if (!event.target.closest('.nav-hub')) close();
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isTop()) return;
    const active = hubs.find(hub => hub.open);
    if (active) {
      close();
      active.querySelector('summary')?.focus();
      event.preventDefault();
    }
  });
  globalThis.matchMedia?.('(min-width: 769px)').addEventListener?.('change', () => applyNavigationChrome(getRoute(), root));
  applyNavigationChrome(getRoute(), root);
}
