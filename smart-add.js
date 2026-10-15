/* =========================================
   EduFinance - Smart add
   1. "Paste bank alert" button + paste box in the Add transaction form
   2. One-tap banner when a bank alert is on the clipboard (after the user allowed clipboard access once)
   3. Share target: share an SMS / email to the installed app (see sw.js and manifest.webmanifest)
   Everything fills the normal Add form, so the user can edit before saving.
   Needs: alert-parser.js, app.js (window.EduApp), sheets.js (window.EduUI)
   ========================================= */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var LEARN_KEY = 'edu_alert_cat_v1';
    var LAST_CLIP_KEY = 'edu_last_clip_v1';

    document.addEventListener('DOMContentLoaded', function () {
        var form = $('quickAddForm');
        if (!form || !window.EduAlertParser || !window.EduApp || !window.EduUI) return;

        var P = window.EduAlertParser;
        var pasteBtn = $('pasteAlertBtn'), manual = $('pasteManual'), area = $('pasteAlertText'), result = $('pasteResult');
        var srcField = $('transSource'), refField = $('transBankRef');
        var clipBanner = $('clipBanner');
        var pendingShared = null;
        var isPhone = window.matchMedia('(max-width: 768px)');

        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]; }); }
        function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); }

        // ---------- remembered categories (merchant -> category the user picked) ----------
        function learnKey(desc) {
            return String(desc || '').toLowerCase().replace(/^(transfer to|transfer from|to|from)\s+/, '').replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ');
        }
        function readLearned() { try { return JSON.parse(localStorage.getItem(LEARN_KEY) || '{}'); } catch (e) { return {}; } }
        function learn(desc, cat) {
            var k = learnKey(desc); if (!k || k.length < 3) return;
            var m = readLearned(); m[k] = cat;
            var keys = Object.keys(m); if (keys.length > 300) delete m[keys[0]];
            try { localStorage.setItem(LEARN_KEY, JSON.stringify(m)); } catch (e) {}
        }
        function learnedCategory(desc) { return readLearned()[learnKey(desc)] || ''; }
        window.EduSmartAdd = { learnedCategory: learnedCategory, learn: learn };

        // ---------- duplicate check ----------
        function looksDuplicate(r) {
            var list = window.EduApp.transactions() || [];
            return list.some(function (t) {
                return (t.bankRef && t.bankRef === r.ref) ||
                    (t.type === r.type && Math.abs(t.amount - r.amount) < 0.005 && t.date === r.date);
            });
        }

        // ---------- fill the form ----------
        function setVal(id, v) { var el = $(id); if (el) el.value = v; }

        function fill(r) {
            var segBtn = form.querySelector('#transTypeSeg .seg-btn[data-type="' + r.type + '"]');
            if (segBtn) segBtn.click();                       // switches type and reloads the category list
            setVal('transAmount', r.amount);
            setVal('transDesc', r.description);
            var cat = learnedCategory(r.description) || r.category;
            var sel = $('transCategory');
            if (sel && Array.prototype.some.call(sel.options, function (o) { return o.value === cat; })) sel.value = cat;
            setVal('transDate', r.date);
            var note = [r.bank ? 'Via ' + r.bank : '', r.time].filter(Boolean).join(' \u00b7 ');
            setVal('transNote', note);
            var fold = form.querySelector('.optional-fold'); if (fold && note) fold.open = true;
            if (srcField) srcField.value = 'alert';
            if (refField) refField.value = r.ref;
            showResult(r);
        }

        function showResult(r) {
            if (!result) return;
            var dup = looksDuplicate(r);
            var amt = window.EduApp.money(r.amount);
            result.hidden = false;
            result.className = 'paste-result ' + (r.type === 'income' ? 'is-income' : 'is-expense');
            result.innerHTML =
                '<b>' + (r.type === 'income' ? 'Money in' : 'Money out') + ' \u00b7 ' + esc(amt) + '</b>' +
                '<span>' + esc([r.bank, r.dateFound ? r.date : 'today'].filter(Boolean).join(' \u00b7 ')) + '. Check the fields below, then tap Add.</span>' +
                (r.confidence !== 'high' ? '<span class="paste-warn">Not sure about this one. Please double check.</span>' : '') +
                (dup ? '<span class="paste-warn">You may have already added this transaction.</span>' : '');
        }

        function clearResult() {
            if (result) { result.hidden = true; result.innerHTML = ''; }
            if (srcField) srcField.value = '';
            if (refField) refField.value = '';
            if (area) area.value = '';
        }

        function bringFormIntoView() {
            if (isPhone.matches) {
                var fab = $('fabAdd');
                var sheet = $('quickAddSheet');
                if (fab && sheet && !sheet.classList.contains('show')) fab.click();
            } else {
                window.EduUI.goTo('dashboard');
                var card = form.closest('.card');
                if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        // ---------- main entry ----------
        function handleText(text, opts) {
            opts = opts || {};
            var list = P.parseMany(text);
            if (!list.length) {
                if (manual) manual.hidden = false;
                if (result) {
                    result.hidden = false; result.className = 'paste-result is-error';
                    result.innerHTML = '<b>No amount found</b><span>That text does not look like a bank alert. Paste the full alert, or fill the form yourself.</span>';
                }
                return false;
            }
            if (list.length > 1 && window.EduBank && window.EduUI.isSignedIn()) {
                window.EduBank.addToInbox(list, 'alert').then(function () {
                    window.EduApp.toast(list.length + ' alerts added to your bank inbox', 'success');
                    window.EduBank.openInbox();
                });
                return true;
            }
            if (opts.reveal) bringFormIntoView();
            fill(list[0]);
            return true;
        }
        window.EduSmartAdd.handleText = handleText;

        // ---------- paste button + paste box ----------
        if (pasteBtn) pasteBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (t) {
                    if (t && t.trim()) { try { localStorage.setItem(LAST_CLIP_KEY, hash(t)); } catch (e) {} handleText(t); }
                    else { window.EduApp.toast('Copy your bank alert first', 'info'); if (manual) manual.hidden = false; }
                }).catch(function () { if (manual) { manual.hidden = false; area.focus(); } });
            } else if (manual) { manual.hidden = false; area.focus(); }
        });

        if (area) {
            var t = null;
            area.addEventListener('paste', function () { setTimeout(function () { if (area.value.trim()) handleText(area.value); }, 30); });
            area.addEventListener('input', function () {
                clearTimeout(t);
                t = setTimeout(function () { if (area.value.trim().length > 20) handleText(area.value); }, 700);
            });
        }

        // ---------- remember the category the user chose; reset after saving ----------
        form.addEventListener('submit', function () {
            if (!window.EduUI.isSignedIn()) return;
            if (srcField && srcField.value === 'alert') {
                var d = $('transDesc').value.trim(), c = $('transCategory').value;
                if (d && c) learn(d, c);
            }
            setTimeout(function () { clearResult(); if (manual) manual.hidden = true; }, 400);
        });

        // ---------- clipboard banner (only when clipboard access was already granted) ----------
        function hideClip() { if (clipBanner) clipBanner.hidden = true; }
        function checkClipboard() {
            if (!clipBanner || document.visibilityState !== 'visible') return;
            if (!window.EduUI.isSignedIn()) return;
            if (!navigator.clipboard || !navigator.clipboard.readText || !navigator.permissions) return;
            navigator.permissions.query({ name: 'clipboard-read' }).then(function (p) {
                if (p.state !== 'granted') return;
                return navigator.clipboard.readText().then(function (txt) {
                    if (!txt || !P.looksLikeAlert(txt)) return;
                    var h = hash(txt), last = null;
                    try { last = localStorage.getItem(LAST_CLIP_KEY); } catch (e) {}
                    if (h === last) return;
                    var r = P.parse(txt);
                    $('clipBannerText').textContent = (r.type === 'income' ? 'Money in ' : 'Money out ') + window.EduApp.money(r.amount) + ' copied';
                    clipBanner.hidden = false;
                    clipBanner._text = txt; clipBanner._hash = h;
                });
            }).catch(function () {});
        }
        if (clipBanner) {
            $('clipUse').addEventListener('click', function () {
                var txt = clipBanner._text; try { localStorage.setItem(LAST_CLIP_KEY, clipBanner._hash); } catch (e) {}
                hideClip(); if (txt) handleText(txt, { reveal: true });
            });
            $('clipDismiss').addEventListener('click', function () {
                try { localStorage.setItem(LAST_CLIP_KEY, clipBanner._hash); } catch (e) {}
                hideClip();
            });
        }
        document.addEventListener('visibilitychange', checkClipboard);
        window.addEventListener('focus', checkClipboard);
        setTimeout(checkClipboard, 2500);

        // ---------- share target (text saved by sw.js in Cache Storage, never sent over the network) ----------
        function authReady() { return document.body.classList.contains('is-user') || document.body.classList.contains('is-guest'); }
        function processShared() {
            if (!pendingShared || !authReady()) return;
            var txt = pendingShared; pendingShared = null;
            handleText(txt, { reveal: true });
        }
        if (/[?&]shared=1/.test(location.search) && window.caches) {
            try { history.replaceState(null, '', location.pathname); } catch (e) {}
            caches.open('edu-share').then(function (c) {
                var key = new Request(new URL('edu-share-pending', location.href.replace(/[^/]*$/, '')).href);
                return c.match(key).then(function (res) {
                    if (!res) return;
                    return res.json().then(function (o) {
                        c.delete(key);
                        if (o && o.t && Date.now() - o.at < 6 * 3600 * 1000) { pendingShared = o.t; processShared(); }
                    });
                });
            }).catch(function () {});
            new MutationObserver(processShared).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
    });
})();
