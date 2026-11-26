// AquaNode service worker. It exists so the Dashboard can be installed as an app.
// It deliberately caches nothing: every Reading must be live, so a stale offline copy would mislead.
// Push notifications for Alerts (stretch goal) will be handled here later.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
