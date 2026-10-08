// Daily streak + achievement badges. Everything is computed from the user's existing data.
(function () {
    const $ = (id) => document.getElementById(id);
    const db = firebase.firestore();
    const S = { tx: [], goals: [], budgets: {}, loaded: { tx: false, goals: false, budgets: false } };
    let uid = null, unsubs = [];

    const BADGES = [
        { id: 'first', icon: '🌱', name: 'First Step', desc: 'Log your first transaction', test: m => m.n >= 1 },
        { id: 'n25', icon: '📒', name: 'Record Keeper', desc: 'Log 25 transactions', test: m => m.n >= 25 },
        { id: 'n100', icon: '💯', name: 'Century', desc: 'Log 100 transactions', test: m => m.n >= 100 },
        { id: 's3', icon: '🔥', name: '3-Day Streak', desc: 'Log 3 days in a row', test: m => m.longest >= 3 },
        { id: 's7', icon: '⚡', name: 'Week Warrior', desc: 'Log 7 days in a row', test: m => m.longest >= 7 },
        { id: 's30', icon: '👑', name: 'Habit Master', desc: 'Log 30 days in a row', test: m => m.longest >= 30 },
        { id: 'bud', icon: '🎯', name: 'Budget Boss', desc: 'Set a budget for any category', test: m => m.budgetSet },
        { id: 'goal', icon: '🐷', name: 'Goal Getter', desc: 'Create a savings goal', test: m => m.goals >= 1 },
        { id: 'goalDone', icon: '🏆', name: 'Goal Crusher', desc: 'Reach a savings goal', test: m => m.goalsDone >= 1 },
        { id: 'green', icon: '📈', name: 'In The Green', desc: 'Earn more than you spend this month (5+ entries)', test: m => m.green },
        { id: 'debt', icon: '🤝', name: 'Debt Clearer', desc: 'Settle an Owe / Owed record', test: m => m.debtSettled >= 1 }
    ];

    const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
    const localISO = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');

    function metrics() {
        const days = Array.from(new Set(S.tx.map(t => t.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))).map(dayNum).sort((a, b) => a - b);
        const set = new Set(days);
        let longest = 0, run = 0;
        days.forEach((d, i) => { run = (i && d === days[i - 1] + 1) ? run + 1 : 1; longest = Math.max(longest, run); });
        const today = dayNum(localISO(new Date()));
        let cur = 0, c = set.has(today) ? today : today - 1;
        while (set.has(c)) { cur++; c--; }
        const month = localISO(new Date()).slice(0, 7);
        const mt = S.tx.filter(t => (t.date || '').startsWith(month));
        const inc = mt.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
        const exp = mt.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
        const cats = S.budgets || {};
        return {
            n: S.tx.length, longest: longest, current: cur, set: set, today: today,
            goals: S.goals.length, goalsDone: S.goals.filter(g => g.target > 0 && g.current >= g.target).length,
            budgetSet: Object.keys(cats).some(k => Number(cats[k]) > 0),
            green: mt.length >= 5 && inc > exp,
            debtSettled: window.__eduDebtsSettled || 0
        };
    }

    function ensureCard() {
        let card = $('streakCard');
        if (card) return card;
        const grid = document.querySelector('#dashboard-tab .dashboard-grid');
        if (!grid) return null;
        card = document.createElement('div');
        card.id = 'streakCard';
        card.className = 'card streak-card';
        grid.parentNode.insertBefore(card, grid);
        card.addEventListener('click', (e) => {
            const b = e.target.closest('[data-badge]');
            if (!b) return;
            const def = BADGES.find(x => x.id === b.dataset.badge);
            if (def) toast(def.icon + ' ' + def.name + ': ' + def.desc);
        });
        return card;
    }

    function render() {
        const card = ensureCard();
        if (!card || !S.loaded.tx) return;
        const m = metrics();
        const earned = BADGES.filter(b => b.test(m));
        const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        let week = '';
        for (let i = 6; i >= 0; i--) {
            const dn = m.today - i;
            const dt = new Date(Date.UTC(1970, 0, 1) + dn * 86400000);
            week += '<div class="wd' + (m.set.has(dn) ? ' on' : '') + (i === 0 ? ' today' : '') + '"><i></i><span>' + labels[dt.getUTCDay()] + '</span></div>';
        }
        const sub = m.current === 0 ? 'Log a transaction today to start a streak' :
            (m.set.has(m.today) ? 'Logged today. Keep it going!' : 'Log something today to keep your streak');
        card.innerHTML =
            '<div class="streak-top"><div class="streak-flame' + (m.current ? ' lit' : '') + '">🔥</div>' +
            '<div class="streak-text"><div><strong>' + m.current + '</strong> day streak</div><small>' + sub + '</small></div>' +
            '<div class="streak-best">Best<b>' + m.longest + '</b></div></div>' +
            '<div class="week-dots">' + week + '</div>' +
            '<div class="badge-head"><b>Badges</b><small>' + earned.length + ' / ' + BADGES.length + '</small></div>' +
            '<div class="badge-row">' + BADGES.map(b => {
                const on = b.test(m);
                return '<button type="button" class="badge-chip' + (on ? ' on' : '') + '" data-badge="' + b.id + '"><span class="bi">' + (on ? b.icon : '🔒') + '</span><span class="bn">' + b.name + '</span></button>';
            }).join('') + '</div>';
        celebrate(earned);
    }

    function celebrate(earned) {
        if (!(S.loaded.tx && S.loaded.goals && S.loaded.budgets && window.__eduDebtsLoaded)) return;
        const key = 'edu_badges_' + uid;
        let seen = null;
        try { seen = JSON.parse(localStorage.getItem(key)); } catch (e) {}
        const ids = earned.map(b => b.id);
        if (!seen) { localStorage.setItem(key, JSON.stringify(ids)); return; } // first run: no spam
        const fresh = earned.filter(b => seen.indexOf(b.id) === -1);
        if (!fresh.length) return;
        localStorage.setItem(key, JSON.stringify(seen.concat(fresh.map(b => b.id))));
        fresh.forEach((b, i) => setTimeout(() => { toast('🏆 Badge unlocked: ' + b.icon + ' ' + b.name); confetti(); }, i * 1800));
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.className = 'edu-mini-toast show';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2800);
    }

    function confetti() {
        const box = document.createElement('div');
        box.className = 'confetti-box';
        const colors = ['#4318ff', '#05cd99', '#ffb547', '#ef4444', '#7c5cff'];
        for (let i = 0; i < 28; i++) {
            const s = document.createElement('span');
            s.style.left = Math.random() * 100 + '%';
            s.style.background = colors[i % colors.length];
            s.style.animationDelay = Math.random() * 0.3 + 's';
            s.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
            box.appendChild(s);
        }
        document.body.appendChild(box);
        setTimeout(() => box.remove(), 2200);
    }

    function listen(u) {
        unsubs.forEach(f => f()); unsubs = [];
        S.tx = []; S.goals = []; S.budgets = {}; S.loaded = { tx: false, goals: false, budgets: false };
        uid = u ? u.uid : null;
        if (!uid) return;
        const root = db.collection('users').doc(uid);
        unsubs.push(root.collection('transactions').onSnapshot(s => { S.tx = s.docs.map(d => d.data()); S.loaded.tx = true; render(); }, () => {}));
        unsubs.push(root.collection('savingsGoals').onSnapshot(s => { S.goals = s.docs.map(d => d.data()); S.loaded.goals = true; render(); }, () => {}));
        unsubs.push(root.collection('settings').doc('budgets').onSnapshot(s => { S.budgets = (s.exists && s.data().categories) || {}; S.loaded.budgets = true; render(); }, () => {}));
    }

    window.addEventListener('edu:debts', render);
    firebase.auth().onAuthStateChanged(listen);
})();
