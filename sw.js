/* EduFinance service worker: offline app shell + safe runtime caching.
   Bump VERSION whenever you deploy changed files so installed apps update. */
const VERSION = 'edufinance-v1.1.3';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

const CORE = [
  'start.html', 'login.html', 'dashboard.html', 'offline.html',
  'style.css', 'dashboard.css', 'site.css', 'pwa.css',
  'app.js', 'auth.js', 'demo-data.js', 'sheets.js', 'currency.js', 'geminiapi.js', 'intelligence.js',
  'insights-ai.js', 'onboarding.js', 'mobile-nav.js', 'debts.js', 'badges.js', 'security-lock.js', 'pwa.js',
  'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

// Third-party files fetched once at install so the app also works offline on the very first visit.
const CDN_PRECACHE = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// Third-party static hosts that are safe to cache (fonts, icon font, Firebase SDK files).
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'www.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // One bad URL must not break the whole install.
    await Promise.allSettled(CORE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    const r = await caches.open(RUNTIME);
    await Promise.allSettled(CDN_PRECACHE.map(async (u) => { r.put(u, await fetch(u, { mode: 'no-cors' })); }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (_) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function staleWhileRevalidate(req, cacheName, ignoreSearch) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: !!ignoreSearch });
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

async function navigate(e) {
  const req = e.request;
  try {
    const pre = e.preloadResponse && await e.preloadResponse;
    const res = pre || await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))
    ]);
    if (res && res.ok) { const c = await caches.open(RUNTIME); c.put(req, res.clone()); }
    return res;
  } catch (_) {
    const c = await caches.match(req, { ignoreSearch: true });
    return c || (await caches.match('offline.html')) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch admin pages, Firebase/Google APIs, AI or payment calls.
  if (url.origin === location.origin && /admin/i.test(url.pathname)) return;

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') { e.respondWith(navigate(e)); return; }
    e.respondWith(staleWhileRevalidate(req, SHELL, true));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, RUNTIME, false));
  }
  // everything else (Firestore, Auth, Gemini, Paystack...) goes straight to the network
});
