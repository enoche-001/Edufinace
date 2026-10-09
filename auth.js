/* =========================================
    EduFinance - Auth Script (login.html)
    ========================================= */

const firebaseConfig = {
    apiKey: "AIzaSyCoYCIqZH-HOrT6TDOHCxEx2gwDkwdWUB4",
    authDomain: "edufinance-5b7f4.firebaseapp.com",
    projectId: "edufinance-5b7f4",
    storageBucket: "edufinance-5b7f4.firebasestorage.app",
    messagingSenderId: "810409268124",
    appId: "1:810409268124:web:dd782b00adf4d0c7b82e59"
};

let app, auth, db, googleProvider;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();
} catch (e) {
    console.error("Firebase init error:", e);
}

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    const verifySection = document.getElementById('verify-section');
    const verifyEmailEl = document.getElementById('verifyEmail');
    const verifyDoneBtn = document.getElementById('verifyDoneBtn');
    const resendBtn = document.getElementById('resendBtn');
    const verifyBackBtn = document.getElementById('verifyBackBtn');
    const showSignupBtn = document.getElementById('showSignupBtn');
    const showLoginBtn = document.getElementById('showLoginBtn');

    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const googleSignupBtn = document.getElementById('googleSignupBtn');

    // Wizard panes & step pills
    const paneStep1 = document.getElementById('paneStep1');
    const paneStep2 = document.getElementById('paneStep2');
    const paneStep3 = document.getElementById('paneStep3');
    const wStep1 = document.getElementById('wStep1');
    const wStep2 = document.getElementById('wStep2');
    const wStep3 = document.getElementById('wStep3');

    const nextToStep2 = document.getElementById('nextToStep2');
    const nextToStep3 = document.getElementById('nextToStep3');
    const backToStep1 = document.getElementById('backToStep1');
    const backToStep2 = document.getElementById('backToStep2');

    const signupUsername = document.getElementById('signupUsername');
    const usernameStatus = document.getElementById('usernameStatus');

    const googleInfoModal = document.getElementById('googleInfoModal');
    const googleInfoForm = document.getElementById('googleInfoForm');
    let pendingGoogleUser = null;
    let usernameAvailable = false;
    let usernameCheckTimeout = null;

    // Sent here by admin.html when the signed-in user isn't an admin
    if (new URLSearchParams(window.location.search).get('error') === 'unauthorized') {
        showToast('You do not have admin access.', 'error');
    }

    // Currency dropdowns
    const detectedCurrency = EduCurrency.detect();
    const signupCurrencyEl = document.getElementById('signupCurrency');
    const googleCurrencyEl = document.getElementById('googleCurrency');
    if (signupCurrencyEl) EduCurrency.populateSelect(signupCurrencyEl, detectedCurrency);
    if (googleCurrencyEl) EduCurrency.populateSelect(googleCurrencyEl, detectedCurrency);

    // View Toggles
    function showSection(name) {
        if (loginSection) loginSection.classList.toggle('hidden', name !== 'login');
        if (signupSection) signupSection.classList.toggle('hidden', name !== 'signup');
        if (verifySection) verifySection.classList.toggle('hidden', name !== 'verify');
        if (name !== 'verify') stopVerifyPolling();
    }

    if (showSignupBtn) {
        showSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('signup');
            goToStep(1);
        });
    }

    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('login');
        });
    }

    // ---------- Email verification ----------
    let verifyPoll = null;
    let resendTimer = null;

    function goToDashboard(msg) {
        localStorage.setItem('edu_is_logged_in', 'true');
        showToast(msg || 'Welcome!', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
    }

    function startResendCooldown(seconds) {
        if (!resendBtn) return;
        clearInterval(resendTimer);
        let left = seconds;
        resendBtn.disabled = true;
        resendBtn.textContent = `Resend in ${left}s`;
        resendTimer = setInterval(() => {
            left--;
            if (left <= 0) {
                clearInterval(resendTimer);
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend email';
            } else {
                resendBtn.textContent = `Resend in ${left}s`;
            }
        }, 1000);
    }

    // Reload the user from Firebase and, once verified, refresh the token so database rules see it
    async function checkVerified(silent) {
        const user = auth && auth.currentUser;
        if (!user) return false;
        try {
            await user.reload();
            if (auth.currentUser && auth.currentUser.emailVerified) {
                await auth.currentUser.getIdToken(true);
                stopVerifyPolling();
                goToDashboard('Email verified!');
                return true;
            }
        } catch (err) {
            console.error('Verify check error:', err);
        }
        if (!silent) showToast("We can't see your verification yet. Open the link in your email, then try again.", 'error');
        return false;
    }

    function stopVerifyPolling() {
        clearInterval(verifyPoll);
        verifyPoll = null;
        clearInterval(resendTimer);
    }

    function showVerifyScreen(user, cooldown) {
        if (verifyEmailEl) verifyEmailEl.textContent = user.email || '';
        showSection('verify');
        startResendCooldown(cooldown || 0);
        if (!cooldown && resendBtn) { resendBtn.disabled = false; resendBtn.textContent = 'Resend email'; }
        clearInterval(verifyPoll);
        verifyPoll = setInterval(() => checkVerified(true), 4000);
    }

    if (verifyDoneBtn) {
        verifyDoneBtn.addEventListener('click', async () => {
            verifyDoneBtn.disabled = true;
            await checkVerified(false);
            verifyDoneBtn.disabled = false;
        });
    }

    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            const user = auth && auth.currentUser;
            if (!user) return;
            resendBtn.disabled = true;
            try {
                await user.sendEmailVerification();
                showToast('Verification email sent.', 'success');
                startResendCooldown(60);
            } catch (err) {
                console.error('Resend error:', err);
                showToast(friendlyError(err), 'error');
                startResendCooldown(30);
            }
        });
    }

    if (verifyBackBtn) {
        verifyBackBtn.addEventListener('click', async () => {
            try { if (auth) await auth.signOut(); } catch (e) { /* ignore */ }
            localStorage.removeItem('edu_is_logged_in');
            showSection('signup');
            goToStep(1);
        });
    }

    // Does this account still need to confirm its email? Only email/password accounts created
    // with verification turned on carry the flag, so older accounts are never locked out.
    async function needsVerification(user) {
        if (!user || user.emailVerified) return false;
        const usesPassword = (user.providerData || []).some(p => p.providerId === 'password');
        if (!usesPassword) return false;
        try {
            if (db) {
                const snap = await db.collection('users').doc(user.uid).collection('settings').doc('profile').get();
                return !!(snap.exists && snap.data().requireEmailVerification);
            }
        } catch (err) {
            console.error('Profile check error:', err);
        }
        return false;
    }

    function friendlyError(err) {
        const map = {
            'auth/email-already-in-use': 'That email already has an account. Try logging in.',
            'auth/invalid-email': 'Enter a valid email address.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/user-not-found': 'Wrong email or password.',
            'auth/wrong-password': 'Wrong email or password.',
            'auth/invalid-credential': 'Wrong email or password.',
            'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
            'auth/network-request-failed': 'Network problem. Check your connection.',
            'auth/popup-closed-by-user': 'Sign-in was cancelled.',
            'auth/cancelled-popup-request': 'Sign-in was cancelled.'
        };
        return (err && map[err.code]) || (err && err.message) || 'Something went wrong. Please try again.';
    }

    // Arrived from the dashboard (or a refresh) while still unverified
    if (location.hash === '#verify' && auth) {
        const unsub = auth.onAuthStateChanged(async (user) => {
            unsub();
            if (!user) return;
            if (await needsVerification(user)) {
                showVerifyScreen(user, 0);
            } else if (user.emailVerified) {
                goToDashboard('Welcome back!');
            }
        });
    }

    if (location.hash === '#signup' && showSignupBtn) showSignupBtn.click();

    function goToStep(step) {
        if (paneStep1) paneStep1.classList.remove('active');
        if (paneStep2) paneStep2.classList.remove('active');
        if (paneStep3) paneStep3.classList.remove('active');

        if (wStep1) wStep1.className = 'wizard-step';
        if (wStep2) wStep2.className = 'wizard-step';
        if (wStep3) wStep3.className = 'wizard-step';

        if (step === 1) {
            if (paneStep1) paneStep1.classList.add('active');
            if (wStep1) wStep1.classList.add('active');
        } else if (step === 2) {
            if (paneStep2) paneStep2.classList.add('active');
            if (wStep1) wStep1.classList.add('completed');
            if (wStep2) wStep2.classList.add('active');
        } else if (step === 3) {
            if (paneStep3) paneStep3.classList.add('active');
            if (wStep1) wStep1.classList.add('completed');
            if (wStep2) wStep2.classList.add('completed');
            if (wStep3) wStep3.classList.add('active');
        }
    }

    // Step 1 -> Step 2
    if (nextToStep2) {
        nextToStep2.addEventListener('click', () => {
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;

            if (!email || !password) {
                showToast('Please enter your email and password.', 'error');
                return;
            }
            if (password.length < 6) {
                showToast('Password must be at least 6 characters.', 'error');
                return;
            }
            goToStep(2);
        });
    }

    if (backToStep1) {
        backToStep1.addEventListener('click', () => goToStep(1));
    }

    // Real-time Username Uniqueness Check
    if (signupUsername) {
        signupUsername.addEventListener('input', () => {
            const val = signupUsername.value.trim().toLowerCase();
            if (!val) {
                if (usernameStatus) usernameStatus.style.display = 'none';
                return;
            }
            if (val.length < 3) {
                if (usernameStatus) {
                    usernameStatus.style.display = 'flex';
                    usernameStatus.className = 'username-status taken';
                    usernameStatus.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Username must be at least 3 characters.';
                }
                usernameAvailable = false;
                return;
            }

            if (usernameStatus) {
                usernameStatus.style.display = 'flex';
                usernameStatus.className = 'username-status checking';
                usernameStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking availability...';
            }

            clearTimeout(usernameCheckTimeout);
            usernameCheckTimeout = setTimeout(async () => {
                try {
                    if (db) {
                        const snapshot = await db.collectionGroup('settings').where('username', '==', val).get();
                        if (!snapshot.empty) {
                            if (usernameStatus) {
                                usernameStatus.className = 'username-status taken';
                                usernameStatus.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Username is already taken.';
                            }
                            usernameAvailable = false;
                            return;
                        }
                    }
                    if (usernameStatus) {
                        usernameStatus.className = 'username-status available';
                        usernameStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Username available!';
                    }
                    usernameAvailable = true;
                } catch (err) {
                    console.error("Username check error:", err);
                    if (usernameStatus) {
                        usernameStatus.className = 'username-status available';
                        usernameStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Username available!';
                    }
                    usernameAvailable = true;
                }
            }, 500);
        });
    }

    // Step 2 -> Step 3
    if (nextToStep3) {
        nextToStep3.addEventListener('click', () => {
            const firstName = document.getElementById('signupFirstName').value.trim();
            const lastName = document.getElementById('signupLastName').value.trim();
            const username = signupUsername.value.trim();
            const dob = document.getElementById('signupDob').value;

            if (!firstName || !lastName || !username || !dob) {
                showToast('Please fill in all profile details.', 'error');
                return;
            }

            // Validate age >= 13
            const dobDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - dobDate.getFullYear();
            const m = today.getMonth() - dobDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
                age--;
            }
            if (age < 13) {
                showToast('You must be at least 13 years old to create an account.', 'error');
                return;
            }

            goToStep(3);
        });
    }

    if (backToStep2) {
        backToStep2.addEventListener('click', () => goToStep(2));
    }

    // Login Form Submit
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            const btn = document.getElementById('loginSubmitBtn');
            if (btn) btn.disabled = true;
            try {
                const cred = await auth.signInWithEmailAndPassword(email, password);
                if (await needsVerification(cred.user)) {
                    showVerifyScreen(cred.user, 0);
                    return;
                }
                goToDashboard('Logged in successfully!');
            } catch (err) {
                console.error("Login error:", err);
                showToast(friendlyError(err), 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    // Signup Form Submit (Step 3 Complete)
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Pressing Enter on an earlier step should move forward, not submit
            if (!paneStep3.classList.contains('active')) {
                if (paneStep1.classList.contains('active') && nextToStep2) nextToStep2.click();
                else if (paneStep2.classList.contains('active') && nextToStep3) nextToStep3.click();
                return;
            }
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            const firstName = document.getElementById('signupFirstName').value.trim();
            const lastName = document.getElementById('signupLastName').value.trim();
            const username = signupUsername.value.trim();
            const dob = document.getElementById('signupDob').value;
            const currency = EduCurrency.toCode(signupCurrencyEl ? signupCurrencyEl.value : 'USD');

            const submitBtn = document.getElementById('signupSubmitBtn');
            if (submitBtn) submitBtn.disabled = true;
            try {
                const userCred = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCred.user;
                const accountId = 'EDU-' + Math.floor(100000 + Math.random() * 900000);

                await user.updateProfile({ displayName: username });

                if (db) {
                    await db.collection('users').doc(user.uid).collection('settings').doc('profile').set({
                        username,
                        firstName,
                        lastName,
                        dob,
                        accountId,
                        currency,
                        email,
                        createdAt: new Date().toISOString(),
                        avatar: 'fa-user-graduate',
                        requireEmailVerification: true
                    });
                }

                let sent = true;
                try { await user.sendEmailVerification(); } catch (mailErr) { sent = false; console.error('Verification email error:', mailErr); }
                showToast(sent ? 'Account created. Check your email to verify it.' : 'Account created. Tap Resend to get your verification email.', sent ? 'success' : 'error');
                showVerifyScreen(user, sent ? 60 : 0);
            } catch (err) {
                console.error("Signup error:", err);
                showToast(friendlyError(err), 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Google Auth Handler
    const handleGoogleAuth = async () => {
        try {
            const res = await auth.signInWithPopup(googleProvider);
            const user = res.user;
            if (db) {
                const profileRef = db.collection('users').doc(user.uid).collection('settings').doc('profile');
                const snap = await profileRef.get();
                if (!snap.exists) {
                    pendingGoogleUser = user;
                    // Name comes straight from the Google account, so they don't retype it
                    const gp = (res.additionalUserInfo && res.additionalUserInfo.profile) || {};
                    const parts = (user.displayName || '').trim().split(/\s+/).filter(Boolean);
                    const first = gp.given_name || parts[0] || '';
                    const last = gp.family_name || parts.slice(1).join(' ');
                    document.getElementById('googleFirstName').value = first;
                    document.getElementById('googleLastName').value = last;
                    if (googleInfoModal) googleInfoModal.classList.add('show');
                    return;
                }
            }
            localStorage.setItem('edu_is_logged_in', 'true');
            showToast('Google login successful!', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } catch (err) {
            console.error("Google auth error:", err);
            showToast(friendlyError(err), 'error');
        }
    };

    if (googleLoginBtn) googleLoginBtn.addEventListener('click', handleGoogleAuth);
    if (googleSignupBtn) googleSignupBtn.addEventListener('click', handleGoogleAuth);

    if (googleInfoForm) {
        googleInfoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!pendingGoogleUser) return;

            const username = document.getElementById('googleUsername').value.trim();
            const firstName = document.getElementById('googleFirstName').value.trim();
            const lastName = document.getElementById('googleLastName').value.trim();
            const dob = document.getElementById('googleDob').value;
            const currency = EduCurrency.toCode(googleCurrencyEl ? googleCurrencyEl.value : 'USD');

            if (!dob) {
                showToast('Please enter your date of birth.', 'error');
                return;
            }

            const dobDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - dobDate.getFullYear();
            const m = today.getMonth() - dobDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
                age--;
            }
            if (age < 13) {
                showToast('You must be at least 13 years old to use EduFinance.', 'error');
                return;
            }

            const accountId = 'EDU-' + Math.floor(100000 + Math.random() * 900000);
            await pendingGoogleUser.updateProfile({ displayName: username });

            try {
                await db.collection('users').doc(pendingGoogleUser.uid).collection('settings').doc('profile').set({
                    username,
                    firstName,
                    lastName,
                    dob,
                    accountId,
                    currency,
                    email: pendingGoogleUser.email || '',
                    createdAt: new Date().toISOString(),
                    avatar: 'fa-user-graduate'
                });

                if (googleInfoModal) googleInfoModal.classList.remove('show');
                localStorage.setItem('edu_is_logged_in', 'true');
                showToast('Account setup complete!', 'success');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            } catch (err) {
                console.error("Google profile save error:", err);
                showToast(err.message, 'error');
            }
        });
    }

    function showToast(msg, type = 'info') {
        const toast = document.getElementById('toastNotification');
        const toastMsg = document.getElementById('toastMessage');
        if (!toast) return;
        toastMsg.textContent = msg;
        toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
        
        const iconEl = toast.querySelector('.toast-icon i');
        if (iconEl) {
            iconEl.className = type === 'error' ? 'fa-solid fa-circle-exclamation' : type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-info';
        }

        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    }
});
