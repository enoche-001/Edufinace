// EduFinance App Lock: PIN + optional fingerprint/face unlock (WebAuthn).
// This is a privacy screen for a shared or lost phone. It is stored on the device only.
(function () {
    const KEY = 'edu_lock_';
    const HINT = 'edu_lock_hint';
    const ASKED = 'edu_lock_asked_';   // first-run PIN prompt already shown for this user on this device
    let firstRun = false;
    const $ = (id) => document.getElementById(id);
    const enc = new TextEncoder();
    let uid = null, cfg = null, locked = false, hiddenAt = 0;
    let mode = 'unlock', entry = '', first = '', fails = 0, coolUntil = 0, bioTried = false, coolTimer = null;

    // ---------- storage + hashing ----------
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY + uid)); } catch (e) { return null; } };
    const save = () => { cfg ? localStorage.setItem(KEY + uid, JSON.stringify(cfg)) : localStorage.removeItem(KEY + uid); };
    const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');
    async function hashPin(pin, salt) {
        const text = salt + ':' + pin;
        if (window.crypto && crypto.subtle) {
            const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        let h = 2166136261; // fallback when not on https
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return 'f' + (h >>> 0).toString(16);
    }
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

    // ---------- biometrics ----------
    async function bioAvailable() {
        try { return !!(window.PublicKeyCredential && navigator.credentials && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
        catch (e) { return false; }
    }
    async function bioEnroll() {
        const cred = await navigator.credentials.create({ publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rp: { name: 'EduFinance', id: location.hostname },
            user: { id: crypto.getRandomValues(new Uint8Array(16)), name: uid, displayName: 'EduFinance user' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
            timeout: 60000
        } });
        return b64(cred.rawId);
    }
    async function bioCheck() {
        await navigator.credentials.get({ publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            allowCredentials: [{ type: 'public-key', id: unb64(cfg.bio), transports: ['internal'] }],
            userVerification: 'required', timeout: 60000
        } });
    }

    // ---------- overlay ----------
    function build() {
        if ($('lockScreen')) return;
        const el = document.createElement('div');
        el.id = 'lockScreen';
        el.className = 'lock-screen';
        el.hidden = true;
        el.innerHTML =
            '<div class="lock-box">' +
            '<div class="lock-icon"><i class="fa-solid fa-lock"></i></div>' +
            '<h2 id="lockTitle">Enter PIN</h2><p id="lockSub" class="lock-sub"></p>' +
            '<div class="lock-dots" id="lockDots"><span></span><span></span><span></span><span></span></div>' +
            '<div class="lock-pad" id="lockPad">' +
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 'bio', 0, 'del'].map(k =>
                k === 'bio' ? '<button type="button" class="lock-key lock-key-ghost" id="lockBio" aria-label="Use fingerprint"><i class="fa-solid fa-fingerprint"></i></button>' :
                k === 'del' ? '<button type="button" class="lock-key lock-key-ghost" data-k="del" aria-label="Delete"><i class="fa-solid fa-delete-left"></i></button>' :
                '<button type="button" class="lock-key" data-k="' + k + '">' + k + '</button>').join('') +
            '</div>' +
            '<button type="button" class="lock-link" id="lockLink"></button>' +
            '</div>';
        document.body.appendChild(el);
        $('lockPad').addEventListener('click', (e) => {
            const b = e.target.closest('[data-k]');
            if (b) press(b.dataset.k);
        });
        $('lockBio').addEventListener('click', tryBio);
        $('lockLink').addEventListener('click', onLink);
        document.addEventListener('keydown', (e) => {
            if ($('lockScreen').hidden) return;
            if (/^[0-9]$/.test(e.key)) press(e.key);
            else if (e.key === 'Backspace') press('del');
        });
    }

    function paint() {
        const dots = $('lockDots').children;
        for (let i = 0; i < 4; i++) dots[i].classList.toggle('on', i < entry.length);
        const titles = { unlock: 'Enter PIN', setup1: 'Create a PIN', setup2: 'Confirm your PIN', verify: 'Enter current PIN', change1: 'Enter new PIN', change2: 'Confirm new PIN' };
        $('lockTitle').textContent = titles[mode];
        const unlocking = mode === 'unlock';
        $('lockBio').style.visibility = (unlocking && cfg && cfg.bio) ? 'visible' : 'hidden';
        $('lockLink').textContent = unlocking ? 'Forgot PIN? Sign out' : (firstRun && (mode === 'setup1' || mode === 'setup2') ? 'Skip for now' : 'Cancel');
        if (!coolUntil || Date.now() >= coolUntil) $('lockSub').textContent = unlocking ? 'EduFinance is locked'
            : (firstRun && mode === 'setup1' ? 'Set a 4-digit PIN. On this device you will only need this PIN to open EduFinance.' : '4 digits');
    }

    function show(m) {
        build();
        mode = m; entry = ''; first = '';
        $('lockScreen').hidden = false;
        document.body.classList.add('lock-on');
        if (m === 'unlock') locked = true;
        paint();
        if (m === 'unlock' && cfg && cfg.bio && !bioTried) { bioTried = true; setTimeout(tryBio, 350); }
    }
    function hide() {
        const el = $('lockScreen');
        if (el) el.hidden = true;
        document.body.classList.remove('lock-on');
        locked = false; entry = ''; first = ''; bioTried = false; firstRun = false;
    }

    function shake(msg) {
        const d = $('lockDots');
        d.classList.add('shake');
        $('lockSub').textContent = msg || '';
        setTimeout(() => { d.classList.remove('shake'); entry = ''; paint(); if (msg) $('lockSub').textContent = msg; }, 380);
    }

    async function press(k) {
        if (coolUntil && Date.now() < coolUntil) return;
        if (k === 'del') { entry = entry.slice(0, -1); return paint(); }
        if (entry.length >= 4) return;
        entry += k; paint();
        if (entry.length < 4) return;
        const pin = entry;
        if (mode === 'unlock' || mode === 'verify') {
            if (await hashPin(pin, cfg.salt) === cfg.hash) {
                fails = 0;
                if (mode === 'unlock') return hide();
                return show('change1'); // verified: ask for the new PIN
            }
            fails++;
            if (fails >= 5) {
                fails = 0; coolUntil = Date.now() + 30000;
                clearInterval(coolTimer);
                coolTimer = setInterval(() => {
                    const s = Math.ceil((coolUntil - Date.now()) / 1000);
                    if (s <= 0) { clearInterval(coolTimer); coolUntil = 0; paint(); } else $('lockSub').textContent = 'Too many tries. Wait ' + s + 's';
                }, 500);
                return shake('Too many tries. Wait 30s');
            }
            return shake('Wrong PIN');
        }
        // setup / change: first entry, then confirm
        if (mode === 'setup1' || mode === 'change1') {
            first = pin; entry = '';
            mode = mode === 'setup1' ? 'setup2' : 'change2';
            return paint();
        }
        if (pin !== first) { mode = mode === 'setup2' ? 'setup1' : 'change1'; first = ''; return shake('PINs did not match. Try again'); }
        const salt = rnd();
        cfg = Object.assign({ delay: 30 }, cfg || {}, { salt: salt, hash: await hashPin(pin, salt) });
        save();
        localStorage.setItem(HINT, '1');
        hide(); renderCard(); toast('App lock is on');
    }

    async function tryBio() {
        if (!cfg || !cfg.bio || $('lockScreen').hidden || mode !== 'unlock') return;
        try { await bioCheck(); hide(); } catch (e) { /* cancelled: fall back to PIN */ }
    }

    function onLink() {
        if (mode !== 'unlock') { hide(); return renderCard(); }
        if (!confirm('Sign out? Signing back in with your account password will remove the app lock on this device.')) return;
        cfg = null; save(); localStorage.setItem(HINT, '0'); hide();
        firebase.auth().signOut();
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.className = 'edu-mini-toast show';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2600);
    }

    // ---------- settings card (Profile tab) ----------
    async function renderCard() {
        const tab = $('profile-tab');
        if (!tab) return;
        let card = $('lockCard');
        if (!card) { card = document.createElement('div'); card.id = 'lockCard'; card.className = 'card lock-card'; (document.getElementById('profileSideStack') || tab).appendChild(card); }
        const on = !!cfg;
        const bioOk = await bioAvailable();
        card.innerHTML =
            '<div class="sec-head"><h2>App lock</h2></div>' +
            '<p>Ask for a PIN' + (bioOk ? ' or fingerprint' : '') + ' when the app opens. Stays on this device.</p>' +
            '<div class="lock-actions">' +
            (on
                ? '<button type="button" class="btn btn-ghost btn-sm" id="lcChange">Change PIN</button>' +
                  (bioOk ? '<button type="button" class="btn btn-ghost btn-sm" id="lcBio">' + (cfg.bio ? 'Turn off fingerprint' : 'Turn on fingerprint') + '</button>' : '') +
                  '<button type="button" class="btn btn-danger btn-sm" id="lcOff">Turn off lock</button>'
                : '<button type="button" class="btn btn-primary btn-sm" id="lcOn"><i class="fa-solid fa-lock"></i> Set up PIN</button>') +
            '</div>' +
            (on ? '<div class="form-group" style="margin-top:14px"><label for="lcDelay">Lock after</label>' +
                '<select id="lcDelay" class="form-control">' +
                [[0, 'Immediately'], [30, '30 seconds'], [60, '1 minute'], [300, '5 minutes']].map(o => '<option value="' + o[0] + '"' + (cfg.delay === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
                '</select></div>' : '');
        const g = (id) => $(id);
        if (g('lcOn')) g('lcOn').onclick = () => show('setup1');
        if (g('lcChange')) g('lcChange').onclick = () => show('verify');
        if (g('lcOff')) g('lcOff').onclick = () => { if (confirm('Turn off app lock?')) { cfg = null; save(); localStorage.setItem(HINT, '0'); renderCard(); toast('App lock is off'); } };
        if (g('lcDelay')) g('lcDelay').onchange = (e) => { cfg.delay = parseInt(e.target.value, 10); save(); };
        if (g('lcBio')) g('lcBio').onclick = async () => {
            try {
                if (cfg.bio) { cfg.bio = null; } else { cfg.bio = await bioEnroll(); toast('Fingerprint unlock is on'); }
                save(); renderCard();
            } catch (e) { toast('Could not set up fingerprint on this device'); }
        };
    }

    // ---------- wiring ----------
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { hiddenAt = Date.now(); return; }
        if (cfg && !locked && hiddenAt && Date.now() - hiddenAt >= (cfg.delay || 0) * 1000) { bioTried = false; show('unlock'); }
    });

    // Cover the app straight away on reload if a lock exists on this device
    if (localStorage.getItem(HINT) === '1') { build(); document.body.classList.add('lock-on'); $('lockScreen').hidden = false; $('lockBio').style.visibility = 'hidden'; $('lockLink').textContent = ''; }

    firebase.auth().onAuthStateChanged((u) => {
        if (!u) { uid = null; cfg = null; hide(); localStorage.setItem(HINT, '0'); return; }
        uid = u.uid; cfg = load();
        localStorage.setItem(HINT, cfg ? '1' : '0');
        if (cfg) show('unlock');
        else {
            hide();
            // First time on this device: ask them to create a PIN straight away
            if (!localStorage.getItem(ASKED + uid)) {
                localStorage.setItem(ASKED + uid, '1');
                setTimeout(() => { if (!cfg && uid) { firstRun = true; show('setup1'); } }, 600);
            }
        }
        renderCard();
    });

    // Called on an explicit log out: forget this device's PIN so the next sign-in starts fresh
    window.EduLock = {
        forget: function () {
            if (uid) { localStorage.removeItem(KEY + uid); localStorage.removeItem(ASKED + uid); }
            cfg = null; localStorage.setItem(HINT, '0'); hide();
        }
    };
})();
