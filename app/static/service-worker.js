const VERSION = "1.4.0-dev-G1";
const SHELL_CACHE = `histoannotator-shell-${VERSION}`;
const OFFLINE_CACHE = "histoannotator-offline-v0.8";

const SCOPE_PATH = new URL(self.registration.scope).pathname;
const shellUrls = [
  SCOPE_PATH,
  `${SCOPE_PATH}static/styles.css?v=1.4.0-dev-G1`,
  `${SCOPE_PATH}static/app.js?v=1.4.0-dev-G1`,
  `${SCOPE_PATH}static/manifest.webmanifest`,
  `${SCOPE_PATH}static/vendor/openseadragon/openseadragon.min.js`,
];

async function fetchWithTimeout(request, timeoutMs = 8000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(request, controller ? { signal: controller.signal } : undefined);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(shellUrls);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("histoannotator-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request, cacheName = OFFLINE_CACHE) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetchWithTimeout(request, 10000);
  if (response && response.ok) {
    try { await cache.put(request, response.clone()); } catch (_) { /* quota or opaque response */ }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetchWithTimeout(request, 3500);
        const cache = await caches.open(SHELL_CACHE);
        if (response.ok) await cache.put(SCOPE_PATH, response.clone());
        return response;
      } catch (_) {
        const cached = await (await caches.open(SHELL_CACHE)).match(SCOPE_PATH);
        return cached || new Response("HistoAnnotator is offline and the application shell is not cached yet.", { status: 503 });
      }
    })());
    return;
  }

  if (url.pathname.includes("/static/")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (/\/api\/images\/[^/]+\/(tiles\/|original$)/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, OFFLINE_CACHE));
  }
});
