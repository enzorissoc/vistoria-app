var CACHE_NAME = 'vistoria-app-v41';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo.png'
];

var CDN_CACHE = 'cdn-cache-v1';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME && k !== CDN_CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  if (url.origin !== location.origin) {
    event.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          return cached || fetch(event.request).then(function(resp) {
            if (resp.ok) cache.put(event.request, resp.clone());
            return resp;
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(function(resp) {
      var clone = resp.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
      return resp;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
