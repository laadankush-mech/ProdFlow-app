// ==========================================
// PRODFLOW - SERVICE WORKER v2
// ==========================================
// Strategy:
// - Never cache the Google Apps Script API (always go to network).
// - For the app shell: always fetch from network first.
//   If the server returns a NEW version (detected by ETag / Last-Modified),
//   update the cache AND force all open tabs to reload automatically.
//   This replaces the old Gist-based OTA check — pushing to GitHub is
//   all that is needed to deliver the update to every user.
// - If the network is unavailable, fall back to cache (offline support).

const CACHE_NAME = 'prodflow-cache-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// ── Install: pre-cache the app shell ─────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting(); // activate immediately
});

// ── Activate: clean up old caches ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // take control of all open tabs right away
});

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Compare the ETag (or Last-Modified) of a fresh network response to what
 * we have cached.  Returns true if the content is NEW.
 */
async function isContentNew(request, networkResponse) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (!cached) return true; // nothing cached → definitely new

  const newETag   = networkResponse.headers.get('ETag');
  const cachedETag = cached.headers.get('ETag');
  if (newETag && cachedETag) return newETag !== cachedETag;

  const newModified    = networkResponse.headers.get('Last-Modified');
  const cachedModified = cached.headers.get('Last-Modified');
  if (newModified && cachedModified) return newModified !== cachedModified;

  // GitHub Pages sends Content-Length; use it as a lightweight fallback
  const newLen    = networkResponse.headers.get('Content-Length');
  const cachedLen = cached.headers.get('Content-Length');
  if (newLen && cachedLen) return newLen !== cachedLen;

  return false; // assume unchanged if no headers to compare
}

/** Tell every open client tab to reload (used after a content update). */
function reloadAllClients() {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.navigate(client.url));
  });
}

// ── Fetch: network-first, force-reload on GitHub update ──────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ① Never intercept API calls to Google — always go live
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    return;
  }

  // ② Only handle GET requests
  if (req.method !== 'GET') return;

  // ③ Network-first with smart cache-update detection
  event.respondWith(
    fetch(req)
      .then(async (networkResponse) => {
        // Only cache successful responses for our own origin / CDN assets
        if (networkResponse.ok) {
          const shouldCheckForUpdate =
            url.hostname === self.location.hostname ||
            url.pathname.endsWith('.html') ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.json') ||
            url.pathname.endsWith('.css');

          if (shouldCheckForUpdate) {
            const contentChanged = await isContentNew(req, networkResponse.clone());
            // Always store the fresh copy
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, networkResponse.clone());

            if (contentChanged) {
              // New content detected on GitHub → reload all open tabs
              // Small delay so the cache.put finishes first
              setTimeout(reloadAllClients, 500);
            }
          }
        }
        return networkResponse;
      })
      .catch(async () => {
        // Offline: serve from cache
        const cached = await caches.match(req);
        if (cached) return cached;
        // Navigation fallback → cached index.html
        if (req.mode === 'navigate') return caches.match('./index.html');
      })
  );
});
