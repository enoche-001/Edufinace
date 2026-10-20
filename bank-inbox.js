/* =========================================
   SteadyScale - Bank inbox
   - Alerts pasted from the Add screen (several at once) land in users/{uid}/bankInbox as "pending".
     The user reviews, edits and adds each one. Nothing is read from any bank.
   ========================================= */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var db, auth, uid = null, inbox = [], unsubI = null;

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

    // ---------- listeners ----------
    function listen(u) {
        if (unsubI) unsubI();
        inbox = []; uid = u ? u.uid : null;
        renderBanner();
        if (!uid) return;
        unsubI = userCol('bankInbox').where('status', '==', 'pending').onSnapshot(function (snap) {
            inbox = []; snap.forEach(function (d) { inbox.push(Object.assign({ id: d.id }, d.data())); });
            renderBanner(); if ($('bankInboxSheet').classList.contains('show')) renderInbox();
        }, function () {});
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!window.firebase || !firebase.apps.length || !window.EduUI || !window.EduApp) return;
        db = firebase.firestore(); auth = firebase.auth();
        bindInbox();
        window.EduBank = { addToInbox: addToInbox, openInbox: openInbox };
        auth.onAuthStateChanged(listen);
        // re-check duplicates once transactions finish loading
        setTimeout(renderBanner, 2500);
    });
})();
