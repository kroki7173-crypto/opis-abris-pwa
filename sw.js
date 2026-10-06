const CACHE = "opis-abris-shell-v55";
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

// A new version is downloaded whole into its own cache, past the browser HTTP cache, so one version never
// mixes with another. The page reloads once when it takes over (see app.js, "controllerchange").
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(
    SHELL.map((url) => new Request(url, { cache: "reload" })),
  )));
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

// Cache first: the app opens from the phone at once, whatever the network does. Waiting for the network on
// every file left a black screen for half a minute on a poor connection (Bolat, 05.10.2026).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true }) ??
      (event.request.mode === "navigate" ? await cache.match("./index.html") : undefined);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) cache.put(event.request, response.clone());
    return response;
  })());
});
