// Offline cache, plus the receiving end of "Share → Tivoo Studio" (Web Share Target).
const CACHE = 'tivoo-v9';
const FILES = ['./', 'index.html', 'app.js', 'divoom.js', 'effects.js', 'games.js', 'sfx.js', 'menu.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'tivoo-shared').map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('media');
      if (file && file.size) {
        const cache = await caches.open('tivoo-shared');
        await cache.put('shared-file', new Response(file, { headers: { 'content-type': file.type || 'image/gif', 'x-file-name': encodeURIComponent(file.name || 'shared') } }));
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // no-cache: always revalidate with GitHub so a new release never mixes with old files
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
