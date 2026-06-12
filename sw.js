// This Service Worker is now a "Pass-Through" proxy.
// It allows the browser to fetch the absolute latest files from GitHub
// while still fulfilling the technical requirement for PWA installability.

self.addEventListener('install', event => {
    // Skip waiting so the service worker activates immediately
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // Clean up any old caches that might exist from previous versions
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => caches.delete(cache))
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // Simply pass the request through to the network.
    // This ignores cache and always gets the latest file from GitHub.
    event.respondWith(fetch(event.request));
});
