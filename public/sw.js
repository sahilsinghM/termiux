const CACHE = 'termiux-v1';
const PRECACHE = ['/'];

self.addEventListener('install', (evt) => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);

  // Never intercept API or WebSocket upgrade paths
  if (url.pathname.startsWith('/api/') ||
      url.pathname === '/login' ||
      url.pathname === '/healthz') {
    return;
  }

  evt.respondWith(
    fetch(evt.request)
      .then((res) => {
        // Cache successful GET responses for HTML, JS, CSS
        if (evt.request.method === 'GET' && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(evt.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(evt.request).then((cached) => {
          if (cached) return cached;
          // Offline fallback for navigation requests
          if (evt.request.mode === 'navigate') {
            return new Response(
              `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Termiux</title>
              <style>body{background:#0d1117;color:#e6edf3;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0}</style>
              </head><body><p>No connection — server unreachable</p></body></html>`,
              { headers: { 'Content-Type': 'text/html' } }
            );
          }
          return new Response('', { status: 503 });
        })
      )
  );
});
