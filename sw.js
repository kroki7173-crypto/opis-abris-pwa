const CACHE = "opis-abris-shell-v31";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./designs.html",
  "./designs.css",
  "./designs.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./apple-touch-icon.png",
  "./src/app.js",
  "./src/catalog.js",
  "./src/model.js",
  "./src/storage.js",
  "./src/voice.js",
  "./src/zip.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    // no-cache: revalidate with the server so the browser HTTP cache cannot mix an old page with a new script.
    fetch(event.request, { cache: "no-cache" }).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./index.html");
      throw new Error("Ресурс недоступен офлайн.");
    }),
  );
});
