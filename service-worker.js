const CACHE_NAME = 'agis-finance-v27-4-0-stability-offline';
const CACHE_PREFIX = 'agis-finance-';

// Keep the shell explicit so GitHub Pages/PWA can work after the first online load.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './chart.min.js',
  './sweetalert2.all.min.js',
  './lucide.min.js',
  './xlsx.full.min.js',
  './firebase-app.js',
  './firebase-firestore.js',
  './v24-4-features.css',
  './v24-4-features.js', './v24-5-automation.js?v=27.2.0', './v24-5-automation.css', './v24-6-layout.css', './v25-features.js', './v25-features.css', './v25-1-mobile.js', './v25-1-mobile.css', './v25-2-clean-home.js', './v25-2-clean-home.css', './v25-3-health-pulse.js', './v25-3-health-pulse.css', './v25-3-1-quick-transaction.js', './v25-3-1-quick-transaction.css',
  './v25-3-2-ui-polish.css', './v25-5-17-easter-egg.css', './v25-5-17-easter-egg.js', './cat-idle-strip.png', './cat-walk-strip.png', './cat-run-strip.png', './cat-sleep-strip.png', './cat-pet-strip.png', './mouse-run-strip.png', './v25-3-3-financial-plan.js?v=27.2.0', './v25-3-3-financial-plan.css', './v25-3-4-balance-wallet.css', './v25-3-5-balance-savings.css', './v25-3-6-health-balance.css', './v25-3-10-health-engine.js', './v25-3-10-health-engine.css', './v26-decision-lab.js?v=27.2.0', './v26-decision-lab.css', './v27-tracking.js?v=27.2.0', './v27-tracking.css?v=27.2.0',
  './icon-192.png',
  './icon-512.png'
];

const CORE_SHELL = ['./', './index.html', './manifest.json'];

async function fetchFresh(url) {
  const request = new Request(url, { cache: 'reload' });
  const response = await fetch(request);
  if (!response || !response.ok) throw new Error(`HTTP ${response?.status || 0}: ${url}`);
  return response;
}

async function cacheOptionalAssets(cache) {
  const optional = APP_SHELL.filter(url => !CORE_SHELL.includes(url));
  const results = await Promise.allSettled(optional.map(async url => {
    const response = await fetchFresh(url);
    await cache.put(url, response.clone());
  }));
  // One optional asset must not cancel the whole service-worker install.
  results.forEach((result, i) => {
    if (result.status === 'rejected') console.warn('[offline-cache] skipped', optional[i], result.reason);
  });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Core shell is mandatory. Optional files are best-effort so a single bad path
    // cannot make the entire app lose offline support.
    for (const url of CORE_SHELL) {
      const response = await fetchFresh(url);
      await cache.put(url, response.clone());
    }
    await cacheOptionalAssets(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), ms))
  ]);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: prefer latest deploy, but fall back quickly when connection is poor/offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await withTimeout(fetch(request), 3500);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Local assets: cache-first for instant offline load; refresh cache on a miss.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
