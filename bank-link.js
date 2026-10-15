/* =========================================
   EduFinance - Bank link + Bank inbox
   - Profile > "Bank link" card: connect an account (DEMO mode now, Mono later)
   - Everything that arrives from a bank (demo alerts, Mono sync, multi-alert paste)
     lands in users/{uid}/bankInbox as "pending". The user reviews, edits and adds it.
   - Banks are READ-ONLY here. This file never sees a bank password or can move money.
   Config lives in bank-config.js. Server side (real mode only) is in /server.
   ========================================= */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var CFG = window.EDU_BANK_CONFIG || { mode: 'demo' };
    var BANKS = ['Opay', 'Kuda', 'Moniepoint', 'PalmPay', 'GTBank', 'Access Bank', 'UBA', 'Zenith Bank', 'First Bank', 'Wema / ALAT'];
    var DEMO_ALERTS = [
        { type: 'expense', amount: 1800, description: 'Bolt ride', category: 'Transport & Transit' },
        { type: 'expense', amount: 12400, description: 'Shoprite Lekki', category: 'Groceries & Food' },
        { type: 'expense', amount: 2000, description: 'MTN data bundle', category: 'Subscriptions & Tech' },
        { type: 'expense', amount: 3500, description: 'Netflix', category: 'Subscriptions & Tech' },
        { type: 'expense', amount: 2500, description: 'Photocopy and printing', category: 'Tuition & Books' },
        { type: 'income', amount: 20000, description: 'From Mum', category: 'Allowance / Parents' },
        { type: 'income', amount: 15000, description: 'From Chinedu Okafor', category: 'Freelance / Side Gig' },
        { type: 'income', amount: 50000, description: 'Part-time job pay', category: 'Part-time Job / Salary' }
    ];

    var db, auth, uid = null, links = [], inbox = [], unsubL = null, unsubI = null, step = 'pick', picked = '';

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
                '<span class="bi-meta">' + esc([it.bank, it.date].filter(Boolean).join(' \u00b7 ')) + (it.source === 'demo' ? ' <i class="demo-tag">Demo</i>' : '') + '</span></div>' +
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
        var active = links.filter(function (l) { return l.status !== 'removed'; });
        if (!active.length) { s.textContent = CFG.mode === 'demo' ? 'No bank linked. Demo mode: nothing real is connected.' : 'No bank linked.'; b.textContent = 'Link a bank account'; }
        else { s.textContent = active.map(function (l) { return l.bank + ' \u2022\u2022' + l.last4 + (l.demo ? ' (demo)' : ''); }).join(', '); b.textContent = 'Manage'; }
    }

    function renderLinkSheet() {
        var body = $('bankLinkBody'); if (!body) return;
        var active = links.filter(function (l) { return l.status !== 'removed'; });
        var html = '';
        if (active.length && step === 'list') {
            html += active.map(function (l) {
                return '<div class="link-row" data-id="' + esc(l.id) + '"><div><b>' + esc(l.bank) + ' \u2022\u2022' + esc(l.last4) + '</b>' +
                    '<small>' + (l.demo ? '<i class="demo-tag">Demo</i> ' : '') + 'Read-only. Linked ' + esc(String(l.createdAt || '').slice(0, 10)) + '</small></div>' +
                    '<button type="button" class="btn btn-danger btn-sm" data-act="unlink">Unlink</button></div>';
            }).join('');
            if (active.some(function (l) { return l.demo; })) {
                html += '<div class="link-demo"><span class="field-label">Try it: send a test bank alert</span>' +
                    '<div class="demo-btns"><button type="button" class="btn btn-ghost btn-sm" data-act="sim" data-kind="expense">Money out</button>' +
                    '<button type="button" class="btn btn-ghost btn-sm" data-act="sim" data-kind="income">Money in</button>' +
                    '<button type="button" class="btn btn-ghost btn-sm" data-act="sim" data-kind="both">Send 3</button></div>' +
                    '<small class="text-muted">The alert appears in your bank inbox in a moment. This is fake data for testing.</small></div>';
            }
            if (CFG.mode === 'mono') html += '<button type="button" class="btn btn-ghost btn-full" data-act="sync">Sync now</button>';
            html += '<button type="button" class="link-btn" data-act="addmore">Link another account</button>';
        } else if (CFG.mode === 'mono') {
            html += '<p class="text-muted bl-copy">Connect your bank securely through Mono. EduFinance can only read your transactions. It cannot move money and never sees your bank password.</p>' +
                '<button type="button" class="btn btn-primary btn-full" data-act="mono">Connect with Mono</button>';
        } else if (step === 'consent') {
            html += '<p class="bl-copy"><b>' + esc(picked) + '</b> (demo)</p>' +
                '<ul class="bl-list"><li>EduFinance can read transactions only</li><li>It cannot move money</li><li>You can unlink at any time</li></ul>' +
                '<p class="text-muted bl-copy">Demo mode: no real bank is contacted. Test alerts are created for you.</p>' +
                '<button type="button" class="btn btn-primary btn-full" data-act="confirm">Link ' + esc(picked) + ' (demo)</button>' +
                '<button type="button" class="link-btn" data-act="back">Choose another bank</button>';
        } else {
            html += '<p class="text-muted bl-copy">Pick your bank. Demo mode: nothing real is connected.</p><div class="bank-grid">' +
                BANKS.map(function (n) { return '<button type="button" class="bank-pick" data-act="pick" data-bank="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>';
        }
        body.innerHTML = html;
    }

    function openLinkSheet() {
        step = links.some(function (l) { return l.status !== 'removed'; }) ? 'list' : 'pick';
        renderLinkSheet(); window.EduUI.open($('bankLinkSheet'));
    }

    function simulate(kind) {
        var pool = DEMO_ALERTS.filter(function (a) { return kind === 'both' || a.type === kind; });
        var n = kind === 'both' ? 3 : 1, picks = [];
        while (picks.length < n) { var a = pool[Math.floor(Math.random() * pool.length)]; if (picks.indexOf(a) === -1) picks.push(a); }
        var bank = (links.filter(function (l) { return l.demo; })[0] || {}).bank || 'Demo Bank';
        var items = picks.map(function (a, i) {
            return { amount: a.amount, type: a.type, description: a.description, category: a.category, date: todayStr(), bank: bank, ref: 'demo' + Date.now().toString(36) + i + Math.floor(Math.random() * 1e4) };
        });
        toast('Sending test alert', 'info');
        setTimeout(function () {
            addToInbox(items, 'demo').then(function () { toast('New transaction from ' + bank, 'success'); window.EduUI.closeAll(); })
                .catch(function () { toast('Could not send the test alert', 'error'); });
        }, 1200);
    }

    // ---------- real mode: Mono Connect + your server ----------
    function api(action, payload) {
        return auth.currentUser.getIdToken().then(function (tok) {
            return fetch(CFG.apiBase.replace(/\/$/, '') + '/api/mono?action=' + action, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(payload || {})
            });
        }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
    }
    function loadMono() {
        return new Promise(function (resolve, reject) {
            if (window.Connect) return resolve();
            var s = document.createElement('script'); s.src = 'https://connect.withmono.com/connect.js';
            s.onload = resolve; s.onerror = function () { reject(new Error('Could not load Mono. Check your internet.')); };
            document.head.appendChild(s);
        });
    }
    function startMono() {
        if (!CFG.monoPublicKey || !CFG.apiBase) { toast('Mono is not configured yet. See BANK_SETUP_GUIDE.md', 'error'); return; }
        loadMono().then(function () {
            var connect = new window.Connect({
                key: CFG.monoPublicKey,
                onSuccess: function (data) {
                    toast('Linking account', 'info');
                    api('link', { code: data && data.code }).then(function () { toast('Bank linked. Transactions will appear in your inbox.', 'success'); window.EduUI.closeAll(); })
                        .catch(function (e) { toast(e.message, 'error'); });
                }
            });
            connect.setup(); connect.open();
        }).catch(function (e) { toast(e.message, 'error'); });
    }

    function bindLinkSheet() {
        var body = $('bankLinkBody'), btn = $('bankLinkBtn');
        if (btn) btn.addEventListener('click', function () { if (window.EduUI.gate('Sign up to link a bank account.')) return; openLinkSheet(); });
        if (!body) return;
        body.addEventListener('click', function (e) {
            var el = e.target.closest('[data-act]'); if (!el) return;
            var act = el.dataset.act;
            if (act === 'pick') { picked = el.dataset.bank; step = 'consent'; renderLinkSheet(); }
            else if (act === 'back') { step = 'pick'; renderLinkSheet(); }
            else if (act === 'addmore') { picked = ''; if (CFG.mode === 'mono') startMono(); else { step = 'pick'; renderLinkSheet(); } }
            else if (act === 'confirm') {
                el.disabled = true;
                step = 'list';      // set first: the snapshot listener re-renders as soon as the write lands locally
                userCol('bankLinks').add({ bank: picked, last4: String(Math.floor(1000 + Math.random() * 9000)), demo: true, status: 'active', createdAt: new Date().toISOString() })
                    .then(function () { toast('Demo bank linked', 'success'); renderLinkSheet(); })
                    .catch(function () { step = 'consent'; renderLinkSheet(); toast('Could not link. Check your connection.', 'error'); });
            }
            else if (act === 'unlink') {
                var row = el.closest('.link-row'); var l = links.filter(function (x) { return x.id === row.dataset.id; })[0]; if (!l) return;
                if (!window.confirm('Unlink ' + l.bank + '? Past transactions you added stay in the app.')) return;
                var p = l.demo ? userCol('bankLinks').doc(l.id).delete() : api('unlink', { linkId: l.id });
                p.then(function () { toast('Unlinked', 'info'); }).catch(function (er) { toast(er.message || 'Could not unlink', 'error'); });
            }
            else if (act === 'sim') simulate(el.dataset.kind);
            else if (act === 'mono') startMono();
            else if (act === 'sync') { el.disabled = true; api('sync', {}).then(function (r) { toast((r.added || 0) + ' new transactions found', 'success'); el.disabled = false; }).catch(function (er) { toast(er.message, 'error'); el.disabled = false; }); }
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
        if (CFG.mode === 'mono' && $('bankDemoTag')) $('bankDemoTag').hidden = true;
        window.EduBank = { addToInbox: addToInbox, openInbox: openInbox };
        auth.onAuthStateChanged(listen);
        // re-check duplicates once transactions finish loading
        setTimeout(renderBanner, 2500);
    });
})();
