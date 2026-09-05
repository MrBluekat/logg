const CACHE_NAME = "arrangementslogg-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Installer: cache app-skallet slik at appen åpner selv uten nett
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Aktiver: rydd opp gamle cache-versjoner
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Hent: cache-first for app-skallet, network-first for alt annet (data skal alltid være ferskt)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isAppShell = APP_SHELL.some((path) => url.pathname.endsWith(path.replace("./", "")));

  if (isAppShell) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
  // Alt annet (Supabase-kall osv.) går rett til nettverket som normalt.
});

// Motta push-varsel
self.addEventListener("push", (event) => {
  let payload = { title: "Arrangementslogg", body: "Ny hendelse registrert" };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Arrangementslogg", {
      body: payload.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: payload.url || "./index.html" },
    })
  );
});

// Klikk på varsel: åpne (eller fokuser) appen
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./index.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
