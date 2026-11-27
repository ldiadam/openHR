const CACHE_VERSION = 'openhr-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(SHELL_URLS);
      } catch {
        // A missing shell file must not block the worker from installing.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function putSafely(cacheName, request, response) {
  // Only cache complete, same-origin responses. `cache.put` rejects for
  // opaque, partial (206), or Vary:* responses, which would otherwise surface
  // as unhandled promise rejections.
  if (!response || !response.ok || response.status === 206 || response.type !== 'basic') {
    return;
  }
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    // Cache write failures are never fatal to the response.
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return;

  // Range requests and only-if-cached lookups are left to the browser; caching
  // or refetching them here corrupts media playback and can reject outright.
  if (request.headers.has('range') || request.cache === 'only-if-cached') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          await putSafely(SHELL_CACHE, '/', response);
          return response;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      let response;
      try {
        response = await fetch(request);
      } catch {
        // The request was aborted or the network dropped. Returning a response
        // keeps this out of the unhandled-rejection path.
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
      }

      await putSafely(ASSET_CACHE, request, response);
      return response;
    })()
  );
});
