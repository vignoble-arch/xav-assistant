const CACHE_NAME = "assistant-xavier-pwa-48";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/quick-note.html",
  "/quick-note.css?v=liberer-2",
  "/quick-note.js?v=liberer-2",
  "/quick-note.webmanifest?v=liberer-2",
  "/qr-liberer.png",
  "/pointeuse.html",
  "/pointeuse.css?v=cathy-1",
  "/pointeuse.js?v=cathy-1",
  "/styles.css?v=mail-read-on-open-1",
  "/app.js?v=mail-read-on-open-1",
  "/manifest.webmanifest?v=liberer-1",
  "/icon.svg?v=pwa-1",
  "/art-mas-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});


