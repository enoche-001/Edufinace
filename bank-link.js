/* =========================================
   EduFinance - Bank link + Bank inbox
   - Profile > "Bank link" card: connect a real account through Mono (use Mono TEST keys until verified)
   - Everything that arrives from a bank (Mono sync, multi-alert paste)
     lands in users/{uid}/bankInbox as "pending". The user reviews, edits and adds it.
   - Banks are READ-ONLY here. This file never sees a bank password or can move money.
   Config lives in bank-config.js. The server that talks to Mono is in /server.
   ========================================= */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var CFG = window.EDU_BANK_CONFIG || {};
    var TEST = /^test_/.test(CFG.monoPublicKey || '');
    var db, auth, uid = null, links = [], inbox = [], unsubL = null, unsubI = null;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]; }); }
    function toast(m, t) { if (window.EduApp) window.EduApp.toast(m, t || 'info'); }
    function money(n) { return window.EduApp ? window.EduApp.money(n) : String(n); }
    function todayStr() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    function userCol(name) { return db.collection('users').doc(uid).collection(name); }

    // ---------- inbox data ----------
    function ledgerRefs() {
        var set = {};
        ((window.EduApp && window.EduApp.transactions()) || []).forEach(function (t) { if (t.bankRef) set[t.bankRef] = 1; });
        return set;
    }
    function pending() {
        var seen = ledgerRefs();
        return inbox.filter(function (x) { return !seen[x.bankRef]; })
            .sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    }

    function addToInbox(list, source) {
        if (!uid) return Promise.resolve();
        var batch = db.batch();
        list.forEach(function (r) {
            // doc id = reference, so the same alert can never be queued twice
            var id = String(r.ref || r.bankRef || Date.now()).replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 60);
            batch.set(userCol('bankInbox').doc(id), {
                amount: r.amount, type: r.type, description: String(r.description || '').slice(0, 80),
                category: r.category || '', date: r.date || todayStr(), bank: String(r.bank || '').slice(0, 30),
                bankRef: id, source: source, status: 'pending', createdAt: new Date().toISOString()
            });
        });
        return batch.commit();
    }

    function suggest(it) {
        return (window.EduSmartAdd && window.EduSmartAdd.learnedCategory(it.description)) || it.category ||
            (window.EduAlertParser ? window.EduAlertParser.guessCategory(it.description, it.type) : '');
    }

    function importItem(it, desc, cat) {
        cat = cat || suggest(it);
        var batch = db.batch();
        var note = it.bank ? 'Via ' + it.bank : '';
        batch.set(userCol('transactions').doc(), {
            type: it.type, amount: it.amount, description: (desc || it.description || 'Bank transaction').slice(0, 80),
            category: cat, note: note, date: it.date, createdAt: new Date().toISOString(),
            source: 'bank', bankRef: it.bankRef
        });
        batch.update(userCol('bankInbox').doc(it.id), { status: 'imported' });
        if (window.EduSmartAdd) window.EduSmartAdd.learn(desc || it.description, cat);
        return batch.commit();
    }
    function skipItem(it) { return userCol('bankInbox').doc(it.id).update({ status: 'skipped' }); }

    // ---------- inbox UI ----------
    function catOptions(type, selected) {
        var list = (window.EduApp.categories || {})[type] || [];
        return list.map(function (c) { return '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    }

    function renderBanner() {
        var b = $('bankInboxBanner'); if (!b) return;
        var n = pending().length;
        b.hidden = n === 0;
        if (n) $('bankInboxBannerText').textContent = n + (n === 1 ? ' new transaction' : ' new transactions') + ' from your bank';
    }

    function renderInbox() {
        renderBanner();
        var box = $('bankInboxList'); if (!box) return;
        var list = pending();
        $('bankInboxAll').hidden = list.length < 2;
        if (!list.length) { box.innerHTML = '<p class="empty">Nothing to review. New bank transactions will show up here.</p>'; return; }
        box.innerHTML = list.map(function (it) {
            var cat = suggest(it);
            return '<div class="bi-item" data-id="' + esc(it.id) + '">' +
                '<div class="bi-top"><b class="bi-amt ' + (it.type === 'income' ? 'income' : 'expense') + '">' + (it.type === 'income' ? '+' : '-') + esc(money(it.amount)) + '</b>' +
                '<span class="bi-meta">' + esc([it.bank, it.date].filter(Boolean).join(' \u00b7 ')) + '</span></div>' +
                '<input type="text" class="form-control bi-desc" maxlength="80" value="' + esc(it.description) + '" aria-label="Description">' +
                '<select class="form-control bi-cat" aria-label="Category">' + catOptions(it.type, cat) + '</select>' +
                '<div class="bi-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="skip">Skip</button>' +
                '<button type="button" class="btn btn-primary btn-sm" data-act="add">Add</button></div></div>';
        }).join('');
    }

    function openInbox() { renderInbox(); window.EduUI.open($('bankInboxSheet')); }

    function bindInbox() {
        var list = $('bankInboxList'); if (!list) return;
        list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-act]'); if (!btn) return;
            var row = btn.closest('.bi-item');
            var it = inbox.filter(function (x) { return x.id === row.dataset.id; })[0]; if (!it) return;
            btn.disabled = true;
            var p = btn.dataset.act === 'add' ? importItem(it, row.querySelector('.bi-desc').value.trim(), row.querySelector('.bi-cat').value) : skipItem(it);
            p.then(function () { toast(btn.dataset.act === 'add' ? 'Added' : 'Skipped', btn.dataset.act === 'add' ? 'success' : 'info'); })
                .catch(function () { btn.disabled = false; toast('Could not save. Check your connection and try again.', 'error'); });
        });
        $('bankInboxAll').addEventListener('click', function () {
            var items = pending(); if (!items.length) return;
            if (!window.confirm('Add all ' + items.length + ' transactions with the suggested categories?')) return;
            Promise.all(items.map(function (it) { return importItem(it); }))
                .then(function () { toast(items.length + ' transactions added', 'success'); })
                .catch(function () { toast('Some items could not be saved', 'error'); });
        });
        var banner = $('bankInboxBanner');
        if (banner) banner.addEventListener('click', openInbox);
    }

    // ---------- bank link card (Profile) + sheet ----------
    function renderCard() {
        var s = $('bankLinkStatus'), b = $('bankLinkBtn'); if (!s || !b) return;
        if (!links.length) { s.textContent = 'No bank linked.'; b.textContent = 'Link a bank account'; }
        else { s.textContent = links.map(function (l) { return l.bank + ' \u2022\u2022' + l.last4; }).join(', '); b.textContent = 'Manage'; }
    }

    function renderLinkSheet() {
        var body = $('bankLinkBody'); if (!body) return;
        var html = '';
        if (TEST) html += '<p class="bl-copy"><i class="demo-tag">Test mode</i> Use the sandbox bank details from Mono. No real bank is contacted.</p>';
        html += links.map(function (l) {
            return '<div class="link-row" data-id="' + esc(l.id) + '"><div><b>' + esc(l.bank) + ' \u2022\u2022' + esc(l.last4) + '</b>' +
                '<small>Read-only. Linked ' + esc(String(l.createdAt || '').slice(0, 10)) + (l.lastSyncedAt ? ' \u00b7 synced ' + esc(String(l.lastSyncedAt).slice(0, 10)) : '') + '</small></div>' +
                '<button type="button" class="btn btn-danger btn-sm" data-act="unlink">Unlink</button></div>';
        }).join('');
        if (links.length) html += '<button type="button" class="btn btn-ghost btn-full" data-act="sync" style="margin-top:12px">Sync now</button>';
        else html += '<p class="text-muted bl-copy">Connect your bank securely through Mono. EduFinance can only read your transactions. It cannot move money and never sees your bank password.</p>';
        html += '<button type="button" class="btn ' + (links.length ? 'link-btn' : 'btn-primary btn-full') + '" data-act="mono">' + (links.length ? 'Link another account' : 'Connect with Mono') + '</button>';
        body.innerHTML = html;
    }

    function openLinkSheet() { renderLinkSheet(); window.EduUI.open($('bankLinkSheet')); }

    // ---------- real mode: Mono Connect + your server ----------
    function api(action, payload) {
        return auth.currentUser.getIdToken().then(function (tok) {
            return fetch(CFG.apiBase.replace(/\/$/, '') + '/api/mono?action=' + action, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(payload || {})
            });
        }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
    }
    var MONO_HOSTS = ['https://connect.mono.co/connect.js', 'https://connect.withmono.com/connect.js'];
    var MONO_ESM = ['https://connect.mono.co/connect.js', 'https://cdn.jsdelivr.net/npm/@mono.co/connect.js/+esm', 'https://esm.sh/@mono.co/connect.js'];
    var monoCtorCache = null;
    function monoCtor() {
        if (monoCtorCache) return monoCtorCache;
        var C = window.Connect || window.MonoConnect;
        if (C && typeof C !== 'function' && typeof C.default === 'function') C = C.default;
        return typeof C === 'function' ? C : null;
    }
    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script'); s.src = src; s.async = true;
            s.onload = function () { monoCtor() ? resolve() : reject(new Error('loaded but no Connect global: ' + src)); };
            s.onerror = function () { s.remove(); reject(new Error('could not fetch ' + src)); };
            document.head.appendChild(s);
        });
    }
    function loadModule(src) {
        return import(src).then(function (m) {
            var C = (m && (m.default || m.Connect)) || null;
            if (C && typeof C !== 'function' && typeof C.default === 'function') C = C.default;
            if (typeof C !== 'function') throw new Error('module has no Connect: ' + src);
            monoCtorCache = C;
        });
    }
    function loadMono() {
        if (monoCtor()) return Promise.resolve();
        var errs = [];
        var tasks = MONO_HOSTS.map(function (u) { return function () { return loadScript(u); }; })
            .concat(MONO_ESM.map(function (u) { return function () { return loadModule(u); }; }));
        var i = 0;
        function next() {
            if (i >= tasks.length) { console.error('[EduBank] Mono load failures', errs); return Promise.reject(new Error('Could not load Mono. ' + (errs[0] || '').slice(0, 90))); }
            return tasks[i++]().catch(function (e) { errs.push(e.message); console.warn('[EduBank]', e.message); return next(); });
        }
        return next();
    }
    var monoBusy = false;
    function startMono() {
        if (monoBusy) return;
        if (!CFG.monoPublicKey || !CFG.apiBase) { toast('Mono is not configured yet. See BANK_SETUP_GUIDE.md', 'error'); return; }
        monoBusy = true; toast('Opening Mono...', 'info');
        var opened = false, timer;
        function done() { monoBusy = false; clearTimeout(timer); }
        loadMono().then(function () {
            var Ctor = monoCtor();
            var connect = new Ctor({
                key: CFG.monoPublicKey,
                onLoad: function () { opened = true; clearTimeout(timer); toast('Mono ready', 'info'); },
                onClose: function () { done(); },
                onEvent: function (name, d) {
                    console.log('[EduBank] mono event', name, d);
                    var n = String(name || '');
                    if (/error|fail|invalid|denied/i.test(n)) toast('Mono: ' + n + (d && (d.errorType || d.message || d.reason) ? ' - ' + (d.errorType || d.message || d.reason) : ''), 'error');
                    else if (n && !/^(OPENED|LOADED)$/i.test(n)) toast('Mono: ' + n, 'info');
                },
                onSuccess: function (data) {
                    done();
                    toast('Linking account', 'info');
                    api('link', { code: data && data.code }).then(function () { toast('Bank linked. Transactions will appear in your inbox.', 'success'); window.EduUI.closeAll(); })
                        .catch(function (e) { toast(e.message, 'error'); });
                }
            });
            // Close our own sheet first: it sits above the Mono widget and hides it.
            window.EduUI.closeAll();
            connect.setup();
            setTimeout(function () { connect.open(); }, 150);
            timer = setTimeout(function () {
                if (!opened) { monoBusy = false; toast('Mono did not open. Domain: ' + location.origin + ' - add it to your Mono app allowed origins, and confirm the test_pk key.', 'error'); }
            }, 9000);
        }).catch(function (e) { done(); console.error('[EduBank]', e); toast(e.message || 'Could not start Mono', 'error'); });
    }

    function bindLinkSheet() {
        var body = $('bankLinkBody'), btn = $('bankLinkBtn');
        if (btn) btn.addEventListener('click', function () { if (window.EduUI.gate('Sign up to link a bank account.')) return; openLinkSheet(); });
        if (!body) return;
        body.addEventListener('click', function (e) {
            var el = e.target.closest('[data-act]'); if (!el) return;
            var act = el.dataset.act;
            if (act === 'mono') startMono();
            else if (act === 'unlink') {
                var row = el.closest('.link-row'); var l = links.filter(function (x) { return x.id === row.dataset.id; })[0]; if (!l) return;
                if (!window.confirm('Unlink ' + l.bank + '? Transactions already added stay in the app.')) return;
                el.disabled = true;
                api('unlink', { linkId: l.id }).then(function () { toast('Unlinked', 'info'); }).catch(function (er) { el.disabled = false; toast(er.message || 'Could not unlink', 'error'); });
            }
            else if (act === 'sync') {
                el.disabled = true;
                api('sync', {}).then(function (r) { toast((r.added || 0) + ' new transactions found', 'success'); el.disabled = false; })
                    .catch(function (er) { toast(er.message, 'error'); el.disabled = false; });
            }
        });
    }

    // ---------- listeners ----------
    function listen(u) {
        if (unsubL) unsubL(); if (unsubI) unsubI();
        links = []; inbox = []; uid = u ? u.uid : null;
        renderCard(); renderBanner();
        if (!uid) return;
        unsubL = userCol('bankLinks').onSnapshot(function (snap) {
            links = []; snap.forEach(function (d) { links.push(Object.assign({ id: d.id }, d.data())); });
            renderCard(); if ($('bankLinkSheet').classList.contains('show')) renderLinkSheet();
        }, function () {});
        unsubI = userCol('bankInbox').where('status', '==', 'pending').onSnapshot(function (snap) {
            inbox = []; snap.forEach(function (d) { inbox.push(Object.assign({ id: d.id }, d.data())); });
            renderBanner(); if ($('bankInboxSheet').classList.contains('show')) renderInbox();
        }, function () {});
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!window.firebase || !firebase.apps.length || !window.EduUI || !window.EduApp) return;
        db = firebase.firestore(); auth = firebase.auth();
        bindInbox(); bindLinkSheet();
        if ($('bankModeTag')) $('bankModeTag').hidden = !TEST;
        window.EduBank = { addToInbox: addToInbox, openInbox: openInbox };
        auth.onAuthStateChanged(listen);
        // re-check duplicates once transactions finish loading
        setTimeout(renderBanner, 2500);
    });
})();
