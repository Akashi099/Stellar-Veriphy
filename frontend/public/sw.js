/**
 * Service Worker
 * 
 * Provides offline support, caching strategies, and background sync
 * for the StellarVeriphy PWA.
 */

// Build ID is injected at build time; fall back to a stable version string.
const BUILD_ID = (typeof self !== 'undefined' && self.__BUILD_ID__) || 'v1.0.0';
const CACHE_PREFIX = 'stellarveriphy';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${BUILD_ID}`;
const DYNAMIC_CACHE = `${CACHE_PREFIX}-dynamic-${BUILD_ID}`;
const IMAGE_CACHE = `${CACHE_PREFIX}-images-${BUILD_ID}`;
const CURRENT_CACHES = [STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE];

// Public pages that are safe to serve stale-while-revalidate.
const PUBLIC_PAGE_PATHS = ['/', '/offline', '/verify', '/explore'];

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/offline',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
];

// Maximum cache sizes
const MAX_DYNAMIC_CACHE_SIZE = 50;
const MAX_IMAGE_CACHE_SIZE = 30;

// Cache size management
async function limitCacheSize(cacheName, maxSize) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxSize) {
        await cache.delete(keys[0]);
        await limitCacheSize(cacheName, maxSize);
    }
}

// Install event - cache static assets.
// NOTE: We intentionally do NOT call skipWaiting() here. Waiting lets the
// page prompt the user and send SKIP_WAITING when they are ready, keeping
// existing sessions stable during the update.
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...', BUILD_ID);

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                // Use cache-busting reload so new asset versions are fetched.
                return cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
            })
    );
});

// Activate event - clean old caches and claim clients.
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...', BUILD_ID);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && !CURRENT_CACHES.includes(name))
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            // Only cache storage is touched here. We deliberately never clear
            // localStorage/sessionStorage so auth tokens and active sessions
            // survive the update.
            .then(() => self.clients.claim())
    );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip external requests (except fonts and images)
    if (url.origin !== self.location.origin &&
        !request.url.includes('fonts.googleapis.com') &&
        !request.url.includes('fonts.gstatic.com') &&
        !request.destination.includes('image')) {
        return;
    }

    // Handle API requests - network only
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    return new Response(
                        JSON.stringify({ error: 'Offline - API unavailable' }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 503
                        }
                    );
                })
        );
        return;
    }

    // Handle images - cache first
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request)
                .then((response) => {
                    return response || fetch(request)
                        .then((fetchResponse) => {
                            return caches.open(IMAGE_CACHE)
                                .then((cache) => {
                                    cache.put(request, fetchResponse.clone());
                                    limitCacheSize(IMAGE_CACHE, MAX_IMAGE_CACHE_SIZE);
                                    return fetchResponse;
                                });
                        });
                })
        );
        return;
    }

    // Handle public pages - stale-while-revalidate for predictable, safe updates
    if (request.mode === 'navigate' && PUBLIC_PAGE_PATHS.includes(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Handle pages and assets - network first with cache fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Clone response before caching
                const responseToCache = response.clone();

                // Cache successful responses
                if (response.status === 200) {
                    caches.open(DYNAMIC_CACHE)
                        .then((cache) => {
                            cache.put(request, responseToCache);
                            limitCacheSize(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
                        });
                }

                return response;
            })
            .catch(() => {
                // Try cache
                return caches.match(request)
                    .then((response) => {
                        // Return cached response or offline page
                        return response || caches.match('/offline')
                            .then((offlineResponse) => {
                                return offlineResponse || new Response(
                                    '<html><body><h1>Offline</h1><p>No internet connection available.</p></body></html>',
                                    { headers: { 'Content-Type': 'text/html' } }
                                );
                            });
                    });
            })
    );
});

// Stale-while-revalidate: serve cached copy immediately, refresh in background.
async function staleWhileRevalidate(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);

    const networkFetch = fetch(request)
        .then((response) => {
            if (response && response.status === 200) {
                cache.put(request, response.clone());
                limitCacheSize(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
            }
            return response;
        })
        .catch(() => null);

    if (cached) {
        // Refresh in the background without blocking the response.
        return cached;
    }

    const networkResponse = await networkFetch;
    if (networkResponse) {
        return networkResponse;
    }

    const offline = await caches.match('/offline');
    return offline || new Response(
        '<html><body><h1>Offline</h1><p>No internet connection available.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
    );
}

// Background sync event
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-transactions') {
        event.waitUntil(syncTransactions());
    }
});

async function syncTransactions() {
    try {
        // Get pending transactions from IndexedDB
        const db = await openDatabase();
        const transactions = await getPendingTransactions(db);

        // Sync each transaction
        for (const tx of transactions) {
            await fetch('/api/transactions/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tx),
            });
        }

        console.log('[SW] Transactions synced successfully');
    } catch (error) {
        console.error('[SW] Sync failed:', error);
        throw error; // Retry on next sync event
    }
}

// Push notification event
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    const options = {
        body: event.data ? event.data.text() : 'New update available',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        tag: 'stellarveriphy-notification',
        requireInteraction: false,
        data: event.data ? JSON.parse(event.data.text()) : {},
        actions: [
            {
                action: 'view',
                title: 'View',
                icon: '/icons/action-view.png',
            },
            {
                action: 'dismiss',
                title: 'Dismiss',
                icon: '/icons/action-dismiss.png',
            },
        ],
    };

    event.waitUntil(
        self.registration.showNotification('StellarVeriphy', options)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);

    event.notification.close();

    if (event.action === 'view') {
        event.waitUntil(
            clients.openWindow(event.notification.data.url || '/')
        );
    }
});

// Message event - communicate with main thread
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data.type === 'SKIP_WAITING') {
        // Triggered by the page after the user accepts the update prompt.
        self.skipWaiting();
    }

    if (event.data.type === 'GET_VERSION') {
        event.ports[0]?.postMessage({ buildId: BUILD_ID });
    }

    if (event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(DYNAMIC_CACHE)
                .then((cache) => cache.addAll(event.data.urls))
        );
    }

    if (event.data.type === 'CLEAR_CACHE') {
        // Only clear Cache Storage. Never touch localStorage/sessionStorage
        // so authentication state and active sessions remain intact.
        event.waitUntil(
            caches.keys()
                .then((cacheNames) => Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith(`${CACHE_PREFIX}-`))
                        .map((name) => caches.delete(name))
                ))
        );
    }
});

// Helper: Open IndexedDB
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('stellarveriphy-db', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending-transactions')) {
                db.createObjectStore('pending-transactions', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Helper: Get pending transactions
function getPendingTransactions(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pending-transactions'], 'readonly');
        const store = transaction.objectStore('pending-transactions');
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
