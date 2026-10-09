/* EduFinance public site - site.js: nav, mobile menu, FAQ, reveal, counters, carousel, TOC */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sticky nav state
  var nav = d.querySelector('.nav');
  function onScroll() { if (nav) nav.classList.toggle('scrolled', window.scrollY > 8); }
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile drawer
  var burger = d.getElementById('burger'), drawer = d.getElementById('drawer');
  function setMenu(open) {
    if (!burger || !drawer) return;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.classList.toggle('open', open);
    d.body.classList.toggle('lock', open);
    if (open) { var f = drawer.querySelector('a'); if (f) setTimeout(function () { f.focus(); }, 60); }
  }
  if (burger && drawer) {
    burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
    drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) { setMenu(false); burger.focus(); } });
    window.addEventListener('resize', function () { if (window.innerWidth > 1100) setMenu(false); });
  }

  // FAQ accordion
  d.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-i'), open = !item.classList.contains('open');
      item.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  function openFaqFromHash() {
    if (!location.hash) return;
    var t = d.querySelector(location.hash + '.faq-i, ' + location.hash);
    var item = t && t.classList && t.classList.contains('faq-i') ? t : null;
    if (item) { item.classList.add('open'); var b = item.querySelector('.faq-q'); if (b) b.setAttribute('aria-expanded', 'true'); }
  }
  openFaqFromHash(); window.addEventListener('hashchange', openFaqFromHash);

  // Reveal on scroll
  var rev = d.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduce) {
    rev.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    rev.forEach(function (el) { io.observe(el); });
  }

  // Counters
  function fmt(n, el) { return (el.dataset.prefix || '') + Math.round(n).toLocaleString('en-US') + (el.dataset.suffix || ''); }
  var cts = d.querySelectorAll('[data-count]');
  function run(el) {
    var to = parseFloat(el.dataset.count);
    if (reduce) { el.textContent = fmt(to, el); return; }
    var t0 = null, dur = 1400;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e, el);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window && !reduce) {
    var co = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { run(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.4 });
    cts.forEach(function (el) { co.observe(el); });
  } else { cts.forEach(run); }

  // Preview carousel buttons
  var row = d.getElementById('prevRow');
  if (row) {
    var go = function (dir) {
      var it = row.querySelector('.prev-item');
      var w = it ? it.getBoundingClientRect().width + 24 : 240;
      row.scrollBy({ left: dir * w, behavior: reduce ? 'auto' : 'smooth' });
    };
    var p = d.getElementById('prevBtn'), n = d.getElementById('nextBtn');
    if (p) p.addEventListener('click', function () { go(-1); });
    if (n) n.addEventListener('click', function () { go(1); });
  }

  // Active in-page section link + legal TOC highlight
  var links = d.querySelectorAll('.toc a, .nav-links a[data-spy]');
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (a) { var h = a.getAttribute('href'); if (h && h.indexOf('#') > -1) map[h.slice(h.indexOf('#') + 1)] = a; });
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && map[e.target.id]) {
          links.forEach(function (a) { a.classList.remove('active'); a.removeAttribute('aria-current'); });
          map[e.target.id].classList.add('active');
          if (map[e.target.id].closest('.toc')) map[e.target.id].setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    Object.keys(map).forEach(function (id) { var s = d.getElementById(id); if (s) so.observe(s); });
  }

  var y = d.getElementById('yr'); if (y) y.textContent = new Date().getFullYear();
})();
