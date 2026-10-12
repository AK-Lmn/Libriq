importScripts('./js/version-classic.js');
const CACHE_VERSION = `libriq-v${self.LIBRIQ_APP_VERSION}`;
const CACHE_NAME = `${CACHE_VERSION}-shell-v4-glass`;
const IS_LOCAL_DEV = ['localhost', '127.0.0.1', '::1'].includes(self.location.hostname);

const SHELL_ASSETS = [
  './index.html',
  './assets/revamp/account/18-4308-book-heart.svg',
  './assets/revamp/account/18-4308-chevron-up.svg',
  './assets/revamp/account/18-4308-compass.svg',
  './assets/revamp/account/18-4308-info.svg',
  './assets/revamp/account/18-4308-library1.svg',
  './assets/revamp/account/18-4308-plus.svg',
  './assets/revamp/account/18-4308-search1.svg',
  './assets/revamp/account/20-1118-book-check.svg',
  './assets/revamp/account/20-1118-calendar-days.svg',
  './assets/revamp/account/20-1118-files.svg',
  './assets/revamp/account/20-1118-flame.svg',
  './assets/revamp/account/20-1118-library.svg',
  './assets/revamp/account/20-1118-lock-keyhole.svg',
  './assets/revamp/account/20-1118-lock-keyhole1.svg',
  './assets/revamp/account/20-1118-star.svg',
  './assets/revamp/account/23-5548-arrow-left-right.svg',
  './assets/revamp/account/23-5548-book-open.svg',
  './assets/revamp/account/23-5548-circle-check.svg',
  './assets/revamp/account/23-5548-cloud-upload.svg',
  './assets/revamp/account/23-5548-download.svg',
  './assets/revamp/account/23-5548-file-text.svg',
  './assets/revamp/account/23-5548-lock-keyhole1.svg',
  './assets/revamp/account/23-5548-moon.svg',
  './assets/revamp/account/23-5548-refresh-cw.svg',
  './assets/revamp/account/23-5548-unselected.svg',
  './assets/revamp/account/23-5548-upload.svg',
  './assets/revamp/account/23-5548-user-round.svg',
  './assets/revamp/book-details/arrow-left.svg',
  './assets/revamp/book-details/check.svg',
  './assets/revamp/book-details/close.svg',
  './assets/revamp/book-details/delete.svg',
  './assets/revamp/book-details/edit.svg',
  './assets/revamp/book-details/heart.svg',
  './assets/revamp/book-details/lock.svg',
  './assets/revamp/book-details/progress.svg',
  './assets/revamp/book-details/refresh.svg',
  './assets/revamp/book-details/star-empty.svg',
  './assets/revamp/book-details/star-filled.svg',
  './assets/revamp/book-details/status-metadata.svg',
  './assets/revamp/book-details/status-reading.svg',
  './assets/revamp/discover/dark-arrow-up-right.svg',
  './assets/revamp/discover/dark-bookmark-check.svg',
  './assets/revamp/discover/dark-bookmark.svg',
  './assets/revamp/discover/dark-heart.svg',
  './assets/revamp/discover/dark-lock-keyhole.svg',
  './assets/revamp/discover/dark-plus.svg',
  './assets/revamp/discover/dark-star.svg',
  './assets/revamp/discover/light-arrow-up-right.svg',
  './assets/revamp/discover/light-bookmark-check.svg',
  './assets/revamp/discover/light-lock-keyhole.svg',
  './assets/revamp/discover/light-plus.svg',
  './assets/revamp/insights/activity-arrow-down-wide-narrow.svg',
  './assets/revamp/insights/activity-book-open1.svg',
  './assets/revamp/insights/activity-book-plus.svg',
  './assets/revamp/insights/activity-book-plus1.svg',
  './assets/revamp/insights/activity-chart-no-axes-column-increasing.svg',
  './assets/revamp/insights/activity-check.svg',
  './assets/revamp/insights/activity-chevron-down.svg',
  './assets/revamp/insights/activity-hard-drive-download.svg',
  './assets/revamp/insights/activity-history1.svg',
  './assets/revamp/insights/activity-layers.svg',
  './assets/revamp/insights/activity-notebook-pen1.svg',
  './assets/revamp/insights/activity-refresh-cw.svg',
  './assets/revamp/insights/goal-chevron-down.svg',
  './assets/revamp/insights/goal-chevron-up.svg',
  './assets/revamp/insights/goal-ring-track.svg',
  './assets/revamp/insights/stats-book-check.svg',
  './assets/revamp/insights/stats-calendar-days.svg',
  './assets/revamp/insights/stats-chevron-down.svg',
  './assets/revamp/insights/stats-files.svg',
  './assets/revamp/insights/stats-flame.svg',
  './assets/revamp/insights/stats-library1.svg',
  './assets/revamp/insights/stats-orbit.svg',
  './assets/revamp/insights/stats-star.svg',
  './assets/revamp/insights/stats-star1.svg',
  './assets/revamp/library/alert.svg',
  './assets/revamp/library/bookmark-active.svg',
  './assets/revamp/library/bookmark.svg',
  './assets/revamp/library/books.svg',
  './assets/revamp/library/chevron.svg',
  './assets/revamp/library/grid.svg',
  './assets/revamp/library/heart-active.svg',
  './assets/revamp/library/heart.svg',
  './assets/revamp/library/lock.svg',
  './assets/revamp/library/plus.svg',
  './assets/revamp/library/search.svg',
  './assets/revamp/library/shelf-empty-favorites.svg',
  './assets/revamp/library/shelf-empty-finished.svg',
  './assets/revamp/library/shelf-empty-reading.svg',
  './assets/revamp/library/shelf-empty-wishlist.svg',
  './assets/revamp/library/shelf-search.svg',
  './assets/revamp/library/shield.svg',
  './assets/revamp/library/sort.svg',
  './assets/revamp/library/status-dnf.svg',
  './assets/revamp/library/status-finished.svg',
  './assets/revamp/library/status-reading.svg',
  './assets/revamp/library/status-wishlist.svg',
  './assets/revamp/library/x.svg',
  './css/navigation-chrome.css',
  './css/features/goals.css',
  './css/features/discover.css',
  './css/features/profile.css',
  './css/features/help.css',
  './css/features/book-details.css',
  './js/navigationChrome.js',
  './js/features/library/libraryDesign.js',
  './manifest.json',
  './assets/fonts/fonts.css',
  './assets/fonts/inter-latin.woff2',
  './assets/fonts/lora-latin.woff2',
  './assets/fonts/lora-italic-latin.woff2',
  './assets/fonts/ibm-plex-mono-latin.woff2',
  './assets/dashboard/desktop-arrow-up-right.svg',
  './assets/dashboard/desktop-book-open.svg',
  './assets/dashboard/desktop-book-pedestal-shadow.svg',
  './assets/dashboard/desktop-bookmark.svg',
  './assets/dashboard/desktop-chart-no-axes-combined.svg',
  './assets/dashboard/desktop-circle-check.svg',
  './assets/dashboard/desktop-circle-help.svg',
  './assets/dashboard/desktop-flame.svg',
  './assets/dashboard/desktop-heart.svg',
  './assets/dashboard/desktop-history.svg',
  './assets/dashboard/desktop-layout-dashboard.svg',
  './assets/dashboard/desktop-library.svg',
  './assets/dashboard/desktop-lock-keyhole.svg',
  './assets/dashboard/desktop-notebook-pen.svg',
  './assets/dashboard/desktop-plus.svg',
  './assets/dashboard/desktop-settings2.svg',
  './assets/dashboard/desktop-sparkles.svg',
  './assets/dashboard/desktop-target.svg',
  './assets/dashboard/desktop-timer.svg',
  './assets/dashboard/desktop-user-round.svg',
  './assets/dashboard/mobile-house.svg',
  './assets/icons/icon.svg',
  './assets/icons/favicon-16x16.png',
  './assets/icons/favicon-32x32.png',
  './assets/icons/favicon-48x48.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-icon-512.png',
  './css/tokens.css',
  './css/components.css',
  './css/reset.css',
  './css/base.css',
  './css/components/button.css',
  './css/components/card.css',
  './css/components/toast.css',
  './css/components/form.css',
  './css/components/polish.css',
  './css/components/utilities.css',
  './css/components/dialog.css',
  './css/features/settings.css',
  './css/features/library.css',
  './css/features/insights.css',
  './css/features/session.css',
  './css/features/dashboard.css',
  './css/sidebar.css',
  './css/animations.css',
  './js/version-classic.js',
  './js/version.js',
  './js/config.js',
  './js/appModules.js',
  './js/data.js',
  './js/storage.js',
  './js/utils.js',
  './js/search.js',
  './js/library.js',
  './js/dashboard.js',
  './js/navigation.js',
  './js/app.js',
  './js/firebase-client.js',
  './js/cloudBackup.js',
  './js/accountDisplayName.js',
  './js/installPrompt.js',
  './js/sync.js',
  './js/app/router.js',
  './js/components/ui/dialog.js',
  './js/features/activity/activityPage.js',
  './js/features/bookDetails/bookDetailsPage.js',
  './js/features/dashboard/dashboardPage.js',
  './js/features/goals/goalsPage.js',
  './js/features/help/helpPage.js',
  './js/features/kindleImport/kindleImportPage.js',
  './js/features/library/libraryPage.js',
  './js/features/library/libraryShelvesPage.js',
  './js/features/profile/profilePage.js',
  './js/features/quotes/quotesPage.js',
  './js/features/recommendations/recommendationsPage.js',
  './js/features/settings/settingsPage.js',
  './js/features/statistics/statisticsCalculations.js',
  './js/features/statistics/statisticsPage.js',
  './js/services/backupSerialization.js',
  './js/services/importExportService.js',
  './js/services/importMerge.js',
  './js/services/kindleClippingsParser.js',
  './js/services/kindleImportService.js',
  './js/services/kindleQuoteImport.js',
  './js/api/bookIdentity.js',
  './js/api/cache.js',
  './js/api/googleBooks.js',
  './js/api/gutendex.js',
  './js/api/index.js',
  './js/api/internetArchive.js',
  './js/api/mergeBooks.js',
  './js/api/normalizeBook.js',
  './js/api/openLibrary.js',
  './js/shared/fetchClient.js',
  './vendor/firebase-app.js',
  './vendor/firebase-auth.js',
  './vendor/firebase-firestore.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (IS_LOCAL_DEV) {
      self.skipWaiting();
      return;
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS.map(scopeUrl));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (IS_LOCAL_DEV) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      return;
    }
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key.startsWith('libriq-') && key !== CACHE_NAME) {
        return caches.delete(key);
      }
      return Promise.resolve(false);
    }));
    await clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (isApiRequest(url)) {
      event.respondWith(fetch(request));
    }
    return;
  }

  if (IS_LOCAL_DEV) {
    event.respondWith(fetch(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isAppShellAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(scopeUrl('./index.html'));
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    fetchAndCache(request, cache);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function fetchAndCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
  } catch {
    // Ignore network failures; cached response is already being served.
  }
}

function isNavigationRequest(request) {
  const accept = request.headers.get('accept') || '';
  return request.mode === 'navigate'
    || request.destination === 'document'
    || accept.includes('text/html');
}

function isAppShellAsset(url) {
  const pathname = url.pathname;
  return pathname.endsWith('.css')
    || pathname.endsWith('.js')
    || pathname.endsWith('.png')
    || pathname.endsWith('.svg')
    || pathname.endsWith('.woff2')
    || pathname.endsWith('.webmanifest')
    || pathname.endsWith('.json');
}

function isApiRequest(url) {
  return url.hostname === 'openlibrary.org' || url.hostname === 'www.googleapis.com';
}

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}
