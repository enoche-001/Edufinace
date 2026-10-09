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
    if (showSignupBtn) {
        showSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginSection) loginSection.classList.add('hidden');
            if (signupSection) signupSection.classList.remove('hidden');
            goToStep(1);
        });
    }

    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (signupSection) signupSection.classList.add('hidden');
            if (loginSection) loginSection.classList.remove('hidden');
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

            try {
                await auth.signInWithEmailAndPassword(email, password);
                showToast('Logged in successfully!', 'success');
                localStorage.setItem('edu_is_logged_in', 'true');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            } catch (err) {
                console.error("Login error:", err);
                showToast(err.message, 'error');
            }
        });
    }

    // Signup Form Submit (Step 3 Complete)
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            const firstName = document.getElementById('signupFirstName').value.trim();
            const lastName = document.getElementById('signupLastName').value.trim();
            const username = signupUsername.value.trim();
            const dob = document.getElementById('signupDob').value;
            const currency = EduCurrency.toCode(signupCurrencyEl ? signupCurrencyEl.value : 'USD');

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
                        avatar: 'fa-user-graduate'
                    });
                }

                showToast('Account created successfully!', 'success');
                localStorage.setItem('edu_is_logged_in', 'true');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            } catch (err) {
                console.error("Signup error:", err);
                showToast(err.message, 'error');
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
            showToast(err.message, 'error');
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
