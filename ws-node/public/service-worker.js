const CACHE_NAME = "campuschat-v4";

// ── Install: skip waiting immediately ────────────────────────────
self.addEventListener("install", () => self.skipWaiting());

// ── Activate: clear ALL old caches ───────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for EVERYTHING ──────────────────────────
// No caching of JS/CSS — always fetch fresh from server
// Only cache uploaded images/files for performance
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bypass SW entirely for API, socket, and uploads
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/campus-chat/api") ||
    url.pathname.includes("/socket.io") ||
    url.pathname.includes("/uploads/")
  ) {
    return; // Let browser handle natively
  }

  // Network-first for ALL JS, CSS, HTML — never serve stale
  if (
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.mode === "navigate"
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Cache-first only for icons/images (safe to cache)
  if (event.request.destination === "image") {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // Default: network-first (always return a valid Response)
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((r) => r || new Response("Offline", { status: 503 }))
    )
  );
});