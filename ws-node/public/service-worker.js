const CACHE_NAME = "campuschat-v1";

// Static assets to cache on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/chat.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ── Install: cache static assets ─────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for static assets ──
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go to network for API calls and socket connections
  if (
    url.pathname.includes("/campus-chat/api") ||
    url.pathname.includes("/socket.io")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for HTML (always get latest version)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, icons)
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
    )
  );
});