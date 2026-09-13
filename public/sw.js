/* Math Workout service worker.
   Goal: the app opens and every mode plays with no network at all, while a
   redeploy is still picked up on the next visit. Practice history lives in
   localStorage, which the SW never touches. */

const VERSION = 'mw-v1';
const SHELL = `${VERSION}-shell`;   // app shell: html, icons, audio
const ASSETS = `${VERSION}-assets`; // hashed build output, immutable
const FONTS = `${VERSION}-fonts`;   // cross-origin webfont css + files

const SCOPE = new URL(self.registration.scope).pathname; // "/math/"
const SHELL_URLS = [
  SCOPE,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}favicon.svg`,
  `${SCOPE}icon-192.png`,
  `${SCOPE}icon-512.png`,
  `${SCOPE}apple-touch-icon.png`,
  `${SCOPE}audio/success.mp3`,
  `${SCOPE}audio/error.mp3`,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Individually, so one missing file cannot fail the whole install.
    await Promise.all(SHELL_URLS.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS, FONTS]);
    const names = await caches.keys();
    await Promise.all(names.map((n) => (keep.has(n) ? null : caches.delete(n))));
    await self.clients.claim();
  })());
});

// Let the page ask a waiting worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(fallbackUrl || request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(fallbackUrl || request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigations: network first so a new deploy wins, cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, SCOPE));
    return;
  }

  // Google Fonts stylesheet + font files: cache first, they never change per URL.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONTS).catch(() => caches.match(request)));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Vite emits content-hashed files under /math/assets/ - safe to cache forever.
  if (url.pathname.startsWith(`${SCOPE}assets/`)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  // Everything else in scope (icons, audio, manifest): cache first, refresh in background.
  if (url.pathname.startsWith(SCOPE)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});
