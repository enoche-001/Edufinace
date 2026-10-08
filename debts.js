// Owe / Owed tracker. Data lives in users/{uid}/debts
(function () {
    const $ = (id) => document.getElementById(id);
    const db = firebase.firestore();
    let uid = null, items = [], currency = 'NGN', dir = 'owed_to_me', unsubD = null, unsubP = null;

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const money = (n) => (window.EduCurrency ? EduCurrency.format(n, currency) : String(n));
    const remaining = (d) => Math.max(0, d.amount - (d.paid || 0));
    const col = () => db.collection('users').doc(uid).collection('debts');
    const toast = (m) => { const t = document.createElement('div'); t.className = 'edu-mini-toast show'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); };

    function waLink(d) {
        let num = (d.phone || '').replace(/[^\d]/g, '');
        if (num.length === 11 && num[0] === '0') num = '234' + num.slice(1);
        const msg = 'Hi ' + d.person + ', a quick reminder about the ' + money(remaining(d)) + ' you owe me' +
            (d.note ? ' for ' + d.note : '') + '. Please send when you can. Thanks! 🙏';
        return 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
    }

    function dueBadge(d) {
        if (!d.due) return '';
        const today = new Date().toISOString().slice(0, 10);
        const over = d.due < today;
        return '<span class="debt-due' + (over ? ' over' : '') + '"><i class="fa-regular fa-clock"></i> ' + (over ? 'Overdue · ' : 'Due ') + esc(d.due) + '</span>';
    }

    function row(d) {
        const left = remaining(d), pct = d.amount ? Math.min(100, ((d.paid || 0) / d.amount) * 100) : 0;
        const owed = d.direction === 'owed_to_me';
        return '<div class="debt-item ' + (owed ? 'owed' : 'owe') + '" data-id="' + esc(d.id) + '">' +
            '<div class="debt-main"><div class="debt-avatar">' + esc(d.person.charAt(0).toUpperCase()) + '</div>' +
            '<div class="debt-info"><strong>' + esc(d.person) + '</strong>' +
            '<small>' + (owed ? 'owes you' : 'you owe') + (d.note ? ' · ' + esc(d.note) : '') + '</small>' + dueBadge(d) + '</div>' +
            '<div class="debt-amt">' + money(left) + '</div></div>' +
            (d.paid ? '<div class="debt-progress"><span style="width:' + pct + '%"></span></div><small class="text-muted">' + money(d.paid) + ' of ' + money(d.amount) + ' paid</small>' : '') +
            '<div class="debt-actions">' +
            (owed ? '<a class="btn btn-small btn-success" target="_blank" rel="noopener" href="' + waLink(d) + '"><i class="fa-brands fa-whatsapp"></i> Remind</a>' : '') +
            '<button type="button" class="btn btn-small btn-secondary-outline" data-act="part">Part payment</button>' +
            '<button type="button" class="btn btn-small btn-primary" data-act="settle">Settled</button>' +
            '<button type="button" class="btn btn-small btn-danger-outline" data-act="del" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</div></div>';
    }

    function render() {
        const active = items.filter(d => !d.settled).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.createdAt.localeCompare(a.createdAt));
        const done = items.filter(d => d.settled).sort((a, b) => (b.settledAt || '').localeCompare(a.settledAt || ''));
        const sum = (dir) => active.filter(d => d.direction === dir).reduce((s, d) => s + remaining(d), 0);
        $('debtOwedTotal').textContent = money(sum('owed_to_me'));
        $('debtOweTotal').textContent = money(sum('i_owe'));
        $('debtActiveList').innerHTML = active.length ? active.map(row).join('') :
            '<p class="text-muted text-center py-3">Nothing here. Add someone who owes you, or someone you owe.</p>';
        $('debtSettledList').innerHTML = done.length ? done.map(d =>
            '<div class="debt-done"><span>' + esc(d.person) + ' · ' + (d.direction === 'owed_to_me' ? 'paid you' : 'you paid') + '</span><b>' + money(d.amount) + '</b></div>').join('') :
            '<p class="text-muted" style="padding:8px 0">No settled records yet.</p>';
        $('debtSettledCount').textContent = done.length;
    }

    function listen(u) {
        if (unsubD) unsubD(); if (unsubP) unsubP();
        uid = u ? u.uid : null; items = [];
        window.__eduDebtsSettled = 0;
        if (!uid) return;
        unsubP = db.collection('users').doc(uid).collection('settings').doc('profile').onSnapshot(s => {
            if (s.exists && s.data().currency) { currency = s.data().currency; render(); }
        }, () => {});
        unsubD = col().onSnapshot(snap => {
            items = snap.docs.map(x => Object.assign({ id: x.id, createdAt: '' }, x.data()));
            render();
            window.__eduDebtsSettled = items.filter(d => d.settled).length;
            window.__eduDebtsLoaded = true;
            window.dispatchEvent(new CustomEvent('edu:debts'));
        }, (e) => { console.error('Debts listener error:', e); });
    }

    function init() {
        if (!$('debtForm')) return;
        document.querySelectorAll('#debtDir .seg-btn').forEach(b => b.addEventListener('click', () => {
            dir = b.dataset.dir;
            document.querySelectorAll('#debtDir .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        }));

        $('debtForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!uid) return;
            const amount = parseFloat($('debtAmount').value);
            const person = $('debtPerson').value.trim();
            if (!person || !(amount > 0)) return toast('Enter a name and a valid amount');
            try {
                await col().add({
                    person: person, amount: amount, paid: 0, direction: dir,
                    note: $('debtNote').value.trim().slice(0, 200),
                    phone: $('debtPhone').value.trim().slice(0, 20),
                    due: $('debtDue').value || '',
                    settled: false, createdAt: new Date().toISOString()
                });
                $('debtForm').reset();
                toast('Saved');
            } catch (err) { console.error(err); toast('Could not save: ' + err.message); }
        });

        $('debtActiveList').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const id = btn.closest('.debt-item').dataset.id;
            const d = items.find(x => x.id === id);
            if (!d) return;
            try {
                if (btn.dataset.act === 'settle') {
                    await col().doc(id).update({ settled: true, paid: d.amount, settledAt: new Date().toISOString() });
                    toast('Marked as settled');
                } else if (btn.dataset.act === 'part') {
                    const v = parseFloat(prompt('How much was paid? (remaining: ' + remaining(d) + ')'));
                    if (!(v > 0)) return;
                    const paid = Math.min(d.amount, (d.paid || 0) + v);
                    const upd = { paid: paid };
                    if (paid >= d.amount) { upd.settled = true; upd.settledAt = new Date().toISOString(); }
                    await col().doc(id).update(upd);
                    toast(upd.settled ? 'Fully paid' : 'Payment recorded');
                } else if (btn.dataset.act === 'del') {
                    if (confirm('Delete this record for ' + d.person + '?')) await col().doc(id).delete();
                }
            } catch (err) { console.error(err); toast('Action failed: ' + err.message); }
        });
    }

    init();
    firebase.auth().onAuthStateChanged(listen);
})();
