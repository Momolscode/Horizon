/*
 * Service worker HORIZON — cache limité, PAS un mode hors ligne complet.
 * - Ressources statiques (_next/static, fond de carte, worker MapLibre, icônes) : cache puis réseau.
 * - Pages : réseau d'abord, repli sur la dernière version en cache, puis /hors-ligne.
 * - Les API (/api/*) et les requêtes tierces ne sont jamais mises en cache.
 * - Pages jamais conservées : partages (/partage/*, révocables), administration, connexion.
 * - Cache de pages borné (MAX_PAGES entrées, les plus anciennes évincées).
 */
const VERSION = "horizon-v2";
const MAX_PAGES = 30;
const NEVER_CACHED_PAGES = ["/partage/", "/admin", "/connexion"];
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const PRECACHE = ["/hors-ligne", "/geo/basemap-fr.geojson", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isNeverCached(url) {
  return NEVER_CACHED_PAGES.some((prefix) => url.pathname.startsWith(prefix));
}

async function putPage(request, response) {
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(key);
}

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/geo/") || url.pathname.startsWith("/maplibre/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    if (isNeverCached(url)) {
      event.respondWith(fetch(request).catch(() => caches.match("/hors-ligne")));
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(putPage(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/hors-ligne"))),
    );
  }
});
