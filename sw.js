// Offline cache. Bump VERSION when the asset list changes.
// Network-first for content/JS/CSS/HTML (updates arrive quickly), cache-first for icons, audio, fonts.
const VERSION = "de-v0.4.0";
const ASSETS = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/store.js", "js/srs.js", "js/speech.js", "js/text.js", "js/ui.js", "js/steps.js", "js/plan.js", "js/profile.js", "js/icons.js",
  "content/course.json", "content/d01.json", "content/d02.json", "content/d03.json", "content/d04.json", "audio/manifest.json",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  const p = url.pathname;
  const fresh = sameOrigin && (p.includes("/content/") || p.endsWith(".js") || p.endsWith(".css") || p.endsWith("/") || p.endsWith(".html") || p.endsWith("manifest.json"));
  if (fresh) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); }
      return r;
    })));
  }
});
