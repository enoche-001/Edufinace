/* =========================================
   EduFinance - Admin Dashboard
   - Access is decided by Firestore rules (admins/{uid} must exist).
   - This file only adds the sign-in flow and the UI on top.
   ========================================= */
(function () {
    'use strict';

    const firebaseConfig = {
        apiKey: "AIzaSyCoYCIqZH-HOrT6TDOHCxEx2gwDkwdWUB4",
        authDomain: "edufinance-5b7f4.firebaseapp.com",
        projectId: "edufinance-5b7f4",
        storageBucket: "edufinance-5b7f4.firebasestorage.app",
        messagingSenderId: "810409268124",
        appId: "1:810409268124:web:dd782b00adf4d0c7b82e59"
    };

    const CAP_TX = 20000;      // max transactions read per refresh
    const CAP_OTHER = 10000;   // max goals / debts read per refresh
    const PAGE_SIZE = 25;
    const IDLE_MS = 30 * 60 * 1000;
    const REFRESH_COOLDOWN_MS = 8000;

    let auth, db;
    try {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (e) {
        document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Could not start Firebase. Check your connection and reload.</p>';
        return;
    }

    /* ---------- tiny helpers ---------- */
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const daysAgoStr = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
    const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    const LEGACY = { '$': 'USD', '€': 'EUR', '£': 'GBP', '₦': 'NGN', 'CA$': 'CAD', 'A$': 'AUD', '¥': 'JPY' };
    const curCode = c => !c ? 'USD' : (LEGACY[c] || String(c).toUpperCase());
    const nfCache = {};
    function money(n, c) {
        c = curCode(c);
        try {
            nfCache[c] = nfCache[c] || new Intl.NumberFormat('en', { style: 'currency', currency: c, maximumFractionDigits: 2 });
            return nfCache[c].format(n);
        } catch (e) { return c + ' ' + Number(n).toLocaleString(); }
    }
    const compact = n => Number(n).toLocaleString('en');
    function fmtDate(v) {
        if (!v) return '—';
        const d = (v instanceof Date) ? v : new Date(v.length === 10 ? v + 'T00:00:00' : v);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function ageFromDob(dob) {
        if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
        const d = new Date(dob + 'T00:00:00');
        if (isNaN(d)) return null;
        const t = new Date();
        let a = t.getFullYear() - d.getFullYear();
        const m = t.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
        return (a >= 0 && a < 120) ? a : null;
    }
    function csvCell(v) {
        v = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;   // stop spreadsheet formula injection
        return '"' + v.replace(/"/g, '""') + '"';
    }

    let toastTimer;
    function toast(msg, type) {
        const t = $('toast');
        $('toastMsg').textContent = msg;
        t.className = 'toast show' + (type ? ' toast-' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }

    /* ---------- state ---------- */
    let ME = null;
    let D = { profiles: [], tx: [], goals: [], debts: [], loadedAt: null };
    let M = { users: [], byUid: new Map() };
    const S = { view: 'overview', userPage: 1, txPage: 1, loading: false, lastRefresh: 0, txFiltered: [], usersFiltered: [] };
    const charts = {};
    let idleTimer = null;

    /* ======================================================
       VIEW SWITCHING (login / denied / loading / app)
       ====================================================== */
    function showScreen(name) {
        ['loadingView', 'authView', 'deniedView'].forEach(id => $(id).classList.toggle('hidden', id !== name + 'View'));
        $('appView').classList.toggle('hidden', name !== 'app');
    }

    /* ======================================================
       AUTH
       ====================================================== */
    function loginError(msg) {
        const el = $('loginError');
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
    }
    function friendlyAuthError(e) {
        const c = (e && e.code) || '';
        if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'Incorrect email or password.';
        if (c === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
        if (c === 'auth/network-request-failed') return 'Network problem. Check your connection.';
        if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
        if (c === 'auth/popup-blocked') return 'Your browser blocked the Google pop-up. Allow pop-ups and try again.';
        if (c === 'auth/unauthorized-domain') return 'This domain is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.';
        if (c === 'auth/user-disabled') return 'This account has been disabled.';
        return 'Could not sign in. Please try again.';
    }

    $('loginForm').addEventListener('submit', async e => {
        e.preventDefault();
        loginError('');
        const email = $('adminEmail').value.trim();
        const pw = $('adminPassword').value;
        if (!email || !pw) return loginError('Enter your email and password.');
        const btn = $('loginBtn');
        btn.disabled = true; btn.textContent = 'Signing in...';
        try {
            await auth.signInWithEmailAndPassword(email, pw);
        } catch (err) {
            loginError(friendlyAuthError(err));
        } finally {
            btn.disabled = false; btn.textContent = 'Sign in';
        }
    });

    $('googleBtn').addEventListener('click', async () => {
        loginError('');
        try {
            await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        } catch (err) {
            loginError(friendlyAuthError(err));
        }
    });

    $('forgotBtn').addEventListener('click', async () => {
        const email = $('adminEmail').value.trim();
        if (!email) return loginError('Type your email above first, then tap "Forgot password?".');
        try {
            await auth.sendPasswordResetEmail(email);
            loginError('');
            toast('If that account exists, a reset link has been sent.', 'success');
        } catch (err) {
            loginError(friendlyAuthError(err) || 'Could not send the reset email.');
        }
    });

    $('togglePw').addEventListener('click', () => {
        const inp = $('adminPassword');
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        $('togglePw').innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
        $('togglePw').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });

    function doSignOut() { stopIdle(); return auth.signOut(); }
    $('signOutBtn').addEventListener('click', doSignOut);
    $('deniedSignOut').addEventListener('click', doSignOut);
    $('deniedRetry').addEventListener('click', () => checkAccess(auth.currentUser));
    $('copyUid').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('deniedUid').textContent); toast('UID copied', 'success'); }
        catch (e) { toast('Press and hold the UID to copy it'); }
    });

    function showDenied(user, err) {
        stopIdle();
        $('deniedEmail').textContent = user.email || user.displayName || 'this account';
        $('deniedUid').textContent = user.uid;
        const box = $('deniedErr');
        if (err && err.code === 'permission-denied') {
            box.textContent = 'Firestore refused the admin check. Either you are not an admin yet, or the updated security rules have not been published.';
            box.classList.remove('hidden');
        } else if (err) {
            box.textContent = 'Could not verify access (' + (err.code || 'unknown error') + '). Check your connection and try again.';
            box.classList.remove('hidden');
        } else {
            box.classList.add('hidden');
        }
        showScreen('denied');
    }

    async function checkAccess(user) {
        if (!user) { showScreen('auth'); return; }
        showScreen('loading');
        try {
            const snap = await db.collection('admins').doc(user.uid).get();
            if (!snap.exists) return showDenied(user);
            ME = { user, data: snap.data() || {} };
            startApp();
        } catch (err) {
            console.error('Admin check failed:', err);
            showDenied(user, err);
        }
    }

    auth.onAuthStateChanged(user => {
        if (!user) {
            ME = null; D = { profiles: [], tx: [], goals: [], debts: [], loadedAt: null };
            M = { users: [], byUid: new Map() };
            stopIdle();
            showScreen('auth');
            return;
        }
        checkAccess(user);
    });

    /* idle sign-out */
    function resetIdle() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(async () => {
            await auth.signOut();
            loginError('You were signed out after 30 minutes of inactivity.');
        }, IDLE_MS);
    }
    function startIdle() { ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, resetIdle, { passive: true })); resetIdle(); }
    function stopIdle() { clearTimeout(idleTimer); ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.removeEventListener(ev, resetIdle)); }

    /* ======================================================
       APP START
       ====================================================== */
    let appBound = false;
    function startApp() {
        const name = ME.data.name || ME.user.displayName || ME.user.email || 'Admin';
        $('meName').textContent = name;
        $('meAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'A';
        showScreen('app');
        startIdle();
        if (!appBound) { bindApp(); appBound = true; }
        switchView(S.view);
        loadAll();
    }

    function bindApp() {
        document.querySelectorAll('.menu-item[data-view]').forEach(b => b.addEventListener('click', () => {
            switchView(b.dataset.view);
            closeMenu();
        }));
        $('menuBtn').addEventListener('click', () => { $('sidebar').classList.add('open'); $('scrim').classList.add('show'); });
        $('scrim').addEventListener('click', closeMenu);
        $('refreshBtn').addEventListener('click', () => {
            const wait = REFRESH_COOLDOWN_MS - (Date.now() - S.lastRefresh);
            if (S.loading) return;
            if (wait > 0) return toast('Please wait ' + Math.ceil(wait / 1000) + 's before refreshing again.');
            loadAll();
        });
        $('themeBtn').addEventListener('click', toggleTheme);
        syncThemeIcon();

        $('userSearch').addEventListener('input', debounce(() => { S.userPage = 1; renderUsers(); }, 200));
        $('userCurrency').addEventListener('change', () => { S.userPage = 1; renderUsers(); });
        $('userSort').addEventListener('change', () => { S.userPage = 1; renderUsers(); });
        $('exportUsers').addEventListener('click', exportUsers);
        $('usersBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-uid]'); if (tr) openUser(tr.dataset.uid); });
        $('usersBody').addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-uid]'); if (tr) openUser(tr.dataset.uid); } });

        $('txSearch').addEventListener('input', debounce(() => { S.txPage = 1; renderTx(); }, 200));
        $('txType').addEventListener('change', () => { S.txPage = 1; renderTx(); });
        $('txBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-uid]'); if (tr) openUser(tr.dataset.uid); });

        $('userModal').addEventListener('click', e => { if (e.target === $('userModal')) closeUser(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeUser(); closeMenu(); } });
    }
    function closeMenu() { $('sidebar').classList.remove('open'); $('scrim').classList.remove('show'); }

    const TITLES = { overview: 'Overview', users: 'Users', transactions: 'Transactions', analytics: 'Analytics', admins: 'Admins' };
    function switchView(v) {
        S.view = v;
        document.querySelectorAll('.menu-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
        Object.keys(TITLES).forEach(k => $('view-' + k).classList.toggle('hidden', k !== v));
        $('pageTitle').textContent = TITLES[v];
        window.scrollTo(0, 0);
        renderCurrent();
    }
    function renderCurrent() {
        try {
            if (S.view === 'overview') renderOverview();
            else if (S.view === 'users') renderUsers();
            else if (S.view === 'transactions') renderTx();
            else if (S.view === 'analytics') renderAnalytics();
            else if (S.view === 'admins') renderAdmins();
        } catch (e) { console.error('Render error:', e); toast('Something went wrong drawing this page.', 'error'); }
    }

    /* theme */
    function toggleTheme() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (dark) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', 'dark');
        try { localStorage.setItem('edu_theme', dark ? 'light' : 'dark'); } catch (e) {}
        syncThemeIcon();
        if (D.loadedAt) renderCurrent();
    }
    function syncThemeIcon() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        $('themeBtn').innerHTML = dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
    const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#4318ff';

    /* ======================================================
       DATA LOADING
       ====================================================== */
    function showLoadError(msg) {
        $('loadErrorText').textContent = msg || '';
        $('loadError').classList.toggle('hidden', !msg);
    }

    async function loadAll() {
        if (S.loading) return;
        S.loading = true; S.lastRefresh = Date.now();
        showLoadError('');
        $('capWarn').classList.add('hidden');
        const btn = $('refreshBtn');
        btn.disabled = true; btn.querySelector('i').classList.add('fa-spin');
        if (!D.loadedAt) renderSkeleton();

        try {
            const [settingsSnap, txSnap, goalSnap, debtSnap] = await Promise.all([
                db.collectionGroup('settings').get(),
                db.collectionGroup('transactions').limit(CAP_TX).get(),
                db.collectionGroup('savingsGoals').limit(CAP_OTHER).get(),
                db.collectionGroup('debts').limit(CAP_OTHER).get()
            ]);
            const uidOf = doc => (doc.ref.parent.parent && doc.ref.parent.parent.id) || '';

            D.profiles = settingsSnap.docs.filter(d => d.id === 'profile').map(d => ({ uid: uidOf(d), ...d.data() }));
            D.tx = txSnap.docs.map(d => ({ id: d.id, uid: uidOf(d), ...d.data() }));
            D.goals = goalSnap.docs.map(d => ({ id: d.id, uid: uidOf(d), ...d.data() }));
            D.debts = debtSnap.docs.map(d => ({ id: d.id, uid: uidOf(d), ...d.data() }));
            D.loadedAt = new Date();

            const capped = [];
            if (txSnap.size >= CAP_TX) capped.push('transactions (' + compact(CAP_TX) + ')');
            if (goalSnap.size >= CAP_OTHER) capped.push('savings goals (' + compact(CAP_OTHER) + ')');
            if (debtSnap.size >= CAP_OTHER) capped.push('debts (' + compact(CAP_OTHER) + ')');
            if (capped.length) {
                $('capWarnText').textContent = 'Read limit reached for ' + capped.join(', ') + '. Totals below only include what was loaded.';
                $('capWarn').classList.remove('hidden');
            }

            buildModel();
            $('lastUpdated').textContent = 'Updated ' + D.loadedAt.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
            populateCurrencyFilter();
            renderCurrent();
        } catch (err) {
            console.error('Load failed:', err);
            if (err && err.code === 'permission-denied') {
                showLoadError('Firestore refused the read. Publish the updated security rules (FIREBASE_RULES.md) and make sure your UID is in the admins collection.');
            } else if (err && err.code === 'failed-precondition') {
                showLoadError('Firestore needs an index for this query: ' + (err.message || ''));
            } else {
                showLoadError('Could not load data (' + ((err && err.code) || 'unknown error') + '). Check your connection and tap Refresh.');
            }
            if (!D.loadedAt) renderEmptyAll();
        } finally {
            S.loading = false;
            btn.disabled = false; btn.querySelector('i').classList.remove('fa-spin');
        }
    }

    function buildModel() {
        const byUid = new Map();
        const ensure = uid => {
            if (!byUid.has(uid)) byUid.set(uid, {
                uid, name: '', username: '', email: '', accountId: '', currency: 'USD', dob: null, createdAt: null,
                onboarded: false, incomeSources: [], txCount: 0, income: 0, expense: 0, lastTx: '', goals: 0, debtsOpen: 0, profileMissing: true
            });
            return byUid.get(uid);
        };
        D.profiles.forEach(p => {
            const u = ensure(p.uid);
            u.profileMissing = false;
            u.username = p.username || '';
            u.name = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
            u.email = p.email || '';
            u.accountId = p.accountId || '';
            u.currency = curCode(p.currency);
            u.dob = p.dob || null;
            u.createdAt = p.createdAt || null;
            u.onboarded = !!p.onboarded;
            u.incomeSources = Array.isArray(p.incomeSources) ? p.incomeSources : [];
        });
        D.tx.forEach(t => {
            const u = ensure(t.uid);
            u.txCount++;
            const amt = num(t.amount);
            if (t.type === 'income') u.income += amt; else if (t.type === 'expense') u.expense += amt;
            if (typeof t.date === 'string' && t.date > u.lastTx) u.lastTx = t.date;
        });
        D.goals.forEach(g => { ensure(g.uid).goals++; });
        D.debts.forEach(d => { if (!d.settled) ensure(d.uid).debtsOpen++; });

        const users = [...byUid.values()];
        users.forEach(u => {
            u.display = u.name || u.username || (u.profileMissing ? 'No profile' : 'Unnamed');
            u.joinedTs = u.createdAt ? (new Date(u.createdAt).getTime() || 0) : 0;
        });
        M = { users, byUid };
    }

    /* ---------- loading / empty placeholders ---------- */
    function renderSkeleton() {
        $('statsGrid').innerHTML = Array.from({ length: 6 }, () => '<div class="stat-card"><div class="skel" style="width:50%;margin-bottom:16px"></div><div class="skel" style="height:30px;width:70%"></div></div>').join('');
        const row = '<tr><td colspan="7"><div class="skel"></div></td></tr>';
        $('usersBody').innerHTML = row.repeat(6);
        $('txBody').innerHTML = row.repeat(6);
    }
    function renderEmptyAll() {
        $('statsGrid').innerHTML = '<div class="card" style="grid-column:1/-1"><p class="empty-note">No data could be loaded.</p></div>';
        $('usersBody').innerHTML = '<tr><td colspan="7" class="empty-note">No data</td></tr>';
        $('txBody').innerHTML = '<tr><td colspan="6" class="empty-note">No data</td></tr>';
    }

    /* ======================================================
       CHART HELPER
       ====================================================== */
    function drawChart(canvasId, config, emptyMsg) {
        const canvas = $(canvasId);
        const empty = canvas.parentElement.querySelector('.chart-empty');
        if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
        if (emptyMsg) {
            canvas.classList.add('hidden'); empty.textContent = emptyMsg; empty.classList.remove('hidden'); return;
        }
        canvas.classList.remove('hidden'); empty.classList.add('hidden');
        if (typeof Chart === 'undefined') {
            canvas.classList.add('hidden'); empty.textContent = 'Charts could not load. Check your connection.'; empty.classList.remove('hidden'); return;
        }
        const muted = cssVar('--text-muted'), grid = cssVar('--border-color');
        config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
        config.options.plugins = Object.assign({ legend: { labels: { color: muted, boxWidth: 12, usePointStyle: true } } }, config.options.plugins || {});
        if (config.type !== 'doughnut') {
            config.options.scales = config.options.scales || {
                x: { ticks: { color: muted, maxRotation: 0, autoSkip: true }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: muted, precision: 0 }, grid: { color: grid } }
            };
        }
        charts[canvasId] = new Chart(canvas.getContext('2d'), config);
    }

    function barRows(el, rows, emptyText) {
        if (!rows.length) { el.innerHTML = '<p class="empty-note">' + esc(emptyText) + '</p>'; return; }
        const max = Math.max(...rows.map(r => r.value), 1);
        el.innerHTML = rows.map(r => (
            '<div class="bar-row"><div class="bar-top"><span>' + esc(r.label) + '</span><span>' + esc(r.right) + '</span></div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(3, Math.round(r.value / max * 100)) + '%"></div></div></div>'
        )).join('');
    }
    const countBy = (arr, fn) => { const m = new Map(); arr.forEach(x => { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

    /* ======================================================
       OVERVIEW
       ====================================================== */
    function statCard(label, value, sub, icon, tone) {
        return '<div class="stat-card"><div class="stat-header"><span class="stat-label">' + esc(label) + '</span><div class="stat-icon tone-' + tone + '"><i class="fa-solid ' + icon + '"></i></div></div>' +
            '<div class="stat-value">' + esc(value) + '</div><div class="stat-sub">' + esc(sub) + '</div></div>';
    }

    function renderOverview() {
        if (!D.loadedAt) return;
        const users = M.users.filter(u => !u.profileMissing);
        const d7 = Date.now() - 7 * 86400000;
        const withJoined = users.filter(u => u.joinedTs);
        const new7 = withJoined.filter(u => u.joinedTs >= d7).length;
        const cut30 = daysAgoStr(30), cut7 = daysAgoStr(7);
        const active30 = users.filter(u => u.lastTx && u.lastTx >= cut30).length;
        const active7 = users.filter(u => u.lastTx && u.lastTx >= cut7).length;
        const openDebts = D.debts.filter(d => !d.settled).length;

        $('statsGrid').innerHTML = [
            statCard('Total users', compact(users.length), withJoined.length ? compact(new7) + ' joined in the last 7 days' : 'Sign-up dates fill in as users open the app', 'fa-users', 'primary'),
            statCard('Active users (30d)', compact(active30), compact(active7) + ' in the last 7 days', 'fa-bolt', 'success'),
            statCard('Transactions', compact(D.tx.length), users.length ? (D.tx.length / users.length).toFixed(1) + ' per user on average' : 'No users yet', 'fa-receipt', 'warning'),
            statCard('Savings goals', compact(D.goals.length), compact(users.filter(u => u.goals > 0).length) + ' users have at least one', 'fa-piggy-bank', 'success'),
            statCard('Open debts', compact(openDebts), compact(D.debts.length - openDebts) + ' settled', 'fa-handshake', 'danger'),
            statCard('Onboarded', users.length ? Math.round(users.filter(u => u.onboarded).length / users.length * 100) + '%' : '0%', 'finished first-time setup', 'fa-flag-checkered', 'primary')
        ].join('');

        // Activity: tx per day, last 30 days
        const days = [];
        for (let i = 29; i >= 0; i--) days.push(daysAgoStr(i));
        const perDay = countBy(D.tx, t => typeof t.date === 'string' ? t.date : '');
        const series = days.map(d => perDay.get(d) || 0);
        const primary = cssVar('--primary');
        drawChart('chActivity', {
            type: 'line',
            data: { labels: days.map(d => d.slice(5)), datasets: [{ label: 'Transactions', data: series, borderColor: primary, backgroundColor: primary + '22', fill: true, tension: .35, pointRadius: 0, pointHoverRadius: 4 }] },
            options: { plugins: { legend: { display: false } } }
        }, series.some(v => v > 0) ? '' : 'No transactions in the last 30 days.');

        // Categories (expenses)
        const cats = topN(countBy(D.tx.filter(t => t.type === 'expense'), t => t.category || 'Other'), 6);
        const palette = [primary, cssVar('--success'), cssVar('--warning'), cssVar('--danger'), '#7551ff', '#39b8ff'];
        drawChart('chCategories', {
            type: 'doughnut',
            data: { labels: cats.map(c => c[0]), datasets: [{ data: cats.map(c => c[1]), backgroundColor: palette, borderWidth: 0 }] },
            options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: cssVar('--text-muted'), boxWidth: 12, usePointStyle: true } } } }
        }, cats.length ? '' : 'No expenses logged yet.');

        // Users by currency
        const curCounts = topN(countBy(users, u => u.currency), 8);
        barRows($('currencyBars'), curCounts.map(([c, n]) => ({ label: c, value: n, right: n + (n === 1 ? ' user' : ' users') })), 'No users yet.');

        // Money per currency
        const money$ = new Map();
        M.users.forEach(u => {
            const m = money$.get(u.currency) || { inc: 0, exp: 0 };
            m.inc += u.income; m.exp += u.expense; money$.set(u.currency, m);
        });
        const rows = [...money$.entries()].filter(([, m]) => m.inc || m.exp).sort((a, b) => (b[1].inc + b[1].exp) - (a[1].inc + a[1].exp));
        $('moneyBody').innerHTML = rows.length
            ? rows.map(([c, m]) => '<tr><td><strong>' + esc(c) + '</strong></td><td class="num">' + esc(money(m.inc, c)) + '</td><td class="num">' + esc(money(m.exp, c)) + '</td></tr>').join('')
            : '<tr><td colspan="3" class="empty-note">Nothing tracked yet.</td></tr>';
    }

    /* ======================================================
       USERS
       ====================================================== */
    function populateCurrencyFilter() {
        const sel = $('userCurrency');
        const cur = sel.value;
        const codes = [...new Set(M.users.map(u => u.currency))].sort();
        sel.innerHTML = '<option value="">All currencies</option>' + codes.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
        sel.value = codes.includes(cur) ? cur : '';
    }

    function pager(el, total, page, onGo) {
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
        const to = Math.min(total, page * PAGE_SIZE);
        el.innerHTML = '<span>' + (total ? from + '-' + to + ' of ' + compact(total) : 'No results') + '</span>' +
            '<div class="btns"><button class="btn btn-outline btn-small" data-go="-1"' + (page <= 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left"></i> Prev</button>' +
            '<button class="btn btn-outline btn-small" data-go="1"' + (page >= pages ? ' disabled' : '') + '>Next <i class="fa-solid fa-chevron-right"></i></button></div>';
        el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => onGo(page + Number(b.dataset.go))));
    }

    function filterUsers() {
        const q = $('userSearch').value.trim().toLowerCase();
        const cur = $('userCurrency').value;
        const sort = $('userSort').value;
        let list = M.users.filter(u => {
            if (cur && u.currency !== cur) return false;
            if (!q) return true;
            return [u.name, u.username, u.email, u.accountId, u.uid].some(v => String(v || '').toLowerCase().includes(q));
        });
        const by = {
            joined: (a, b) => b.joinedTs - a.joinedTs || a.display.localeCompare(b.display),
            activity: (a, b) => (b.lastTx || '').localeCompare(a.lastTx || ''),
            tx: (a, b) => b.txCount - a.txCount,
            name: (a, b) => a.display.localeCompare(b.display)
        };
        return list.sort(by[sort] || by.joined);
    }

    function renderUsers() {
        if (!D.loadedAt) return;
        const list = filterUsers();
        S.usersFiltered = list;
        const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        if (S.userPage > pages) S.userPage = pages;
        if (S.userPage < 1) S.userPage = 1;
        const slice = list.slice((S.userPage - 1) * PAGE_SIZE, S.userPage * PAGE_SIZE);
        $('usersBody').innerHTML = slice.length ? slice.map(u => (
            '<tr class="clickable" tabindex="0" data-uid="' + esc(u.uid) + '">' +
            '<td><div class="user-cell"><div class="avatar">' + esc((u.display.charAt(0) || '?').toUpperCase()) + '</div><div class="meta"><strong>' + esc(u.display) + '</strong><small>' + (u.username ? '@' + esc(u.username) : '&nbsp;') + '</small></div></div></td>' +
            '<td>' + (u.email ? esc(u.email) : '<span class="muted">—</span>') + '</td>' +
            '<td>' + (u.accountId ? esc(u.accountId) : '<span class="muted">—</span>') + '</td>' +
            '<td><span class="badge badge-neutral">' + esc(u.currency) + '</span></td>' +
            '<td class="num">' + compact(u.txCount) + '</td>' +
            '<td>' + esc(fmtDate(u.lastTx)) + '</td>' +
            '<td>' + esc(fmtDate(u.createdAt)) + '</td></tr>'
        )).join('') : '<tr><td colspan="7" class="empty-note">No users match your search.</td></tr>';
        pager($('usersPager'), list.length, S.userPage, p => { S.userPage = p; renderUsers(); });
    }

    function exportUsers() {
        if (!S.usersFiltered.length) return toast('Nothing to export.');
        const head = ['Name', 'Username', 'Email', 'Account ID', 'Currency', 'Joined', 'Transactions', 'Last activity'];
        const rows = S.usersFiltered.map(u => [u.name, u.username, u.email, u.accountId, u.currency, u.createdAt ? u.createdAt.slice(0, 10) : '', u.txCount, u.lastTx]);
        const csv = [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'edufinance-users-' + ymd(new Date()) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Exported ' + S.usersFiltered.length + ' users', 'success');
    }

    /* ======================================================
       TRANSACTIONS
       ====================================================== */
    function renderTx() {
        if (!D.loadedAt) return;
        const q = $('txSearch').value.trim().toLowerCase();
        const type = $('txType').value;
        let list = D.tx.filter(t => {
            if (type && t.type !== type) return false;
            if (!q) return true;
            const u = M.byUid.get(t.uid);
            return [t.description, t.category, u && u.display, u && u.username, u && u.email].some(v => String(v || '').toLowerCase().includes(q));
        });
        list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        S.txFiltered = list;
        const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        if (S.txPage > pages) S.txPage = pages;
        if (S.txPage < 1) S.txPage = 1;
        const slice = list.slice((S.txPage - 1) * PAGE_SIZE, S.txPage * PAGE_SIZE);
        $('txBody').innerHTML = slice.length ? slice.map(t => {
            const u = M.byUid.get(t.uid);
            const isInc = t.type === 'income';
            return '<tr class="clickable" data-uid="' + esc(t.uid) + '">' +
                '<td>' + esc(fmtDate(t.date)) + '</td>' +
                '<td>' + esc(u ? u.display : 'Unknown') + '</td>' +
                '<td>' + esc(t.description || '—') + '</td>' +
                '<td>' + esc(t.category || '—') + '</td>' +
                '<td><span class="badge ' + (isInc ? 'badge-income' : 'badge-expense') + '">' + (isInc ? 'Income' : 'Expense') + '</span></td>' +
                '<td class="num"><strong>' + esc(money(num(t.amount), u && u.currency)) + '</strong></td></tr>';
        }).join('') : '<tr><td colspan="6" class="empty-note">No transactions match.</td></tr>';
        pager($('txPager'), list.length, S.txPage, p => { S.txPage = p; renderTx(); });
    }

    /* ======================================================
       ANALYTICS
       ====================================================== */
    function renderAnalytics() {
        if (!D.loadedAt) return;
        const users = M.users.filter(u => !u.profileMissing);
        const withTx = users.filter(u => u.txCount > 0).length;
        const ages = users.map(u => ageFromDob(u.dob)).filter(a => a !== null);
        const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : '—';
        const incCount = D.tx.filter(t => t.type === 'income').length;
        const expCount = D.tx.filter(t => t.type === 'expense').length;
        const withDebts = users.filter(u => u.debtsOpen > 0).length;

        $('anKpis').innerHTML = [
            statCard('Logged at least 1 transaction', users.length ? Math.round(withTx / users.length * 100) + '%' : '0%', compact(withTx) + ' of ' + compact(users.length) + ' users', 'fa-circle-check', 'success'),
            statCard('Average age', String(avgAge), ages.length + ' users gave a valid birth date', 'fa-cake-candles', 'primary'),
            statCard('Income vs expense entries', compact(incCount) + ' / ' + compact(expCount), 'income / expense', 'fa-scale-balanced', 'warning'),
            statCard('Users with open debts', compact(withDebts), 'in the Owe / Owed tracker', 'fa-handshake', 'danger')
        ].join('');

        const primary = cssVar('--primary'), success = cssVar('--success'), danger = cssVar('--danger');

        // Signups per month (last 12)
        const months = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.getFullYear() + '-' + pad(d.getMonth() + 1)); }
        const signMap = countBy(users.filter(u => u.createdAt), u => u.createdAt.slice(0, 7));
        const signSeries = months.map(m => signMap.get(m) || 0);
        drawChart('anSignups', {
            type: 'bar',
            data: { labels: months.map(m => m.slice(2)), datasets: [{ label: 'New users', data: signSeries, backgroundColor: primary, borderRadius: 6 }] },
            options: { plugins: { legend: { display: false } } }
        }, signSeries.some(v => v > 0) ? '' : 'Sign-up dates are being collected. They appear as users open the updated app.');

        // Age groups
        const buckets = [['13-17', 13, 17], ['18-22', 18, 22], ['23-27', 23, 27], ['28-35', 28, 35], ['36+', 36, 200]];
        const ageSeries = buckets.map(([, lo, hi]) => ages.filter(a => a >= lo && a <= hi).length);
        drawChart('anAges', {
            type: 'bar',
            data: { labels: buckets.map(b => b[0]), datasets: [{ label: 'Users', data: ageSeries, backgroundColor: success, borderRadius: 6 }] },
            options: { plugins: { legend: { display: false } } }
        }, ages.length ? '' : 'No valid birth dates yet.');

        // Monthly income vs expense (last 6)
        const last6 = months.slice(-6);
        const incM = countBy(D.tx.filter(t => t.type === 'income' && typeof t.date === 'string'), t => t.date.slice(0, 7));
        const expM = countBy(D.tx.filter(t => t.type === 'expense' && typeof t.date === 'string'), t => t.date.slice(0, 7));
        const incS = last6.map(m => incM.get(m) || 0), expS = last6.map(m => expM.get(m) || 0);
        drawChart('anMonthly', {
            type: 'bar',
            data: { labels: last6.map(m => m.slice(2)), datasets: [
                { label: 'Income', data: incS, backgroundColor: success, borderRadius: 6 },
                { label: 'Expense', data: expS, backgroundColor: danger, borderRadius: 6 }
            ] }
        }, (incS.concat(expS)).some(v => v > 0) ? '' : 'No transactions in the last 6 months.');

        // Income sources
        const srcMap = new Map();
        users.forEach(u => u.incomeSources.forEach(s => { if (typeof s === 'string' && s) srcMap.set(s, (srcMap.get(s) || 0) + 1); }));
        const src = topN(srcMap, 8);
        barRows($('incomeSources'), src.map(([k, n]) => ({ label: k, value: n, right: String(n) })), 'No onboarding answers yet.');
    }

    /* ======================================================
       ADMINS
       ====================================================== */
    async function renderAdmins() {
        const body = $('adminsBody');
        body.innerHTML = '<tr><td colspan="2"><div class="skel"></div></td></tr>';
        try {
            const snap = await db.collection('admins').get();
            if (!snap.size) { body.innerHTML = '<tr><td colspan="2" class="empty-note">No admins found.</td></tr>'; return; }
            body.innerHTML = snap.docs.map(d => {
                const x = d.data() || {};
                const label = x.name || x.email || 'Admin';
                const me = ME && d.id === ME.user.uid;
                return '<tr><td><div class="user-cell"><div class="avatar">' + esc(label.charAt(0).toUpperCase()) + '</div><div class="meta"><strong>' + esc(label) + (me ? ' (you)' : '') + '</strong><small>' + esc(x.email || '') + '</small></div></div></td>' +
                    '<td><code>' + esc(d.id) + '</code></td></tr>';
            }).join('');
        } catch (e) {
            body.innerHTML = '<tr><td colspan="2" class="empty-note">Could not load admins (' + esc(e.code || 'error') + ').</td></tr>';
        }
    }

    /* ======================================================
       USER DETAIL MODAL
       ====================================================== */
    let lastFocus = null;
    function openUser(uid) {
        const u = M.byUid.get(uid);
        if (!u) return;
        lastFocus = document.activeElement;
        const age = ageFromDob(u.dob);
        const txs = D.tx.filter(t => t.uid === uid).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        const goals = D.goals.filter(g => g.uid === uid);
        const net = u.income - u.expense;
        const item = (k, v) => '<div class="info-item"><small>' + esc(k) + '</small><span>' + (v ? esc(v) : '<span class="muted">—</span>') + '</span></div>';

        $('userModalBody').innerHTML =
            '<div class="modal-head"><div class="avatar lg">' + esc((u.display.charAt(0) || '?').toUpperCase()) + '</div>' +
            '<div class="grow"><h2 id="umTitle">' + esc(u.display) + '</h2><small>' + (u.username ? '@' + esc(u.username) : '') + (u.accountId ? ' · ' + esc(u.accountId) : '') + '</small></div>' +
            '<button class="icon-btn" id="umClose" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +

            '<div class="info-grid">' +
            item('Email', u.email) + item('Currency', u.currency) +
            item('Age', age === null ? '' : String(age)) + item('Joined', u.createdAt ? fmtDate(u.createdAt) : '') +
            item('Last activity', u.lastTx ? fmtDate(u.lastTx) : '') + item('Onboarding', u.onboarded ? 'Completed' : 'Not completed') +
            '</div>' +

            '<div class="info-grid">' +
            item('Transactions', compact(u.txCount)) + item('Income', money(u.income, u.currency)) +
            item('Expenses', money(u.expense, u.currency)) + item('Net', money(net, u.currency)) +
            item('Savings goals', compact(u.goals)) + item('Open debts', compact(u.debtsOpen)) +
            '</div>' +

            (goals.length ? '<h3>Savings goals</h3>' + goals.slice(0, 6).map(g => {
                const pct = num(g.target) > 0 ? Math.min(100, Math.round(num(g.current) / num(g.target) * 100)) : 0;
                return '<div class="goal-row bar-row"><div class="bar-top"><span>' + esc(g.name || 'Goal') + '</span><span>' + esc(money(num(g.current), u.currency)) + ' / ' + esc(money(num(g.target), u.currency)) + '</span></div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div></div>';
            }).join('') : '') +

            '<h3>Recent transactions</h3><div class="table-wrap"><table style="min-width:520px"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>' +
            (txs.length ? txs.slice(0, 10).map(t => '<tr><td>' + esc(fmtDate(t.date)) + '</td><td>' + esc(t.description || '—') + '</td><td>' + esc(t.category || '—') + '</td><td class="num"><span class="' + (t.type === 'income' ? 'badge badge-income' : 'badge badge-expense') + '">' + (t.type === 'income' ? '+' : '-') + esc(money(num(t.amount), u.currency)) + '</span></td></tr>').join('')
                : '<tr><td colspan="4" class="empty-note">No transactions yet.</td></tr>') +
            '</tbody></table></div>' +

            '<div class="modal-foot"><button class="btn btn-outline" id="umCopy"><i class="fa-regular fa-copy"></i> Copy UID</button><button class="btn btn-primary" id="umDone">Close</button></div>';

        $('umClose').addEventListener('click', closeUser);
        $('umDone').addEventListener('click', closeUser);
        $('umCopy').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(uid); toast('UID copied', 'success'); } catch (e) { toast('Could not copy'); }
        });
        $('userModal').classList.add('show');
        $('umDone').focus();
    }
    function closeUser() {
        const m = $('userModal');
        if (!m.classList.contains('show')) return;
        m.classList.remove('show');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
})();
