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
    const authPageForm = document.getElementById('authPageForm');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const switchModeLink = document.getElementById('switchModeLink');
    const authTitle = document.getElementById('authTitle');
    const authSub = document.getElementById('authSub');
    const authActionBtn = document.getElementById('authActionBtn');
    const signupFieldsContainer = document.getElementById('signupFieldsContainer');
    const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
    const switchPromptText = document.getElementById('switchPromptText');
    const dividerText = document.getElementById('dividerText');

    const googleInfoModal = document.getElementById('googleInfoModal');
    const googleInfoForm = document.getElementById('googleInfoForm');
    let pendingGoogleUser = null;

    let isSignup = false;

    // Currency dropdowns: preselect from device, user can change
    const detectedCurrency = EduCurrency.detect();
    EduCurrency.populateSelect(document.getElementById('currencyInput'), detectedCurrency);
    EduCurrency.populateSelect(document.getElementById('googleCurrency'), detectedCurrency);

    if (switchModeLink) {
        switchModeLink.addEventListener('click', (e) => {
            e.preventDefault();
            isSignup = !isSignup;
            if (isSignup) {
                authTitle.textContent = 'Create Student Account';
                authSub.textContent = 'Join EduFinance to master your student finances';
                authActionBtn.textContent = 'Sign Up';
                if (signupFieldsContainer) signupFieldsContainer.style.display = 'flex';
                if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
                if (switchPromptText) switchPromptText.textContent = 'Already have an account?';
                switchModeLink.textContent = 'Login';
            } else {
                authTitle.textContent = 'Welcome Back';
                authSub.textContent = 'Sign in to access your student budget tracker';
                authActionBtn.textContent = 'Login';
                if (signupFieldsContainer) signupFieldsContainer.style.display = 'none';
                if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'none';
                if (switchPromptText) switchPromptText.textContent = "Don't have an account?";
                switchModeLink.textContent = 'Sign Up';
            }
        });
    }

    if (authPageForm) {
        authPageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('emailInput').value.trim();
            const password = document.getElementById('passwordInput').value;

            try {
                if (isSignup) {
                    const confirmPassword = document.getElementById('confirmPasswordInput').value;
                    if (password !== confirmPassword) {
                        showToast('Passwords do not match.', 'error');
                        return;
                    }

                    const username = document.getElementById('usernameInput').value.trim() || email.split('@')[0];
                    const firstName = document.getElementById('firstNameInput').value.trim();
                    const lastName = document.getElementById('lastNameInput').value.trim();
                    const dob = document.getElementById('dobInput').value;
                    const currency = EduCurrency.toCode(document.getElementById('currencyInput').value);

                    if (!dob) {
                        showToast('Please enter your date of birth.', 'error');
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
                            avatar: 'fa-user-graduate'
                        });
                    }

                    showToast('Account created successfully!', 'success');
                } else {
                    await auth.signInWithEmailAndPassword(email, password);
                    showToast('Logged in successfully!', 'success');
                }
                localStorage.setItem('edu_is_logged_in', 'true');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            } catch (err) {
                console.error("Auth error:", err);
                showToast(err.message, 'error');
            }
        });
    }

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', async () => {
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
        });
    }

    if (googleInfoForm) {
        googleInfoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!pendingGoogleUser) return;

            const username = document.getElementById('googleUsername').value.trim();
            const firstName = document.getElementById('googleFirstName').value.trim();
            const lastName = document.getElementById('googleLastName').value.trim();
            const dob = document.getElementById('googleDob').value;
            const currency = EduCurrency.toCode(document.getElementById('googleCurrency').value);

            if (!dob) {
                showToast('Please enter your date of birth.', 'error');
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
