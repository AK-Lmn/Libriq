/* ============================================
   LIBRIQ SERVICE WORKER
   App shell caching only. No API response caching.
   ============================================ */

const CACHE_VERSION = 'libriq-v4.5.1';
const CACHE_NAME = `${CACHE_VERSION}-shell`;
const IS_LOCAL_DEV = ['localhost', '127.0.0.1', '::1'].includes(self.location.hostname);

const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './assets/icons/icon.svg',
  './assets/icons/favicon-16x16.png',
  './assets/icons/favicon-32x32.png',
  './assets/icons/favicon-48x48.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-icon-512.png',
  './css/tokens.css',
  './css/reset.css',
  './css/base.css',
  './css/components.css',
  './css/sidebar.css',
  './css/dashboard.css',
  './css/modals.css',
  './css/animations.css',
  './js/data.js',
  './js/storage.js',
  './js/utils.js',
  './js/search.js',
  './js/library.js',
  './js/dashboard.js',
  './js/navigation.js',
  './js/app.js',
  './js/sync.js',
  './js/api/cache.js',
  './js/api/googleBooks.js',
  './js/api/index.js',
  './js/api/mergeBooks.js',
  './js/api/normalizeBook.js',
  './js/api/openLibrary.js',
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
    || pathname.endsWith('.webmanifest')
    || pathname.endsWith('.json');
}

function isApiRequest(url) {
  return url.hostname === 'openlibrary.org' || url.hostname === 'www.googleapis.com';
}

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

