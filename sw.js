// Bike Tours R Us service worker.
// App files: network first (so updates arrive straight away), saved copy when offline.
// Fonts and icons: saved copy first. Firebase traffic goes straight to the network (Firebase keeps its own offline copy).
const VERSION = 'tru-v5';
const SHELL = ['./', './index.html', './css/app.css', './js/config.js', './js/app.js', './js/ride.js', './js/firebase-bundle.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './fonts/Barlow-Regular.ttf', './fonts/Barlow-Medium.ttf', './fonts/Barlow-SemiBold.ttf',
  './fonts/BarlowCondensed-SemiBold.ttf', './fonts/BarlowCondensed-Bold.ttf', './fonts/BarlowCondensed-ExtraBold.ttf'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(fonts|icons)\//.test(url.pathname)) { e.respondWith(caches.match(req).then(h => h || fetch(req))); return; }
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(fetch(req).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(key, c)); } return res; })
    .catch(() => caches.match(key)));
});
