/* =========================================
   EduFinance - Admin Login (admin-login.html)
   Email + password only. No sign-up, no Google.
   Signing in succeeds only if admins/{uid} exists; otherwise the
   session is closed immediately.
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
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    const $ = (id) => document.getElementById(id);
    const form = $('adminLoginForm');
    const errBox = $('loginError');
    const btn = $('loginBtn');
    let signingIn = false;

    function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }

    async function isAdmin(uid) {
        try { return (await db.collection('admins').doc(uid).get()).exists; }
        catch (e) { return false; }
    }

    // Arrived from admin.html without admin access
    if (new URLSearchParams(location.search).get('error') === 'unauthorized') {
        showError('This account does not have admin access. Please sign in with an admin account.');
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    }

    // Already signed in as an admin -> straight to the dashboard
    auth.onAuthStateChanged(async (user) => {
        if (signingIn || !user) return;
        if (await isAdmin(user.uid)) window.location.replace('admin.html');
    });

    $('pwToggle').addEventListener('click', () => {
        const input = $('adminPassInput');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        $('pwToggle').innerHTML = '<i class="fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        const email = $('adminEmailInput').value.trim();
        const pass = $('adminPassInput').value;
        if (!email || !pass) { showError('Enter your email and password.'); return; }

        signingIn = true;
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        try {
            const cred = await auth.signInWithEmailAndPassword(email, pass);
            if (!(await isAdmin(cred.user.uid))) {
                await auth.signOut();
                showError('Incorrect email or password, or this account is not an admin.');
                return;
            }
            window.location.replace('admin.html');
        } catch (err) {
            showError(err.code === 'auth/too-many-requests'
                ? 'Too many attempts. Please wait a few minutes and try again.'
                : 'Incorrect email or password, or this account is not an admin.');
        } finally {
            signingIn = false;
            btn.disabled = false;
            btn.textContent = 'Sign in';
        }
    });
})();
