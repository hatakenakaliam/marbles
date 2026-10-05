const CACHE = 'marbles-2066ad0032';
const ASSETS = ["./apple-touch-icon.png","./assets/index-Bp3ouiRh.js","./assets/index-CRYdLL8N.css","./icon-192.png","./icon-512.png","./icon-maskable.png","./index.html","./manifest.webmanifest"];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      // Bypass the HTTP cache: a stale index.html would point at files that no longer exist.
      await c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })));
      // Refuse to install unless the page we cached is the one that belongs to these assets.
      const html = await (await c.match('./index.html')).text();
      const built = ASSETS.filter((u) => u.startsWith('./assets/'));
      if (!built.every((u) => html.includes(u.slice(2)))) {
        await caches.delete(CACHE);
        throw new Error('index.html does not match this build yet');
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true });
      return hit || fetch(req);
    }),
  );
});
