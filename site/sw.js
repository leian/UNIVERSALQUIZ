/* Appli SoccaQuiz (site statique) : fichiers gardés sur l'appareil, affichés tout de suite,
   remis à jour en arrière-plan. Les échanges avec le Google de la famille ne passent jamais par ici. */
const CACHE = 'soccaquiz-__VERSION__';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(__FICHIERS__)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(l => Promise.all(l.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const garde = await c.match(e.request, { ignoreSearch: true });
    const frais = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => garde);
    return garde || frais;
  }));
});
