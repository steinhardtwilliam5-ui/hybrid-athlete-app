const CACHE = 'hybrid-athlete-v30';
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './v3.css?v=30', './app-v2.js?v=30', SDK];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => /^hybrid-athlete-v\d+$/.test(key) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const asset = ASSETS.slice(2).some(path => new URL(path, self.registration.scope).href === url.href);
  if (asset) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
    return;
  }
  const root = new URL(self.registration.scope);
  if (event.request.mode !== 'navigate' || url.origin !== root.origin || ![root.pathname, root.pathname + 'index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('./index.html'))));
});
