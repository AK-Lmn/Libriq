// Per-route chrome around the page: body[data-route] for route-specific
// styles, the sidebar's nav hubs kept open, and on phones the sidebar hidden
// from focus and screen readers unless the menu is open.
export function applyNavigationChrome(route, root = document) {
  root.body?.setAttribute?.('data-route', route);
  root.querySelectorAll('.nav-hub').forEach(hub => { hub.open = true; });
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
    root.getElementById?.('mobileMenuBtn')?.setAttribute?.('aria-expanded', String(mobile && !hidden));
  }
}

export function initializeNavigationChrome(getRoute, root = document) {
  // Crossing the phone/desktop width changes how the sidebar behaves.
  globalThis.matchMedia?.('(min-width: 769px)').addEventListener?.('change', () => applyNavigationChrome(getRoute(), root));
  applyNavigationChrome(getRoute(), root);
}
