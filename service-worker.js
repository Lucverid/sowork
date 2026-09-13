const CACHE_NAME = 'agis-finance-v27-3-1-inline-feature-switcher-offline';

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

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigasi: coba versi terbaru dari network, fallback ke app shell saat offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Asset lokal: cache-first, lalu isi cache jika ada asset baru.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
