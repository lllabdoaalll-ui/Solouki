/* Solouki STEP 52 — offline shell + safe cache-first static assets */
const CACHE_NAME = 'solouki-static-v4.59.0';
const APP_SHELL = [
  './', './index.html', './dashboard.html', './students.html',
  './merits.html', './student-report.html', './analytics.html', './backup.html', './audit.html', './catalog.html',
  './notifications.html', './whatsapp-settings.html', './guardian.html', './roles.html', './report-settings.html',
  './change-password.html', './reset-password.html', './offline.html',
  './css/style.css', './css/auth.css', './css/students.css', './css/violations.css',
  './css/guardian.css', './css/student-report.css', './css/catalog.css', './css/roles.css',
  './css/analytics.css', './css/backup.css', './css/audit.css', './css/whatsapp-settings.css', './css/print-official.css',
  './js/config.js', './js/auth.js', './js/guardian.js', './js/students.js', './js/violations.js',
  './js/merits.js', './js/student-report.js', './js/analytics.js', './js/catalog.js',
  './js/notifications.js', './js/whatsapp-settings.js', './js/roles.js', './js/report-settings.js',
  './js/core/utils.js', './js/core/audit.js', './js/core/supabase-client.js', './js/core/session.js', './js/core/permissions.js',
  './js/pwa.js', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache Supabase/CDN responses here
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res.ok && (req.destination === 'document' || ['style','script','image','font'].includes(req.destination))) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached || caches.match('./offline.html'));
      return cached || network;
    })
  );
});
