/* ─── Z Trade University — Service Worker ─────────────────────────────────────
   Purpose: enable PWA install (Add to Home Screen) on Android/Chrome.
   Strategy: minimal shell cache only. NEVER intercept /api/ requests so
   live sentiment, fundamentals, and weekly engines stay 100% fresh.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const CACHE_VERSION = 'ztu-shell-v1';
const SHELL_ASSETS  = [
  '/manifest.json',
  '/assets/ztu-logo.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(SHELL_ASSETS).catch(function () {}); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  /* Only handle same-origin */
  if (url.origin !== self.location.origin) return;

  /* CRITICAL: never intercept API calls — live market data stays untouched */
  if (url.pathname.indexOf('/api/') === 0) return;

  /* Only serve the explicit shell assets from cache. Everything else
     (HTML, scripts, CSS, images) passes through to the network normally. */
  if (SHELL_ASSETS.indexOf(url.pathname) !== -1) {
    event.respondWith(
      caches.match(req).then(function (cached) { return cached || fetch(req); })
    );
  }
});
