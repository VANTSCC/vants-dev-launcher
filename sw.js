// VANTS — Service Worker: cache de la app shell para carga rapida y soporte offline basico (mejorado)
const VERSION = 'vants-v11';
const SHELL = [
  './',
  './index.html',
  './offline.html',
  './bundle.css?v=8',
  './vantcall-cls-fixes.css?v=8',
  './spotify.css?v=8',
  './app.js?v=8',
  './auth0-config.js?v=10',
  './auth-pages.js?v=1',
  './spotify-player.js?v=8',
  './auth.js?v=10',
  './zona.js?v=8',
  './premium.js?v=8',
  './ranks.js',
  './assets/brand/favicon.svg',
  './assets/brand/vants-mark.svg',
  './privacidad.html',
  './terminos.html',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Intentamos cachear uno a uno para evitar que un fallo deshabilite todo el install
    for (const url of SHELL) {
      try {
        await cache.add(url);
      } catch (err) {
        // No hacemos fail-fast: registramos fallo y seguimos
        console.warn('sw: failed to cache', url, err);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo GET de nuestro origen. APIs externas (p.ej. Neon) van siempre a red.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegación (SPA): network-first con fallback a index.html y offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        // Actualizamos cache en segundo plano
        if (networkResponse && networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(VERSION).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const idx = await caches.match('./index.html');
        if (idx) return idx;
        const off = await caches.match('./offline.html');
        return off || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Archivos estáticos (css/js): network-first, fallback cache
  if (/\.(css|js)$/.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const r = await fetch(event.request);
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return r;
      } catch (err) {
        return caches.match(event.request);
      }
    })());
    return;
  }

  // Estáticos por defecto: cache-first con actualización en segundo plano
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const network = fetch(event.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(event.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => null);
    return cached || network;
  })());
});

// Permitir activación inmediata al recibir mensaje skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
