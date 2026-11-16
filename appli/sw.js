/* Cache de l'enveloppe seulement (sa page, ses icônes) : l'écran de démarrage s'affiche tout de suite.
   Les pages de SoccaQuiz (Google Apps Script) viennent d'un autre site et ne passent jamais par ici. */
const CACHE = 'sq-app-v1';   // changer le numéro pour forcer le renouvellement
const FICHIERS = ['./', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n)))));
  self.clients.claim();
});
// réseau d'abord (une correction de l'enveloppe arrive tout de suite), cache en secours (hors connexion)
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL('./', location).pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Response.error()))
  );
});
