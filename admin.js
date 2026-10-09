/* =========================================
   EduFinance - Admin Dashboard (admin.html)
   Uses the same Firebase compat SDK + project as auth.js.
   Admin = a document at admins/{uid} (see FIREBASE_RULES.md).
   ========================================= */
(function () {
    'use strict';

    // ---------- Firebase ----------
    const firebaseConfig = {
        apiKey: "AIzaSyCoYCIqZH-HOrT6TDOHCxEx2gwDkwdWUB4",
        authDomain: "edufinance-5b7f4.firebaseapp.com",
        projectId: "edufinance-5b7f4",
        storageBucket: "edufinance-5b7f4.firebasestorage.app",
        messagingSenderId: "810409268124",
        appId: "1:810409268124:web:dd782b00adf4d0c7b82e59"
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const FieldValue = firebase.firestore.FieldValue;

    // ---------- State ----------
    const PAGE_SIZE = 10;
    const REFRESH_COOLDOWN_MS = 30000;
    const INACTIVE_DAYS = 30;

    const S = {
        admin: null,
        students: [],
        tickets: [],
        subs: [],
        view: 'overview',
        q: '',
        studentFilter: 'all',
        ticketFilter: 'open',
        page: 1,
        currentTicketId: null,
        lastHeavyLoad: 0,
        heavyLoaded: false,
        loading: false,
        analytics: null,
        logs: [],
        chart: null,
        catChart: null
    };
    const unsubs = [];
    let booted = false;

    // ---------- Helpers ----------
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtInt = (n) => Number(n || 0).toLocaleString();
    const initials = (name) => {
        const p = String(name || '?').trim().split(/\s+/).filter(Boolean);
        return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    };
    const toDate = (v) => {
        if (!v) return null;
        if (typeof v.toDate === 'function') return v.toDate();
        const d = new Date(v);
        return isNaN(d) ? null : d;
    };
    const fmtDate = (v) => { const d = toDate(v); return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; };
    const fmtDateTime = (v) => { const d = toDate(v); return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };
    const ticketCode = (id) => '#' + String(id).slice(0, 6).toUpperCase();
    const isAcademic = (email) => {
        const dom = String(email || '').split('@')[1];
        if (!dom) return false;
        const parts = dom.toLowerCase().split('.');
        return parts.includes('edu') || parts.includes('ac');
    };
    const money = (n, cur) => {
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 }).format(n);
        } catch (e) {
            return cur + ' ' + new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
        }
    };

    let toastTimer;
    function toast(msg, type) {
        const t = $('toast');
        t.textContent = msg;
        t.className = 'toast show' + (type ? ' ' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }

    function log(level, msg) {
        S.logs.unshift({ t: new Date(), level, msg });
        if (S.logs.length > 200) S.logs.length = 200;
        renderLogs();
    }

    // ---------- Auth guard ----------
    function deny(signedIn) {
        unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
        // Only show the "no admin access" message to someone who actually signed in.
        window.location.replace(signedIn ? 'admin-login.html?error=unauthorized' : 'admin-login.html');
    }

    auth.onAuthStateChanged(async (user) => {
        if (!user) return deny(false);
        try {
            // Same check the Firestore rules use: a doc at admins/{uid}.
            const snap = await db.collection('admins').doc(user.uid).get();
            if (!snap.exists) return deny(true);
        } catch (e) {
            return deny(true);
        }
        if (booted) return;
        booted = true;
        S.admin = user;
        boot();
    });

    // ---------- Boot ----------
    function boot() {
        const name = S.admin.displayName || (S.admin.email || 'Admin').split('@')[0];
        $('adminName').textContent = name;
        $('adminEmail').textContent = S.admin.email || '';
        const av = $('adminAvatar');
        if (S.admin.photoURL) {
            av.innerHTML = '<img alt="" referrerpolicy="no-referrer" src="' + esc(S.admin.photoURL) + '">';
        } else {
            av.textContent = initials(name);
        }

        $('greetName').textContent = name.split(' ')[0];
        $('topAvatar').innerHTML = S.admin.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(S.admin.photoURL) + '">' : esc(initials(name));
        $('dateChip').textContent = 'Today, ' + new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

        document.body.classList.remove('checking');
        log('ok', 'Admin session started for ' + (S.admin.email || S.admin.uid));

        bindUI();
        route();
        listenTickets();
        listenSubs();
        loadHeavy(true);
    }

    // ---------- Realtime listeners ----------
    function listenError(label) {
        return (err) => {
            log('error', label + ': ' + err.message);
            const box = $('loadError');
            box.hidden = false;
            box.textContent = err.code === 'permission-denied'
                ? 'Permission denied reading "' + label + '". Publish the latest rules from FIREBASE_RULES.md in the Firebase Console.'
                : 'Could not load "' + label + '": ' + err.message;
        };
    }

    function listenTickets() {
        const un = db.collection('support_tickets').orderBy('createdAt', 'desc').onSnapshot((snap) => {
            S.tickets = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
            log('info', 'Support tickets synced (' + S.tickets.length + ')');
            renderTickets();
            renderKpis();
            if (S.currentTicketId) {
                const t = S.tickets.find((x) => x.id === S.currentTicketId);
                if (t) fillDrawer(t, true);
            }
        }, listenError('support_tickets'));
        unsubs.push(un);
    }

    function listenSubs() {
        const un = db.collection('newsletter_subscribers').orderBy('subscribedAt', 'desc').onSnapshot((snap) => {
            S.subs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
            log('info', 'Newsletter subscribers synced (' + S.subs.length + ')');
            renderSubs();
            renderKpis();
        }, listenError('newsletter_subscribers'));
        unsubs.push(un);
    }

    // ---------- Heavy load: users + transactions (one-shot, cooldown-limited) ----------
    async function loadHeavy(initial) {
        if (S.loading) return;
        const wait = REFRESH_COOLDOWN_MS - (Date.now() - S.lastHeavyLoad);
        if (!initial && wait > 0) {
            toast('Please wait ' + Math.ceil(wait / 1000) + 's before refreshing again.');
            return;
        }
        S.loading = true;
        $('refreshBtn').classList.add('spin');
        $('studentBody').innerHTML = '<tr class="empty-row"><td colspan="6">Loading students…</td></tr>';
        try {
            const [setSnap, txSnap] = await Promise.all([
                db.collectionGroup('settings').get(),
                db.collectionGroup('transactions').get()
            ]);

            // Profiles live at users/{uid}/settings/profile
            const profiles = new Map();
            setSnap.forEach((d) => {
                if (d.id !== 'profile') return;
                const uid = d.ref.parent.parent && d.ref.parent.parent.id;
                if (uid) profiles.set(uid, Object.assign({ uid }, d.data()));
            });

            // Aggregate transactions
            const perUser = new Map();           // uid -> { last, count }
            const monthActive = new Map();       // 'YYYY-MM' -> Set(uid)
            const volume = {};                   // currency -> amount
            const expenseByCur = {};             // currency -> { category: amount }
            const now = new Date();
            const d30 = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
            const d60 = new Date(now.getTime() - 60 * 864e5).toISOString().slice(0, 10);
            const active30 = new Set();
            const activePrev30 = new Set();
            let txCount = 0;

            txSnap.forEach((d) => {
                const t = d.data();
                const uid = d.ref.parent.parent && d.ref.parent.parent.id;
                if (!uid) return;
                txCount++;
                const amt = Math.abs(Number(t.amount) || 0);
                const cur = (profiles.get(uid) && profiles.get(uid).currency) || 'USD';
                volume[cur] = (volume[cur] || 0) + amt;
                if (t.type === 'expense') {
                    const m = (expenseByCur[cur] = expenseByCur[cur] || {});
                    const c = t.category || 'Other';
                    m[c] = (m[c] || 0) + amt;
                }
                const date = typeof t.date === 'string' ? t.date : '';
                const u = perUser.get(uid) || { last: '', count: 0 };
                u.count++;
                if (date > u.last) u.last = date;
                perUser.set(uid, u);
                if (date.length >= 7) {
                    const key = date.slice(0, 7);
                    if (!monthActive.has(key)) monthActive.set(key, new Set());
                    monthActive.get(key).add(uid);
                }
                if (date >= d30) active30.add(uid);
                else if (date >= d60) activePrev30.add(uid);
            });

            S.students = Array.from(profiles.values()).map((p) => {
                const u = perUser.get(p.uid) || { last: '', count: 0 };
                const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.username || 'Unnamed';
                return {
                    uid: p.uid,
                    name,
                    username: p.username || '',
                    email: p.email || '',
                    createdAt: p.createdAt || null,
                    accountId: p.accountId || '',
                    currency: p.currency || '',
                    suspended: p.suspended === true,
                    flagged: p.flagged === true,
                    lastTx: u.last,
                    txCount: u.count
                };
            }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

            // Monthly series (last 6 months)
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({
                    key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
                    label: d.toLocaleDateString(undefined, { month: 'short' })
                });
            }
            const signups = months.map((m) => S.students.filter((s) => String(s.createdAt || '').slice(0, 7) === m.key).length);
            const actives = months.map((m) => (monthActive.get(m.key) ? monthActive.get(m.key).size : 0));

            S.analytics = { months, signups, actives, volume, expenseByCur, txCount, active30: active30.size, activePrev30: activePrev30.size };
            S.heavyLoaded = true;
            S.lastHeavyLoad = Date.now();
            $('loadError').hidden = true;
            log('ok', 'Loaded ' + S.students.length + ' student profiles and ' + fmtInt(txCount) + ' transactions');
            renderAll();
        } catch (err) {
            log('error', 'User data load failed: ' + err.message);
            const box = $('loadError');
            box.hidden = false;
            box.textContent = err.code === 'permission-denied'
                ? 'Permission denied reading user data. Make sure your UID exists in the "admins" collection and the latest rules from FIREBASE_RULES.md are published.'
                : 'Could not load user data: ' + err.message;
            $('studentBody').innerHTML = '<tr class="empty-row"><td colspan="6">Could not load students.</td></tr>';
        } finally {
            S.loading = false;
            $('refreshBtn').classList.remove('spin');
        }
    }

    // ---------- Rendering ----------
    function renderAll() {
        renderKpis();
        renderCharts();
        renderStudents();
        renderTickets();
        renderSubs();
        renderLogs();
    }

    function openTickets() { return S.tickets.filter((t) => t.status !== 'resolved'); }

    function renderKpis() {
        // Tickets (live)
        const open = openTickets().length;
        $('kpiTickets').textContent = fmtInt(open);
        $('kpiTicketsSub').textContent = S.tickets.length ? 'of ' + fmtInt(S.tickets.length) + ' total' : 'awaiting response';
        [['bellBadge', open], ['navTicketCount', open]].forEach(([id, n]) => {
            const el = $(id);
            el.hidden = n === 0;
            el.textContent = n > 99 ? '99+' : n;
        });

        // Support status cards + overview stat card
        const replied = S.tickets.filter((t) => t.status !== 'resolved' && t.replies && t.replies.length).length;
        const fresh = open - replied;
        $('cntAll').textContent = fmtInt(S.tickets.length);
        $('cntOpen').textContent = fmtInt(fresh);
        $('cntReplied').textContent = fmtInt(replied);
        $('cntResolved').textContent = fmtInt(S.tickets.length - open);
        $('statTicketsBig').textContent = fmtInt(open);
        $('statTicketsSub').innerHTML = open
            ? (fresh ? '<b>' + fmtInt(fresh) + '</b> awaiting a first reply.' : 'All replied. Resolve them when done.')
            : 'Nothing pending. Nice work!';

        // Subscribers (live)
        const activeSubs = S.subs.filter((s) => s.active !== false).length;
        $('kpiSubs').textContent = fmtInt(activeSubs);
        $('kpiSubsSub').textContent = 'Active';

        // Students + volume (one-shot)
        const A = S.analytics;
        if (!A) return;
        $('kpiStudents').textContent = fmtInt(A.active30);
        $('statStudentsBig').textContent = fmtInt(S.students.length);
        const idle = S.students.filter(isInactive).length;
        $('statStudentsSub').innerHTML = S.students.length ? '<b>' + fmtInt(idle) + '</b> inactive for ' + INACTIVE_DAYS + '+ days.' : 'No students yet.';
        $('updatedAt').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const delta = $('kpiStudentsDelta');
        if (A.activePrev30 === 0) {
            delta.textContent = A.active30 > 0 ? 'New' : '0%';
            delta.className = 'pill ' + (A.active30 > 0 ? 'pill-up' : 'pill-flat');
        } else {
            const pct = Math.round(((A.active30 - A.activePrev30) / A.activePrev30) * 100);
            delta.textContent = (pct > 0 ? '+' : '') + pct + '%';
            delta.className = 'pill ' + (pct > 0 ? 'pill-up' : pct < 0 ? 'pill-down' : 'pill-flat');
        }
        $('kpiStudentsSub').textContent = 'of ' + fmtInt(S.students.length) + ' · last 30 days';

        const curs = Object.keys(A.volume).sort((a, b) => A.volume[b] - A.volume[a]);
        if (curs.length) {
            $('kpiVolume').textContent = money(A.volume[curs[0]], curs[0]);
            $('kpiVolumeSub').textContent = fmtInt(A.txCount) + ' transactions' + (curs.length > 1 ? ' · +' + (curs.length - 1) + ' other currencies' : '');
        } else {
            $('kpiVolume').textContent = '0';
            $('kpiVolumeSub').textContent = 'no transactions yet';
        }
    }

    function renderCharts() {
        const A = S.analytics;
        if (!A) return;

        // Usage chart
        const hasData = A.signups.some(Boolean) || A.actives.some(Boolean);
        $('usageEmpty').hidden = hasData;
        $('usageChart').parentElement.style.display = hasData ? '' : 'none';
        if (hasData && typeof Chart !== 'undefined') {
            const labels = A.months.map((m) => m.label);
            if (S.chart) {
                S.chart.data.labels = labels;
                S.chart.data.datasets[0].data = A.actives;
                S.chart.data.datasets[1].data = A.signups;
                S.chart.update();
            } else {
                S.chart = new Chart($('usageChart'), {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            { label: 'Active students', data: A.actives, backgroundColor: '#4318FF', borderRadius: 8, borderSkipped: false, maxBarThickness: 26 },
                            { label: 'New sign-ups', data: A.signups, backgroundColor: '#05CD99', borderRadius: 8, borderSkipped: false, maxBarThickness: 26 }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, color: '#707EAE', font: { family: 'Plus Jakarta Sans', weight: '600' } } },
                            tooltip: { backgroundColor: '#1B2559', padding: 10, cornerRadius: 10 }
                        },
                        scales: {
                            y: { beginAtZero: true, border: { display: false }, ticks: { precision: 0, color: '#707EAE' }, grid: { color: '#EEF1F9' } },
                            x: { grid: { display: false }, border: { display: false }, ticks: { color: '#707EAE' } }
                        }
                    }
                });
            }
        }

        // Category donut (dominant currency, expenses only)
        const COLORS = ['#4318FF', '#05CD99', '#FFB547', '#EE5D50', '#6AD2FF', '#7551FF'];
        const curs = Object.keys(A.expenseByCur).sort((a, b) => sum(A.expenseByCur[b]) - sum(A.expenseByCur[a]));
        const legend = $('catList');
        if (!curs.length) {
            legend.innerHTML = '<li class="muted">No expense data yet.</li>';
            $('catSub').textContent = 'Expenses';
            if (S.catChart) { S.catChart.destroy(); S.catChart = null; }
            return;
        }
        const cur = curs[0];
        const cats = A.expenseByCur[cur];
        const total = sum(cats);
        const top = Object.keys(cats).sort((a, b) => cats[b] - cats[a]).slice(0, 6);
        $('catSub').textContent = cur + (curs.length > 1 ? ' accounts only' : '');
        legend.innerHTML = top.map((c, i) => {
            const pct = total ? Math.round((cats[c] / total) * 100) : 0;
            return '<li><i class="sw" style="background:' + COLORS[i] + '"></i><span class="l-name">' + esc(c) + '</span><span class="l-val">' + pct + '%</span></li>';
        }).join('');
        if (typeof Chart !== 'undefined') {
            const data = top.map((c) => cats[c]);
            if (S.catChart) {
                S.catChart.data.labels = top;
                S.catChart.data.datasets[0].data = data;
                S.catChart.update();
            } else {
                S.catChart = new Chart($('catChart'), {
                    type: 'doughnut',
                    data: { labels: top, datasets: [{ data, backgroundColor: COLORS, borderWidth: 3, borderColor: '#fff', hoverOffset: 4 }] },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '58%',
                        plugins: {
                            legend: { display: false },
                            tooltip: { backgroundColor: '#1B2559', padding: 10, cornerRadius: 10, callbacks: { label: (c) => ' ' + c.label + ': ' + money(c.parsed, cur) } }
                        }
                    }
                });
            }
        }
    }
    function sum(obj) { return Object.keys(obj).reduce((a, k) => a + obj[k], 0); }

    // ----- Students -----
    function studentStatus(s) {
        if (s.suspended) return { key: 'suspended', label: 'Suspended', cls: 'badge-red' };
        if (isAcademic(s.email)) return { key: 'active', label: 'Active', cls: 'badge-green' };
        return { key: 'unverified', label: 'Unverified', cls: 'badge-amber' };
    }
    function isInactive(s) {
        if (!s.lastTx) return true;
        return (Date.now() - new Date(s.lastTx + 'T00:00:00').getTime()) / 864e5 > INACTIVE_DAYS;
    }
    const studentFilters = {
        all: () => true,
        verified: (s) => isAcademic(s.email),
        flagged: (s) => s.flagged || s.suspended,
        inactive: isInactive
    };
    function matchStudent(s, q) {
        if (!q) return true;
        const needle = q.replace(/^@/, '');
        return [s.name, s.username, s.email, s.accountId, s.uid].some((v) => String(v || '').toLowerCase().includes(needle));
    }
    function filteredStudents() {
        const f = studentFilters[S.studentFilter] || studentFilters.all;
        return S.students.filter((s) => f(s) && matchStudent(s, S.q));
    }

    function renderStudents() {
        Object.keys(studentFilters).forEach((k) => {
            const el = document.querySelector('.tab-n[data-n="' + k + '"]');
            if (el) el.textContent = fmtInt(S.students.filter(studentFilters[k]).length);
        });
        const body = $('studentBody');
        if (!S.heavyLoaded) return;
        const rows = filteredStudents();
        const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        if (S.page > pages) S.page = pages;
        const start = (S.page - 1) * PAGE_SIZE;
        const slice = rows.slice(start, start + PAGE_SIZE);

        body.innerHTML = slice.length ? slice.map((s) => {
            const st = studentStatus(s);
            return '<tr>' +
                '<td><div class="cell-user"><div class="avatar">' + esc(initials(s.name)) + '</div><div><strong>' + esc(s.name) + '</strong>' +
                (s.accountId ? '<div class="cell-sub mono">' + esc(s.accountId) + '</div>' : '') + '</div></div></td>' +
                '<td>' + (s.username ? '@' + esc(s.username) : '—') + '</td>' +
                '<td class="trunc">' + esc(s.email || '—') + '</td>' +
                '<td>' + esc(fmtDate(s.createdAt)) + '</td>' +
                '<td><span class="badge ' + st.cls + '">' + st.label + '</span></td>' +
                '<td><button class="dots-btn" data-menu="student" data-id="' + esc(s.uid) + '" aria-label="Actions"><i class="fa-solid fa-ellipsis-vertical"></i></button></td>' +
                '</tr>';
        }).join('') : '<tr class="empty-row"><td colspan="6">No students match.</td></tr>';

        const from = rows.length ? start + 1 : 0;
        $('pagerInfo').textContent = 'Showing ' + fmtInt(from) + '–' + fmtInt(start + slice.length) + ' of ' + fmtInt(rows.length) + ' students';
        $('prevPage').disabled = S.page <= 1;
        $('nextPage').disabled = S.page >= pages;
    }

    // ----- Tickets -----
    function matchTicket(t, q) {
        if (!q) return true;
        const needle = q.replace(/^#/, '');
        return [t.id, t.name, t.email, t.subject, t.message].some((v) => String(v || '').toLowerCase().includes(needle));
    }
    function ticketBadge(t) {
        return t.status === 'resolved'
            ? '<span class="badge badge-green">Resolved</span>'
            : (t.replies && t.replies.length ? '<span class="badge badge-amber">Replied</span>' : '<span class="badge badge-red">Open</span>');
    }
    function ticketRow(t) {
        return '<tr class="clickable" data-ticket="' + esc(t.id) + '">' +
            '<td class="mono">' + esc(ticketCode(t.id)) + '</td>' +
            '<td><div class="cell-user"><div class="avatar">' + esc(initials(t.name)) + '</div><div><strong>' + esc(t.name || 'Anonymous') + '</strong><div class="cell-sub">' + esc(t.email || '') + '</div></div></div></td>' +
            '<td class="trunc">' + esc(t.subject || '(no subject)') + '</td>' +
            '<td>' + esc(fmtDateTime(t.createdAt)) + '</td>' +
            '<td>' + ticketBadge(t) + '</td></tr>';
    }

    function renderTickets() {
        const f = S.ticketFilter;
        const rows = S.tickets.filter((t) => (f === 'all' || (f === 'resolved' ? t.status === 'resolved' : t.status !== 'resolved')) && matchTicket(t, S.q));
        $('ticketBody').innerHTML = rows.length ? rows.map(ticketRow).join('') : '<tr class="empty-row"><td colspan="5">No tickets here.</td></tr>';

        const recent = openTickets().filter((t) => matchTicket(t, S.q)).slice(0, 5);
        $('overviewTickets').innerHTML = '<thead><tr><th>Ticket</th><th>From</th><th>Subject</th><th>Received</th><th>Status</th></tr></thead><tbody>' +
            (recent.length ? recent.map(ticketRow).join('') : '<tr class="empty-row"><td colspan="5">No open tickets. 🎉</td></tr>') + '</tbody>';
    }

    // ----- Subscribers -----
    function renderSubs() {
        const rows = S.subs.filter((s) => !S.q || String(s.email || s.id).toLowerCase().includes(S.q));
        $('subBody').innerHTML = rows.length ? rows.map((s) =>
            '<tr><td>' + esc(s.email || s.id) + '</td><td>' + esc(fmtDateTime(s.subscribedAt)) + '</td>' +
            '<td><button class="dots-btn" data-menu="sub" data-id="' + esc(s.id) + '" aria-label="Actions"><i class="fa-solid fa-ellipsis-vertical"></i></button></td></tr>'
        ).join('') : '<tr class="empty-row"><td colspan="3">No subscribers yet.</td></tr>';
    }

    // ----- Logs -----
    function renderLogs() {
        $('logList').innerHTML = S.logs.length ? S.logs.map((l) =>
            '<div class="log-row"><time>' + esc(l.t.toLocaleTimeString()) + '</time><span class="log-lv ' + l.level + '">' + l.level + '</span><span class="log-msg">' + esc(l.msg) + '</span></div>'
        ).join('') : '<p class="empty">No events yet.</p>';
    }

    // ---------- Routing ----------
    const VIEWS = ['overview', 'students', 'support', 'newsletter', 'logs'];
    function route() {
        const v = (location.hash || '#overview').slice(1);
        S.view = VIEWS.includes(v) ? v : 'overview';
        document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + S.view));
        document.querySelectorAll('.nav-link').forEach((el) => el.classList.toggle('active', el.dataset.view === S.view));
        closeSidebar();
        window.scrollTo(0, 0);
        if (S.view === 'overview') { if (S.chart) S.chart.resize(); if (S.catChart) S.catChart.resize(); }
    }

    // ---------- Sidebar (mobile) ----------
    function openSidebar() { $('sidebar').classList.add('open'); $('sbOverlay').classList.add('open'); }
    function closeSidebar() { $('sidebar').classList.remove('open'); $('sbOverlay').classList.remove('open'); }

    // ---------- Row menu ----------
    const menu = $('rowMenu');
    function openMenu(btn) {
        const kind = btn.dataset.menu, id = btn.dataset.id;
        let items = [];
        if (kind === 'student') {
            const s = S.students.find((x) => x.uid === id);
            if (!s) return;
            items = [
                s.email && { icon: 'fa-envelope', label: 'Email student', href: 'mailto:' + encodeURIComponent(s.email).replace(/%40/g, '@') },
                s.email && { icon: 'fa-copy', label: 'Copy email', copy: s.email },
                s.username && { icon: 'fa-at', label: 'Copy username', copy: '@' + s.username },
                { icon: 'fa-fingerprint', label: 'Copy user ID', copy: s.uid }
            ].filter(Boolean);
        } else {
            const s = S.subs.find((x) => x.id === id);
            if (!s) return;
            items = [
                { icon: 'fa-copy', label: 'Copy email', copy: s.email || s.id },
                { icon: 'fa-trash', label: 'Remove subscriber', remove: s.id, danger: true }
            ];
        }
        menu.innerHTML = items.map((it, i) => it.href
            ? '<a role="menuitem" href="' + it.href + '"><i class="fa-solid ' + it.icon + '"></i>' + esc(it.label) + '</a>'
            : '<button role="menuitem" data-i="' + i + '" class="' + (it.danger ? 'danger' : '') + '"><i class="fa-solid ' + it.icon + '"></i>' + esc(it.label) + '</button>'
        ).join('');
        menu._items = items;
        menu.hidden = false;
        const r = btn.getBoundingClientRect();
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        menu.style.left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8)) + 'px';
        menu.style.top = (r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + 'px';
    }
    function closeMenu() { menu.hidden = true; }

    menu.addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-i]');
        if (!b) return closeMenu();
        const it = menu._items[Number(b.dataset.i)];
        closeMenu();
        if (it.copy) {
            try { await navigator.clipboard.writeText(it.copy); toast('Copied', 'success'); }
            catch (err) { toast('Copy not supported here', 'error'); }
        } else if (it.remove) {
            if (!confirm('Remove ' + it.remove + ' from the newsletter list?')) return;
            try {
                await db.collection('newsletter_subscribers').doc(it.remove).delete();
                log('ok', 'Removed subscriber ' + it.remove);
                toast('Subscriber removed', 'success');
            } catch (err) {
                log('error', 'Remove subscriber failed: ' + err.message);
                toast('Could not remove: ' + err.message, 'error');
            }
        }
    });

    // ---------- Ticket drawer ----------
    function fillDrawer(t, keepForm) {
        $('dwId').textContent = 'Ticket ' + ticketCode(t.id);
        $('dwSubject').textContent = t.subject || '(no subject)';
        $('dwName').textContent = t.name || '—';
        $('dwEmail').textContent = t.email || '—';
        $('dwTime').textContent = fmtDateTime(t.createdAt);
        $('dwStatus').innerHTML = ticketBadge(t);
        $('dwMessage').textContent = t.message || '';

        const replies = Array.isArray(t.replies) ? t.replies : [];
        $('dwRepliesWrap').hidden = !replies.length;
        $('dwReplies').innerHTML = replies.map((r) =>
            '<div class="reply-item"><div class="cell-sub">' + esc(r.by || 'admin') + ' · ' + esc(fmtDateTime(r.at)) + '</div>' + esc(r.text) + '</div>'
        ).join('');

        const resolved = t.status === 'resolved';
        const rb = $('resolveBtn');
        rb.disabled = resolved;
        rb.innerHTML = resolved ? '<i class="fa-solid fa-circle-check"></i> Resolved' : '<i class="fa-solid fa-circle-check"></i> Mark as Resolved';
        if (!keepForm) $('replyText').value = '';
    }

    function openTicket(id) {
        const t = S.tickets.find((x) => x.id === id);
        if (!t) return;
        S.currentTicketId = id;
        fillDrawer(t, false);
        $('ticketDrawer').classList.add('open');
        $('ticketDrawer').setAttribute('aria-hidden', 'false');
        $('drawerOverlay').classList.add('open');
    }
    function closeDrawer() {
        S.currentTicketId = null;
        $('ticketDrawer').classList.remove('open');
        $('ticketDrawer').setAttribute('aria-hidden', 'true');
        $('drawerOverlay').classList.remove('open');
    }

    async function sendReply(e) {
        e.preventDefault();
        const t = S.tickets.find((x) => x.id === S.currentTicketId);
        const text = $('replyText').value.trim();
        if (!t || !text) return;
        const btn = $('sendReplyBtn');
        btn.disabled = true;
        try {
            await db.collection('support_tickets').doc(t.id).update({
                replies: FieldValue.arrayUnion({ text, by: S.admin.email || S.admin.uid, at: firebase.firestore.Timestamp.now() })
            });
            log('ok', 'Reply saved on ' + ticketCode(t.id));
            $('replyText').value = '';

            // No mail server in this app: hand the reply to the admin's email client.
            const subject = 'Re: ' + (t.subject || 'Your EduFinance message');
            const url = 'mailto:' + (t.email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
            if (t.email && url.length < 1900) {
                toast('Reply saved. Opening your email app…', 'success');
                window.location.href = url;
            } else {
                try { await navigator.clipboard.writeText(text); } catch (err) { /* ignore */ }
                toast('Reply saved' + (t.email ? ' and copied (too long to prefill email)' : ''), 'success');
            }
        } catch (err) {
            log('error', 'Reply failed: ' + err.message);
            toast('Could not save reply: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    }

    async function resolveTicket() {
        const t = S.tickets.find((x) => x.id === S.currentTicketId);
        if (!t || t.status === 'resolved') return;
        const btn = $('resolveBtn');
        btn.disabled = true;
        try {
            await db.collection('support_tickets').doc(t.id).update({
                status: 'resolved',
                resolvedAt: FieldValue.serverTimestamp(),
                resolvedBy: S.admin.email || S.admin.uid
            });
            log('ok', 'Resolved ' + ticketCode(t.id));
            toast('Ticket marked as resolved', 'success');
        } catch (err) {
            btn.disabled = false;
            log('error', 'Resolve failed: ' + err.message);
            toast('Could not resolve: ' + err.message, 'error');
        }
    }

    // ---------- CSV export ----------
    function csvCell(v) {
        let s = v == null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // block spreadsheet formula injection
        return '"' + s.replace(/"/g, '""') + '"';
    }
    function csvBlock(title, header, rows) {
        return [csvCell(title), header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
    }
    function exportToCSV(scope) {
        scope = scope || 'all';
        const blocks = [];
        if (scope === 'all' || scope === 'students') {
            if (!S.heavyLoaded && scope === 'students') { toast('Student data is still loading', 'error'); return; }
            blocks.push(csvBlock('Students', ['Name', 'Username', 'Email', 'Account ID', 'Currency', 'Date Joined', 'Status', 'Last Transaction', 'Transactions', 'User ID'],
                S.students.map((s) => [s.name, s.username ? '@' + s.username : '', s.email, s.accountId, s.currency, s.createdAt || '', studentStatus(s).label, s.lastTx, s.txCount, s.uid])));
        }
        if (scope === 'all' || scope === 'support') {
            blocks.push(csvBlock('Support Tickets', ['Ticket', 'Name', 'Email', 'Subject', 'Message', 'Status', 'Received', 'Replies'],
                S.tickets.map((t) => [ticketCode(t.id), t.name, t.email, t.subject, t.message, t.status || 'open', toDate(t.createdAt) ? toDate(t.createdAt).toISOString() : '', (t.replies || []).length])));
        }
        if (scope === 'all' || scope === 'newsletter') {
            blocks.push(csvBlock('Newsletter Subscribers', ['Email', 'Subscribed'],
                S.subs.map((s) => [s.email || s.id, toDate(s.subscribedAt) ? toDate(s.subscribedAt).toISOString() : ''])));
        }
        const blob = new Blob(['﻿' + blocks.join('\r\n\r\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'edufinance-' + scope + '-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        log('info', 'Exported CSV (' + scope + ')');
        toast('CSV downloaded', 'success');
    }
    window.exportToCSV = exportToCSV;

    // ---------- Event wiring ----------
    function bindUI() {
        window.addEventListener('hashchange', route);

        $('hamburger').addEventListener('click', openSidebar);
        $('sidebarClose').addEventListener('click', closeSidebar);
        $('sbExpand').addEventListener('click', () => $('shell').classList.toggle('expanded'));
        $('sbOverlay').addEventListener('click', closeSidebar);

        $('logoutBtn').addEventListener('click', async () => {
            try { await auth.signOut(); } catch (e) { /* ignore */ }
            window.location.replace('admin-login.html');
        });

        $('searchInput').addEventListener('input', (e) => {
            S.q = e.target.value.trim().toLowerCase();
            S.page = 1;
            renderStudents();
            renderTickets();
            renderSubs();
        });

        $('studentTabs').addEventListener('click', (e) => {
            const b = e.target.closest('.tab'); if (!b) return;
            S.studentFilter = b.dataset.filter; S.page = 1;
            document.querySelectorAll('#studentTabs .tab').forEach((t) => t.classList.toggle('active', t === b));
            renderStudents();
        });
        $('ticketTabs').addEventListener('click', (e) => {
            const b = e.target.closest('.tab'); if (!b) return;
            S.ticketFilter = b.dataset.filter;
            document.querySelectorAll('#ticketTabs .tab').forEach((t) => t.classList.toggle('active', t === b));
            renderTickets();
        });

        $('prevPage').addEventListener('click', () => { if (S.page > 1) { S.page--; renderStudents(); } });
        $('nextPage').addEventListener('click', () => { S.page++; renderStudents(); });

        // Delegated clicks: ticket rows + 3-dot menus
        document.addEventListener('click', (e) => {
            const dots = e.target.closest('.dots-btn');
            if (dots) { e.stopPropagation(); if (!menu.hidden && menu._owner === dots) { closeMenu(); } else { menu._owner = dots; openMenu(dots); } return; }
            if (!e.target.closest('#rowMenu')) closeMenu();
            const row = e.target.closest('tr[data-ticket]');
            if (row) openTicket(row.dataset.ticket);
        });
        window.addEventListener('scroll', closeMenu, true);
        window.addEventListener('resize', closeMenu);

        $('bellBtn').addEventListener('click', () => { location.hash = '#support'; });
        $('refreshBtn').addEventListener('click', () => loadHeavy(false));
        $('exportBtn').addEventListener('click', () => exportToCSV('all'));
        $('clearLogs').addEventListener('click', () => { S.logs = []; renderLogs(); });

        $('drawerClose').addEventListener('click', closeDrawer);
        $('drawerOverlay').addEventListener('click', closeDrawer);
        $('replyForm').addEventListener('submit', sendReply);
        $('resolveBtn').addEventListener('click', resolveTicket);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeMenu(); closeSidebar(); } });

        // Connectivity badge
        const setOnline = () => {
            const on = navigator.onLine;
            $('sysStatus').classList.toggle('offline', !on);
            $('sysStatusText').textContent = on ? 'System Online' : 'Offline';
            log(on ? 'ok' : 'warn', on ? 'Connection restored' : 'Connection lost');
        };
        window.addEventListener('online', setOnline);
        window.addEventListener('offline', setOnline);
        if (!navigator.onLine) setOnline();
    }
})();
