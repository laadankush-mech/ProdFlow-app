// This Service Worker is a "No-Op" pass-through.
// It bypasses the cache entirely to ensure the browser always 
// fetches the latest files directly from GitHub.

self.addEventListener('install', event => {
    // Force the service worker to take control immediately
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // Explicitly delete any existing caches to prevent residual data
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => caches.delete(cache))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // Always fetch from the network. Never look at the cache.
    // This allows GitHub Pages updates to show instantly.
    event.respondWith(fetch(event.request));
});
