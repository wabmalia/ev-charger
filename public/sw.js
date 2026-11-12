// Offline support: network-first for pages, cache-first for hashed assets.
// Google APIs are never cached.
const CACHE = 'ev-charger-v4'; // bump when unhashed files (icons, manifest) change

// Precache on install so the app opens offline after a single online visit: the page,
// every script/stylesheet it references, the manifest and the icons.
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch('./', { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put('./', res);
  const urls = new Set(['manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png']);
  for (const m of html.matchAll(/(?:src|href)="(?:\.\/)?([^"#?]+)"/g)) {
    if (!/^(https?:|data:|\/\/)/.test(m[1])) urls.add(m[1]);
  }
  await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
}
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    // Only the app itself is the cached shell; other pages (privacy.html, terms.html) are cached under their own URL.
    const isApp = url.pathname === new URL('./', self.registration.scope).pathname || url.pathname.endsWith('/index.html');
    const key = isApp ? './' : url.pathname;
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key, { ignoreVary: true }).then((hit) => hit || caches.match('./', { ignoreVary: true }))),
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
