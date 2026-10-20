/**
 * Service Worker VIP Connect
 * Gère le cache, les notifications d'écran sur smartphone (Push & Locales)
 * et les rappels de départ.
 */

const CACHE_NAME = 'vip-connect-v2';
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/supabase-client.js',
    '/html2pdf.bundle.min.js',
    '/manifest.json',
    '/images/vip_connect_logo.png'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS).catch((err) => {
                console.warn('[SW] Cache non-bloquant des assets statiques:', err);
            });
        })
    );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interception réseau avec stratégie Network-First (données fraîches en priorité)
self.addEventListener('fetch', (event) => {
    // Ne pas intercepter les requêtes API ou Supabase
    if (event.request.url.includes('/api/') || event.request.url.includes('supabase.co')) {
        return;
    }
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

// Gestion des Notifications Push du Serveur
self.addEventListener('push', (event) => {
    let data = {
        title: 'VIP Connect',
        body: 'Nouvelle notification concernant votre voyage VIP Connect.',
        icon: '/images/vip_connect_logo.png',
        badge: '/images/vip_connect_logo.png',
        tag: 'vip-connect-push'
    };

    if (event.data) {
        try {
            data = Object.assign(data, event.data.json());
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/images/vip_connect_logo.png',
        badge: data.badge || '/images/vip_connect_logo.png',
        vibrate: [300, 100, 300, 100, 300],
        tag: data.tag || 'vip-connect-general',
        renotify: true,
        data: data.data || {},
        actions: [
            { action: 'open_ticket', title: 'Voir mon Billet' },
            { action: 'close', title: 'Fermer' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Clic sur la notification sur l'écran du smartphone
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // Ouvrir ou focaliser l'application sur le téléphone
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if ('focus' in client) {
                    client.postMessage({
                        type: 'NOTIFICATION_CLICKED',
                        data: event.notification.data
                    });
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/#sec-dashboard');
            }
        })
    );
});
