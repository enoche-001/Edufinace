/* SteadyScale PWA helper. Loaded on every page.
   - registers the service worker (updates apply silently, no update prompt anywhere)
   - install prompt (Android/desktop) + Add to Home Screen help (iOS)
   - marks installed mode with html.is-standalone
   - online/offline pill
   Public API: window.EduPWA = { isStandalone, canInstall(), install(), isIOS }
   Hook: any element with [data-pwa-install] is shown when install is possible and triggers it. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var DISMISS_KEY = 'edu_pwa_banner_dismissed';

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var standalone = (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) ||
    w.navigator.standalone === true || (d.referrer || '').indexOf('android-app://') === 0;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (standalone) {
    root.classList.add('is-standalone');
    // Inside the installed app, "home" links go straight into the app (never the marketing landing page)
    d.addEventListener('DOMContentLoaded', function () {
      var home = get('edu_is_logged_in') === 'true' ? 'dashboard.html' : 'login.html';
      var a = d.querySelectorAll('a[href="index.html"], a[href^="index.html#"]');
      for (var i = 0; i < a.length; i++) a[i].setAttribute('href', home);
    });
  }

  var deferred = null;
  var api = w.EduPWA = {
    isStandalone: standalone,
    isIOS: isIOS,
    canInstall: function () { return !standalone && (!!deferred || isIOS); },
    install: function () {
      if (deferred) {
        var p = deferred; deferred = null;
        p.prompt();
        return p.userChoice.then(function (c) { refresh(); return c.outcome; });
      }
      if (isIOS && !standalone) { showIOSHelp(); }
      return Promise.resolve('unavailable');
    }
  };

  /* ---------- service worker (silent updates, no prompt) ---------- */
  // A new version is applied only while the app is in the background, so nothing ever
  // interrupts the person or reloads a page they are using.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    var swReg = null, reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading || !d.hidden) return;
      reloading = true; location.reload();
    });
    w.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        swReg = reg;
        function watch(sw) {
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller && d.hidden) sw.postMessage('SKIP_WAITING');
          });
        }
        reg.addEventListener('updatefound', function () { if (reg.installing) watch(reg.installing); });
        d.addEventListener('visibilitychange', function () {
          if (d.hidden) { if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); }
          else reg.update().catch(function () {});
        });
      }).catch(function () {});
    });
  }

  /* ---------- tiny UI helpers ---------- */
  function el(html) { var t = d.createElement('div'); t.innerHTML = html.trim(); return t.firstChild; }
  var pill;
  function netPill() {
    if (!pill) {
      pill = el('<div class="pwa-net" role="status" aria-live="polite"><span class="pwa-net-t"></span><button type="button" class="pwa-net-x" aria-label="Dismiss">&times;</button></div>');
      pill.querySelector('.pwa-net-x').onclick = function () { pill.className = 'pwa-net'; };
      d.body.appendChild(pill);
    }
    return pill;
  }
  // Stays visible until dismissed (no auto-hide); never blocks the page
  function netChange() {
    var p = netPill(), t = p.querySelector('.pwa-net-t');
    if (navigator.onLine) { t.textContent = 'Back online'; p.className = 'pwa-net show ok'; }
    else { t.textContent = "You're offline"; p.className = 'pwa-net show'; }
  }
  w.addEventListener('online', netChange); w.addEventListener('offline', netChange);
  d.addEventListener('DOMContentLoaded', function () { if (!navigator.onLine) netChange(); });

  /* ---------- install ---------- */
  function showIOSHelp() {
    if (d.getElementById('pwaIOS')) return;
    var n = el('<div class="pwa-sheet-bg" id="pwaIOS"><div class="pwa-sheet" role="dialog" aria-label="Install SteadyScale">' +
      '<button type="button" class="pwa-sheet-x" aria-label="Close">&times;</button>' +
      '<b>Install SteadyScale</b><p>Tap the <em>Share</em> button in Safari, then choose <em>Add to Home Screen</em>.</p>' +
      '<button type="button" class="pwa-sheet-ok">Got it</button></div></div>');
    function closeSheet() { n.remove(); d.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') closeSheet(); }
    n.onclick = function (e) { if (e.target === n || e.target.tagName === 'BUTTON') closeSheet(); };
    d.addEventListener('keydown', onKey);
    d.body.appendChild(n);
  }

  function refresh() {
    var can = api.canInstall();
    var list = d.querySelectorAll('[data-pwa-install]');
    for (var i = 0; i < list.length; i++) list[i].hidden = !can;
  }
  d.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-pwa-install]');
    if (t) { e.preventDefault(); api.install(); }
  });

  w.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; refresh(); scheduleBanner();
  });
  w.addEventListener('appinstalled', function () {
    deferred = null; refresh();
    var b = d.getElementById('pwaBanner'); if (b) b.remove();
  });
  d.addEventListener('DOMContentLoaded', function () { refresh(); if (isIOS) scheduleBanner(); });

  // Gentle banner on public/app pages (never in the installed app, admin or login)
  var bannerDone = false;
  function scheduleBanner() {
    if (bannerDone || standalone) return;
    if (/admin|login|start|offline/i.test(location.pathname)) return;
    var t = parseInt(get(DISMISS_KEY) || '0', 10);
    if (t && Date.now() - t < 7 * 864e5) return;
    bannerDone = true;
    setTimeout(function () {
      if (!api.canInstall() || d.getElementById('pwaBanner')) return;
      var b = el('<div class="pwa-banner" id="pwaBanner"><img src="icons/icon-192.png" alt="" width="40" height="40">' +
        '<div><b>Install SteadyScale</b><span>Open it like an app, even offline.</span></div>' +
        '<button type="button" class="pwa-go">Install</button><button type="button" class="pwa-x" aria-label="Dismiss">&times;</button></div>');
      b.querySelector('.pwa-go').onclick = function () { b.remove(); api.install(); };
      b.querySelector('.pwa-x').onclick = function () { set(DISMISS_KEY, String(Date.now())); b.classList.remove('in'); setTimeout(function () { b.remove(); }, 250); };
      d.body.appendChild(b);
      requestAnimationFrame(function () { b.classList.add('in'); });
    }, 6000);
  }
})();
