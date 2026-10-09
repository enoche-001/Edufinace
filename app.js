/* =========================================
   EduFinance - Dashboard App Script (dashboard.html)
   ========================================= */

const firebaseConfig = {
    apiKey: "AIzaSyCoYCIqZH-HOrT6TDOHCxEx2gwDkwdWUB4",
    authDomain: "edufinance-5b7f4.firebaseapp.com",
    projectId: "edufinance-5b7f4",
    storageBucket: "edufinance-5b7f4.firebasestorage.app",
    messagingSenderId: "810409268124",
    appId: "1:810409268124:web:dd782b00adf4d0c7b82e59"
};

let app, auth, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
} catch (e) {
    console.error("Firebase init error:", e);
}

document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    let unsubTransactions = null;
    let unsubBudgets = null;
    let unsubSavings = null;
    let unsubProjection = null;
    let unsubProfile = null;

    // First-time setup wizard gate: wait until every listener has answered once
    let onboardingStarted = false;
    const dataLoaded = { transactions: false, budgets: false, savings: false, profile: false };

    let state = {
        theme: localStorage.getItem('edu_theme') || 'light',
        transactions: [],
        budgets: {},
        savingsGoals: [],
        projection: { weeks: 16, bulk: 4000, safety: 300 },
        profile: {
            username: 'Student Wallet',
            firstName: '',
            lastName: '',
            dob: '',
            accountId: 'EDU-' + Math.floor(100000 + Math.random() * 900000),
            currency: EduCurrency.detect(),
            avatar: 'fa-user-graduate'
        }
    };

    const categories = {
        expense: [
            'Tuition & Books',
            'Rent & Utilities',
            'Groceries & Food',
            'Transport & Transit',
            'Social & Entertainment',
            'Subscriptions & Tech',
            'Health & Personal',
            'Miscellaneous'
        ],
        income: [
            'Student Loan / Grant',
            'Part-time Job / Salary',
            'Allowance / Parents',
            'Scholarship / Bursary',
            'Freelance / Side Gig',
            'Other Income'
        ]
    };

    const avatarCollection = [
        'fa-user-graduate', 'fa-user-tie', 'fa-user-astronaut', 'fa-user-ninja',
        'fa-user-shield', 'fa-user-pen', 'fa-robot', 'fa-cat',
        'fa-dog', 'fa-ghost', 'fa-dragon', 'fa-bolt'
    ];

    // DOM Elements
    const body = document.body;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const mobileToggle = document.getElementById('mobileToggle');
    const closeSidebar = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');
    const menuItems = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('pageTitle');
    const headerSubtitle = document.getElementById('headerSubtitle');
    const greetingHeading = document.getElementById('greetingHeading');
    const userAvatarEl = document.getElementById('userAvatarDisplay');

    const quickAddForm = document.getElementById('quickAddForm');
    const transTypeSelect = document.getElementById('transType');
    const transCategorySelect = document.getElementById('transCategory');
    const transDateInput = document.getElementById('transDate');

    const totalBalanceEl = document.getElementById('totalBalance');
    const monthlyIncomeEl = document.getElementById('monthlyIncome');
    const monthlyExpensesEl = document.getElementById('monthlyExpenses');
    const termForecastEl = document.getElementById('termForecast');
    const balanceStatusEl = document.getElementById('balanceStatus');

    const dashboardTransactionsTable = document.getElementById('dashboardTransactionsTable');
    const dashboardBudgetGrid = document.getElementById('dashboardBudgetGrid');
    const dashboardSavingsList = document.getElementById('dashboardSavingsList');

    const allTransactionsTable = document.getElementById('allTransactionsTable');
    const searchTransInput = document.getElementById('searchTrans');
    const filterCategorySelect = document.getElementById('filterCategory');
    const filterTypeSelect = document.getElementById('filterType');
    const sortTransSelect = document.getElementById('sortTrans');
    const paginationInfo = document.getElementById('paginationInfo');

    const budgetForm = document.getElementById('budgetForm');
    const budgetCategorySelect = document.getElementById('budgetCategory');
    const budgetFullList = document.getElementById('budgetFullList');

    const savingsGoalForm = document.getElementById('savingsGoalForm');
    const savingsCardsContainer = document.getElementById('savingsCardsContainer');

    const projectionForm = document.getElementById('projectionForm');
    const projectionResults = document.getElementById('projectionResults');

    const addFundsModal = document.getElementById('addFundsModal');
    const closeModalBtn = document.getElementById('closeModal');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const addFundsForm = document.getElementById('addFundsForm');

    // Confirm Modal Elements
    const confirmModal = document.getElementById('confirmModal');
    const confirmModalTitle = document.getElementById('confirmModalTitle');
    const confirmModalMessage = document.getElementById('confirmModalMessage');
    const closeConfirmModalBtn = document.getElementById('closeConfirmModal');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    const confirmOkBtn = document.getElementById('confirmOkBtn');
    let confirmCallback = null;

    // Profile Elements
    const profileForm = document.getElementById('profileForm');
    const passwordForm = document.getElementById('passwordForm');
    const avatarGrid = document.getElementById('avatarGrid');
    const profileAccountIdDisplay = document.getElementById('profileAccountIdDisplay');
    const profileCurrencySelect = document.getElementById('profileCurrency');
    const resetDataInsideBtn = document.getElementById('resetDataInsideBtn');

    // Export Elements
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportPrintBtn = document.getElementById('exportPrintBtn');
    const exportStartDate = document.getElementById('exportStartDate');
    const exportEndDate = document.getElementById('exportEndDate');

    const loadDemoDataBtn = document.getElementById('loadDemoData');
    const resetDataBtn = document.getElementById('resetData');
    const logoutBtn = document.getElementById('logoutBtn');
    const navToTabBtns = document.querySelectorAll('.nav-to-tab');

    const toastNotification = document.getElementById('toastNotification');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    function init() {
        applyTheme();
        setDefaultDate();
        populateCategories();
        renderAvatarOptions();
        setupEventListeners();
        setupExtraListeners();
        setupAuthListener();
    }

    function setSession(signedIn) {
        document.body.classList.toggle('is-user', signedIn);
        document.body.classList.toggle('is-guest', !signedIn);
    }

    function setupAuthListener() {
        if (!auth) {
            loadLocalDemoData();
            return;
        }

        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                setSession(true);
                state.transactions = [];
                state.budgets = {};
                state.savingsGoals = [];
                subscribeToFirestoreData(user.uid);
            } else {
                currentUser = null;
                cleanupFirestoreListeners();
                loadLocalDemoData();
            }
        });
    }

    // Visitors who are not signed in see the same dashboard, filled with demo data.
    // Anything that would save or change data asks them to sign up (see EduUI.gate).
    function loadLocalDemoData() {
        setSession(false);
        const d = window.EDU_DEMO;
        state.transactions = JSON.parse(JSON.stringify(d.transactions));
        state.budgets = Object.assign({}, d.budgets);
        state.savingsGoals = JSON.parse(JSON.stringify(d.savingsGoals));
        state.projection = Object.assign({}, d.projection);
        state.profile = Object.assign({}, d.profile);
        renderAll();
    }

    function cleanupFirestoreListeners() {
        if (unsubTransactions) unsubTransactions();
        if (unsubBudgets) unsubBudgets();
        if (unsubSavings) unsubSavings();
        if (unsubProjection) unsubProjection();
        if (unsubProfile) unsubProfile();
    }

    function subscribeToFirestoreData(uid) {
        cleanupFirestoreListeners();
        onboardingStarted = false;
        Object.keys(dataLoaded).forEach(k => { dataLoaded[k] = false; });

        const transRef = db.collection('users').doc(uid).collection('transactions');
        unsubTransactions = transRef.onSnapshot(snapshot => {
            state.transactions = [];
            snapshot.forEach(docSnap => {
                state.transactions.push({ id: docSnap.id, ...docSnap.data() });
            });
            state.transactions.sort(cmpDateThenRecorded);
            dataLoaded.transactions = true;
            renderAll();
        }, error => {
            console.error(error);
        });

        const budgetDocRef = db.collection('users').doc(uid).collection('settings').doc('budgets');
        unsubBudgets = budgetDocRef.onSnapshot(docSnap => {
            if (docSnap.exists) {
                state.budgets = docSnap.data().categories || {};
            }
            dataLoaded.budgets = true;
            renderAll();
        });

        const savingsRef = db.collection('users').doc(uid).collection('savingsGoals');
        unsubSavings = savingsRef.onSnapshot(snapshot => {
            state.savingsGoals = [];
            snapshot.forEach(docSnap => {
                state.savingsGoals.push({ id: docSnap.id, ...docSnap.data() });
            });
            dataLoaded.savings = true;
            renderAll();
        });

        const projDocRef = db.collection('users').doc(uid).collection('settings').doc('projection');
        unsubProjection = projDocRef.onSnapshot(docSnap => {
            if (docSnap.exists) {
                state.projection = docSnap.data();
            }
            renderAll();
        });

        const profileDocRef = db.collection('users').doc(uid).collection('settings').doc('profile');
        unsubProfile = profileDocRef.onSnapshot(docSnap => {
            if (docSnap.exists) {
                // Email sign-ups must confirm their address before using the app
                if (docSnap.data().requireEmailVerification && currentUser && !currentUser.emailVerified) {
                    window.location.replace('login.html#verify');
                    return;
                }
                state.profile = { ...state.profile, ...docSnap.data() };
                // One-time backfill so the admin dashboard can show email + join date for older accounts
                const pd = docSnap.data();
                if (currentUser && !window._profileBackfilled && (!pd.email || !pd.createdAt)) {
                    window._profileBackfilled = true;
                    const fill = {};
                    if (!pd.email && currentUser.email) fill.email = currentUser.email;
                    if (!pd.createdAt && currentUser.metadata && currentUser.metadata.creationTime) {
                        const ct = new Date(currentUser.metadata.creationTime);
                        if (!isNaN(ct)) fill.createdAt = ct.toISOString();
                    }
                    if (Object.keys(fill).length) profileDocRef.set(fill, { merge: true }).catch(() => {});
                }
            } else {
                if (currentUser && currentUser.displayName) {
                    state.profile.username = currentUser.displayName;
                } else if (currentUser && currentUser.email) {
                    state.profile.username = currentUser.email.split('@')[0];
                }
                profileDocRef.set(state.profile, { merge: true }).catch(() => {
                    showToast('Please add your date of birth in Profile settings to continue.', 'error');
                });
            }
            if (docSnap.exists && ageFromDob(docSnap.data().dob) === null && !window._dobPrompted) {
                window._dobPrompted = true;
                showToast('Please add your date of birth in Profile settings to keep saving data.', 'error');
            }
            dataLoaded.profile = true;
            renderAll();
        });
    }

    // Whole years between a YYYY-MM-DD string and today (null if not a real date)
    function ageFromDob(dob) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return null;
        const [y, m, d] = dob.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || y < 1900) return null;
        const now = new Date();
        let age = now.getFullYear() - y;
        if (now.getMonth() < m - 1 || (now.getMonth() === m - 1 && now.getDate() < d)) age--;
        return age;
    }

    function formatCurrency(amount) {
        return EduCurrency.format(amount, state.profile.currency);
    }

    function applyTheme() {
        const dark = state.theme === 'dark';
        if (dark) body.setAttribute('data-theme', 'dark');
        else body.removeAttribute('data-theme');
        themeToggleBtn.innerHTML = dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#0b1030' : '#f4f5fa');
    }

    function toggleTheme() {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('edu_theme', state.theme);
        applyTheme();
    }

    function setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        if (transDateInput) transDateInput.value = today;
    }

    function populateCategories() {
        const type = transTypeSelect.value;
        transCategorySelect.innerHTML = '';
        categories[type].forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            transCategorySelect.appendChild(opt);
        });

        if (budgetCategorySelect) {
            budgetCategorySelect.innerHTML = '';
            categories.expense.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                budgetCategorySelect.appendChild(opt);
            });
        }

        if (filterCategorySelect) {
            filterCategorySelect.innerHTML = '<option value="all">All Categories</option>';
            [...categories.expense, ...categories.income].forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                filterCategorySelect.appendChild(opt);
            });
        }
    }

    function avatarIcon(icon) {
        return '<i class="fa-solid ' + icon + '"></i>';
    }

    function renderAvatarOptions() {
        if (!avatarGrid) return;
        avatarGrid.innerHTML = '';
        avatarCollection.forEach(icon => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'avatar-option' + (state.profile.avatar === icon ? ' selected' : '');
            item.setAttribute('aria-label', icon.replace('fa-', '').replace(/-/g, ' '));
            item.innerHTML = avatarIcon(icon);
            item.addEventListener('click', () => {
                state.profile.avatar = icon;
                renderAvatarOptions();
                const prev = document.getElementById('profileAvatarPreview');
                if (prev) prev.innerHTML = avatarIcon(icon);
            });
            avatarGrid.appendChild(item);
        });
    }

    function setupEventListeners() {
        themeToggleBtn.addEventListener('click', toggleTheme);
        setupTxDetail();

        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(item.getAttribute('data-tab'));
                sidebar.classList.remove('open');
            });
        });

        navToTabBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.getAttribute('data-target')));
        });

        transTypeSelect.addEventListener('change', populateCategories);

        quickAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (window.EduUI.gate('Sign up to start tracking your own money.')) return;
            const newTrans = {
                type: transTypeSelect.value,
                amount: parseFloat(document.getElementById('transAmount').value),
                description: document.getElementById('transDesc').value.trim(),
                category: transCategorySelect.value,
                note: document.getElementById('transNote').value.trim(),
                date: transDateInput.value,
                createdAt: new Date().toISOString()
            };

            if (currentUser) {
                await db.collection('users').doc(currentUser.uid).collection('transactions').add(newTrans);
            } else {
                newTrans.id = 'tx_' + Date.now();
                state.transactions.unshift(newTrans);
                state.transactions.sort(cmpDateThenRecorded);
                renderAll();
            }
            quickAddForm.reset();
            setDefaultDate();
            populateCategories();
            showToast('Added', 'success');
        });

        if (searchTransInput) searchTransInput.addEventListener('input', renderAllTransactions);
        if (filterCategorySelect) filterCategorySelect.addEventListener('change', renderAllTransactions);
        if (filterTypeSelect) filterTypeSelect.addEventListener('change', renderAllTransactions);
        if (sortTransSelect) sortTransSelect.addEventListener('change', renderAllTransactions);

        if (budgetForm) {
            budgetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (window.EduUI.gate('Sign up to set your own budgets.')) return;
                const cat = document.getElementById('budgetCategory').value;
                const limit = parseFloat(document.getElementById('budgetLimit').value);
                state.budgets[cat] = limit;

                if (currentUser) {
                    await db.collection('users').doc(currentUser.uid).collection('settings').doc('budgets').set({
                        categories: state.budgets
                    }, { merge: true });
                }
                budgetForm.reset();
                renderAll();
                closeFold('budgetFormCard');
                showToast(`Budget set for ${cat}`, 'success');
            });
        }

        if (savingsGoalForm) {
            savingsGoalForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (window.EduUI.gate('Sign up to track your own goals.')) return;
                const newGoal = {
                    name: document.getElementById('goalName').value.trim(),
                    target: parseFloat(document.getElementById('targetAmount').value),
                    current: parseFloat(document.getElementById('currentSaved').value) || 0,
                    date: document.getElementById('targetDate').value || 'No deadline'
                };

                if (currentUser) {
                    await db.collection('users').doc(currentUser.uid).collection('savingsGoals').add(newGoal);
                } else {
                    newGoal.id = 'goal_' + Date.now();
                    state.savingsGoals.push(newGoal);
                    renderAll();
                }
                savingsGoalForm.reset();
                closeFold('goalFormCard');
                showToast('Goal created', 'success');
            });
        }

        if (projectionForm) {
            projectionForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                state.projection = {
                    weeks: parseInt(document.getElementById('semesterWeeks').value),
                    bulk: parseFloat(document.getElementById('bulkIncome').value),
                    safety: parseFloat(document.getElementById('savingsSafety').value) || 0
                };
                if (currentUser) {
                    await db.collection('users').doc(currentUser.uid).collection('settings').doc('projection').set(state.projection);
                }
                renderProjections();
                showToast(currentUser ? 'Plan saved' : 'Plan updated', 'success');
            });
        }

        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (window.EduUI.gate('Sign up to create your own profile.')) return;
                state.profile.username = document.getElementById('profileUsername').value.trim();
                state.profile.firstName = document.getElementById('profileFirstName').value.trim();
                state.profile.lastName = document.getElementById('profileLastName').value.trim();
                const newDob = document.getElementById('profileDob').value;
                const newAge = ageFromDob(newDob);
                if (newAge === null) {
                    showToast('Please enter a valid date of birth.', 'error');
                    return;
                }
                if (newAge < 13) {
                    showToast('You must be at least 13 years old to use EduFinance.', 'error');
                    return;
                }
                state.profile.dob = newDob;
                state.profile.currency = EduCurrency.toCode(document.getElementById('profileCurrency').value);

                if (currentUser) {
                    try {
                        await db.collection('users').doc(currentUser.uid).collection('settings').doc('profile').set(state.profile, { merge: true });
                        await currentUser.updateProfile({ displayName: state.profile.username });
                    } catch (err) {
                        console.error('Profile save error:', err);
                        showToast('Could not save profile: ' + err.message, 'error');
                        return;
                    }
                }
                renderAll();
                showToast('Profile saved', 'success');
            });
        }

        if (passwordForm) {
            passwordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const oldPwd = document.getElementById('oldPassword').value;
                const newPwd = document.getElementById('newPassword').value;

                if (window.EduUI.gate('Sign up to secure your own account.')) return;
                if (!currentUser.email) {
                    showToast('This account has no password to change.', 'error');
                    return;
                }

                try {
                    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, oldPwd);
                    await currentUser.reauthenticateWithCredential(credential);
                    await currentUser.updatePassword(newPwd);
                    passwordForm.reset();
                    showToast('Password changed successfully!', 'success');
                } catch (err) {
                    console.error("Password change error:", err);
                    showToast('Failed to change password: ' + err.message, 'error');
                }
            });
        }

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => exportTransactions('csv'));
        }
        if (exportPrintBtn) {
            exportPrintBtn.addEventListener('click', () => exportTransactions('print'));
        }

        const affordForm = document.getElementById('affordForm');
        if (affordForm) {
            affordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const amt = parseFloat(document.getElementById('affordAmount').value);
                const analyzer = new FinancialAnalyzer(state);
                const res = analyzer.canIAffordThis(amt);
                const box = document.getElementById('affordResultBox');
                if (box) box.innerHTML = callout(res.canAfford ? 'pos' : 'neg', res.canAfford ? 'You can afford it' : 'Think twice', res.advice, 'Balance after: ' + analyzer.formatCurrency(res.projectedBalanceWithPurchase));
            });
        }

        const runSimulatorBtn = document.getElementById('runSimulatorBtn');
        if (runSimulatorBtn) {
            runSimulatorBtn.addEventListener('click', () => {
                const type = document.getElementById('simulatorType').value;
                const val = parseFloat(document.getElementById('simulatorValue').value) || 0;
                const sim = new FinancialAnalyzer(state).simulateWhatIf(type, val);
                const box = document.getElementById('simulatorResultBox');
                if (box) box.innerHTML = callout('brand', '', sim.message);
            });
        }

        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
        if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
        if (addFundsModal) {
            addFundsModal.addEventListener('click', (e) => {
                if (e.target === addFundsModal) closeModal();
            });
        }

        if (addFundsForm) {
            addFundsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (window.EduUI.gate('Sign up to add money to your own goals.')) return;
                const goalId = document.getElementById('modalGoalId').value;
                const addAmt = parseFloat(document.getElementById('fundAmount').value);
                
                const goal = state.savingsGoals.find(g => g.id === goalId);
                if (goal) {
                    goal.current += addAmt;
                    if (currentUser) {
                        await db.collection('users').doc(currentUser.uid).collection('savingsGoals').doc(goalId).update({ current: goal.current });
                    }
                    closeModal();
                    renderAll();
                    showToast(`Added ${formatCurrency(addAmt)} to ${goal.name}!`, 'success');
                }
            });
        }

        if (resetDataBtn) {
            resetDataBtn.addEventListener('click', () => {
                showConfirmDialog('Reset All Data', 'Are you sure you want to delete all transactions, budgets, and savings goals? This cannot be undone.', async () => {
                    state.transactions = [];
                    state.budgets = {};
                    state.savingsGoals = [];
                    if (currentUser) {
                        const batch = db.batch();
                        const transSnap = await db.collection('users').doc(currentUser.uid).collection('transactions').get();
                        transSnap.forEach(doc => batch.delete(doc.ref));
                        const savingsSnap = await db.collection('users').doc(currentUser.uid).collection('savingsGoals').get();
                        savingsSnap.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        await db.collection('users').doc(currentUser.uid).collection('settings').doc('budgets').set({ categories: {} });
                    }
                    renderAll();
                    showToast('All data has been reset.', 'success');
                });
            });
        }

        if (resetDataInsideBtn) {
            resetDataInsideBtn.addEventListener('click', () => {
                if (window.EduUI.gate('Sign up to manage your own data.')) return;
                showConfirmDialog('Reset Account Data', 'This will wipe all your financial tracking data. Please confirm your password or intent to proceed.', async () => {
                    state.transactions = [];
                    state.budgets = {};
                    state.savingsGoals = [];
                    if (currentUser) {
                        const batch = db.batch();
                        const transSnap = await db.collection('users').doc(currentUser.uid).collection('transactions').get();
                        transSnap.forEach(doc => batch.delete(doc.ref));
                        const savingsSnap = await db.collection('users').doc(currentUser.uid).collection('savingsGoals').get();
                        savingsSnap.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        await db.collection('users').doc(currentUser.uid).collection('settings').doc('budgets').set({ categories: {} });
                    }
                    renderAll();
                    showToast('Account data successfully reset.', 'success');
                });
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                showConfirmDialog('Logout', 'Are you sure you want to log out of EduFinance?', async () => {
                    if (auth) await auth.signOut();
                    localStorage.removeItem('edu_is_logged_in');
                    window.location.href = 'login.html';
                });
            });
        }

        if (closeConfirmModalBtn) closeConfirmModalBtn.addEventListener('click', closeConfirmModal);
        if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', closeConfirmModal);
        if (confirmOkBtn) {
            confirmOkBtn.addEventListener('click', () => {
                if (confirmCallback) confirmCallback();
                closeConfirmModal();
            });
        }
        if (confirmModal) {
            confirmModal.addEventListener('click', (e) => {
                if (e.target === confirmModal) closeConfirmModal();
            });
        }
    }

    function showConfirmDialog(title, message, onConfirm) {
        if (!confirmModal) return;
        confirmModalTitle.textContent = title;
        confirmModalMessage.textContent = message;
        confirmCallback = onConfirm;
        confirmModal.classList.add('show');
    }

    function closeConfirmModal() {
        if (!confirmModal) return;
        confirmModal.classList.remove('show');
        confirmCallback = null;
    }

    const TAB_TITLES = {
        dashboard: '', transactions: 'Transactions', budgets: 'Budgets', savings: 'Savings goals',
        debts: 'Owe / Owed', projections: 'Semester plan', intelligence: 'Insights', profile: 'Profile'
    };
    let activeTab = 'dashboard';

    function greetingWord() {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    }

    function renderHeaderTitle() {
        if (!greetingHeading || !headerSubtitle) return;
        if (activeTab === 'dashboard') {
            greetingHeading.textContent = state.profile.firstName || state.profile.username || 'Student';
            headerSubtitle.textContent = greetingWord();
        } else {
            greetingHeading.textContent = TAB_TITLES[activeTab] || '';
            headerSubtitle.textContent = '';
        }
    }

    function switchTab(tabId) {
        if (!document.getElementById(tabId + '-tab')) return;
        activeTab = tabId;
        menuItems.forEach(i => i.classList.toggle('active', i.getAttribute('data-tab') === tabId));
        tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `${tabId}-tab`));
        renderHeaderTitle();
        window.EduUI.closeAll();
        window.EduUI.tabChanged(tabId);
        window.scrollTo(0, 0);
    }
    window.EduUI.goTo = switchTab;

    function renderAll() {
        renderHeaderProfile();
        renderDashboardStats();
        renderDashboardTransactions();
        renderDashboardBudgets();
        renderDashboardSavings();
        renderAllTransactions();
        renderBudgetsList();
        renderSavingsGoals();
        renderProjections();
        renderProfileSection();
        renderIntelligenceTab();
        maybeStartOnboarding();
    }

    function localDateString() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function maybeStartOnboarding() {
        if (onboardingStarted || !currentUser || !window.EduOnboarding) return;
        if (!(dataLoaded.transactions && dataLoaded.budgets && dataLoaded.savings && dataLoaded.profile)) return;
        if (state.profile.onboarded) return;
        // Existing users who already have data are not interrupted
        if (state.transactions.length || Object.keys(state.budgets).length || state.savingsGoals.length) return;

        onboardingStarted = true;
        window.EduOnboarding.start({
            currency: state.profile.currency,
            name: state.profile.firstName || state.profile.username || '',
            expenseCategories: categories.expense,
            finish: applyOnboarding
        });
    }

    async function applyOnboarding(r) {
        const userRef = db.collection('users').doc(currentUser.uid);
        const batch = db.batch();

        if (r.startingBalance > 0) {
            batch.set(userRef.collection('transactions').doc(), {
                type: 'income',
                amount: r.startingBalance,
                description: 'Starting balance',
                category: 'Other Income',
                note: 'Added during first-time setup',
                date: localDateString(),
                createdAt: new Date().toISOString(),
                isOpeningBalance: true
            });
        }
        if (Object.keys(r.budgets).length) {
            batch.set(userRef.collection('settings').doc('budgets'), { categories: r.budgets }, { merge: true });
        }
        if (r.goal) {
            batch.set(userRef.collection('savingsGoals').doc(), r.goal);
        }
        batch.set(userRef.collection('settings').doc('projection'), r.projection);
        batch.set(userRef.collection('settings').doc('profile'), {
            onboarded: true,
            onboardedAt: localDateString(),
            incomeSources: r.incomeSources,
            monthlyIncomeEstimate: r.monthlyIncomeEstimate
        }, { merge: true });

        await batch.commit();
        showToast('All set! Your dashboard is ready.', 'success');
    }

    function renderHeaderProfile() {
        const nameEl = document.getElementById('appBarUsername');
        if (nameEl) nameEl.textContent = state.profile.username || 'Student';
        const icon = state.profile.avatar || 'fa-user-graduate';
        // One avatar only: its icon is the single child of the button
        if (userAvatarEl) userAvatarEl.innerHTML = avatarIcon(icon);
        const prev = document.getElementById('profileAvatarPreview');
        if (prev) prev.innerHTML = avatarIcon(icon);
        renderHeaderTitle();
    }

    function renderProfileSection() {
        const pUser = document.getElementById('profileUsername');
        const pFirst = document.getElementById('profileFirstName');
        const pLast = document.getElementById('profileLastName');
        const pDob = document.getElementById('profileDob');
        const pAccId = document.getElementById('profileAccountIdDisplay');
        const pCur = document.getElementById('profileCurrency');
        const pName = document.getElementById('profileNameDisplay');

        if (pUser && document.activeElement !== pUser) pUser.value = state.profile.username || '';
        if (pFirst && document.activeElement !== pFirst) pFirst.value = state.profile.firstName || '';
        if (pLast && document.activeElement !== pLast) pLast.value = state.profile.lastName || '';
        if (pDob && document.activeElement !== pDob) pDob.value = state.profile.dob || '';
        if (pAccId) pAccId.textContent = state.profile.accountId || 'EDU-XXXXXX';
        if (pName) pName.textContent = [state.profile.firstName, state.profile.lastName].filter(Boolean).join(' ') || state.profile.username || 'Student';
        if (pCur) {
            const code = EduCurrency.toCode(state.profile.currency);
            if (!pCur.options.length || pCur.value !== code) EduCurrency.populateSelect(pCur, code);
        }
        renderAvatarOptions();
    }

    // Income, expenses and per-category spending for the current month
    function monthTotals() {
        const key = localDateString().slice(0, 7);
        let inc = 0, exp = 0;
        const byCat = {};
        state.transactions.forEach(t => {
            if (!(t.date || '').startsWith(key)) return;
            if (t.type === 'income') { if (!t.isOpeningBalance) inc += t.amount; }
            else { exp += t.amount; byCat[t.category] = (byCat[t.category] || 0) + t.amount; }
        });
        return { inc, exp, byCat };
    }

    function renderDashboardStats() {
        let allIncome = 0;
        let allExpenses = 0;
        state.transactions.forEach(t => {
            if (t.type === 'income') allIncome += t.amount;
            else allExpenses += t.amount;
        });
        const balance = allIncome - allExpenses;
        const month = monthTotals();

        if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(balance);
        if (monthlyIncomeEl) monthlyIncomeEl.textContent = formatCurrency(month.inc);
        if (monthlyExpensesEl) monthlyExpensesEl.textContent = formatCurrency(month.exp);

        const remainingWeeks = state.projection.weeks || 16;
        const avgWeeklyExpense = month.exp > 0 ? (month.exp / 4) : 150;
        const forecast = balance - (avgWeeklyExpense * (remainingWeeks / 4));
        if (termForecastEl) {
            termForecastEl.textContent = formatCurrency(forecast);
            termForecastEl.className = 'forecast-value num ' + (forecast >= 0 ? 'text-pos' : 'text-neg');
        }

        if (balanceStatusEl) {
            const ok = balance >= 0;
            balanceStatusEl.className = 'chip' + (ok ? '' : ' neg');
            balanceStatusEl.innerHTML = ok
                ? '<i class="fa-solid fa-circle-check"></i> On track'
                : '<i class="fa-solid fa-triangle-exclamation"></i> Overspent';
        }
    }

    function formatShortDate(iso) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
        const [y, m, d] = iso.split('-').map(Number);
        const opts = { day: 'numeric', month: 'short' };
        if (y !== new Date().getFullYear()) opts.year = 'numeric';
        return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
    }

    function txRowHtml(t, withType) {
        const inc = t.type === 'income';
        return `
            <td><strong>${escapeHtml(t.description)}</strong>${t.note ? `<small>${escapeHtml(t.note)}</small>` : ''}</td>
            <td><span class="badge ${inc ? 'badge-income' : 'badge-expense'}">${escapeHtml(t.category)}</span></td>
            <td>${formatShortDate(t.date)}</td>
            ${withType ? `<td>${inc ? 'Income' : 'Expense'}</td>` : ''}
            <td class="amt ${inc ? 'text-pos' : 'text-neg'}">${inc ? '+' : '\u2212'}${formatCurrency(t.amount)}</td>
            <td class="act"><button type="button" class="row-btn" aria-label="Delete transaction" onclick="event.stopPropagation(); window.deleteTransaction('${escapeHtml(String(t.id))}')"><i class="fa-solid fa-trash-can"></i></button></td>
        `;
    }

    function txRowEl(t, withType) {
        const tr = document.createElement('tr');
        tr.className = 'tx-row';
        tr.dataset.id = String(t.id);
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', 'View details for ' + (t.description || 'transaction'));
        tr.innerHTML = txRowHtml(t, withType);
        return tr;
    }

    // ---- Ordering: time of recording, not just the date ----
    // Legacy records have no createdAt, so they fall back to the start of their date.
    function recordedMs(t) {
        if (t.createdAt) {
            const ms = Date.parse(t.createdAt);
            if (!isNaN(ms)) return ms;
        }
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.date || '');
        return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
    }
    // Newest recorded first (used by "Recent transactions")
    function cmpRecordedDesc(a, b) {
        return recordedMs(b) - recordedMs(a);
    }
    // Newest transaction date first; entries on the same day ordered by when they were recorded
    function cmpDateThenRecorded(a, b) {
        const d = (b.date || '').localeCompare(a.date || '');
        return d || cmpRecordedDesc(a, b);
    }

    // ---- Transaction detail card ----
    function longDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return iso || '\u2014';
        return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function openTxDetail(id) {
        const modal = document.getElementById('txDetailModal');
        const t = state.transactions.find(x => String(x.id) === String(id));
        if (!modal || !t) return;
        const inc = t.type === 'income';
        const set = (k, v) => { const el = document.getElementById(k); if (el) el.textContent = v; };

        const amtEl = document.getElementById('txDetailAmount');
        amtEl.textContent = (inc ? '+' : '\u2212') + formatCurrency(t.amount);
        amtEl.className = 'tx-detail-amount ' + (inc ? 'text-pos' : 'text-neg');
        set('txDetailTitle', t.description || 'Transaction');
        const catEl = document.getElementById('txDetailCategory');
        catEl.textContent = t.category || '\u2014';
        catEl.className = 'badge ' + (inc ? 'badge-income' : 'badge-expense');
        set('txDetailType', inc ? 'Income' : 'Expense');
        set('txDetailDate', longDate(t.date));

        const ms = t.createdAt ? Date.parse(t.createdAt) : NaN;
        set('txDetailTime', isNaN(ms) ? 'Not recorded' : new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
        set('txDetailRecorded', isNaN(ms) ? 'Added before time tracking' :
            new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
            new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));

        const noteRow = document.getElementById('txDetailNoteRow');
        if (noteRow) noteRow.hidden = !t.note;
        set('txDetailNote', t.note || '');
        const openRow = document.getElementById('txDetailOpeningRow');
        if (openRow) openRow.hidden = !t.isOpeningBalance;

        const delBtn = document.getElementById('txDetailDelete');
        if (delBtn) delBtn.onclick = () => { closeTxDetail(); window.deleteTransaction(String(t.id)); };
        modal.classList.add('show');
    }

    function closeTxDetail() {
        const modal = document.getElementById('txDetailModal');
        if (modal) modal.classList.remove('show');
    }

    function setupTxDetail() {
        const open = (e) => {
            const tr = e.target.closest && e.target.closest('tr.tx-row');
            if (!tr || e.target.closest('.row-btn')) return;
            openTxDetail(tr.dataset.id);
        };
        [dashboardTransactionsTable, allTransactionsTable].forEach(tb => {
            if (!tb) return;
            tb.addEventListener('click', open);
            tb.addEventListener('keydown', (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.tx-row')) {
                    e.preventDefault();
                    open(e);
                }
            });
        });
        const modal = document.getElementById('txDetailModal');
        const closeBtn = document.getElementById('txDetailClose');
        const doneBtn = document.getElementById('txDetailDone');
        if (closeBtn) closeBtn.addEventListener('click', closeTxDetail);
        if (doneBtn) doneBtn.addEventListener('click', closeTxDetail);
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeTxDetail(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTxDetail(); });
    }

    function emptyRow(cols, text) {
        return `<tr><td colspan="${cols}" class="empty-cell">${text}</td></tr>`;
    }

    function renderDashboardTransactions() {
        if (!dashboardTransactionsTable) return;
        dashboardTransactionsTable.innerHTML = '';
        const recent = state.transactions.slice().sort(cmpRecordedDesc).slice(0, 5);
        if (recent.length === 0) {
            dashboardTransactionsTable.innerHTML = emptyRow(5, 'No transactions yet');
            return;
        }
        recent.forEach(t => dashboardTransactionsTable.appendChild(txRowEl(t, false)));
    }

    function meterClass(pct) {
        return pct >= 100 ? 'neg' : pct >= 80 ? 'warn' : '';
    }

    function renderDashboardBudgets() {
        if (!dashboardBudgetGrid) return;
        const cats = Object.keys(state.budgets);
        if (cats.length === 0) {
            dashboardBudgetGrid.innerHTML = '<p class="empty">No budgets yet</p>';
            return;
        }
        const spent = monthTotals().byCat;
        const rows = cats.map(cat => {
            const limit = state.budgets[cat];
            const used = spent[cat] || 0;
            return { cat, limit, used, raw: limit > 0 ? (used / limit) * 100 : 0 };
        }).sort((a, b) => b.raw - a.raw).slice(0, 4);

        dashboardBudgetGrid.innerHTML = rows.map(r => {
            const pct = Math.min(Math.round(r.raw), 100);
            return `
                <div class="meter">
                    <div class="meter-top">
                        <span class="meter-name">${escapeHtml(r.cat)}</span>
                        <span class="meter-num">${formatCurrency(r.used)} / ${formatCurrency(r.limit)}</span>
                    </div>
                    <div class="bar"><i class="${meterClass(r.raw)}" style="width:${pct}%"></i></div>
                </div>`;
        }).join('');
    }

    function renderDashboardSavings() {
        if (!dashboardSavingsList) return;
        const goals = state.savingsGoals.slice(0, 3);
        if (goals.length === 0) {
            dashboardSavingsList.innerHTML = '<p class="empty">No goals yet</p>';
            return;
        }
        dashboardSavingsList.innerHTML = goals.map(g => {
            const pct = g.target > 0 ? Math.min(Math.round((g.current / g.target) * 100), 100) : 0;
            return `
                <div class="meter">
                    <div class="meter-top">
                        <span class="meter-name">${escapeHtml(g.name)}</span>
                        <span class="meter-num">${formatCurrency(g.current)} / ${formatCurrency(g.target)}</span>
                    </div>
                    <div class="bar"><i class="${pct >= 100 ? 'pos' : ''}" style="width:${pct}%"></i></div>
                </div>`;
        }).join('');
    }

    function getFilteredTransactions() {
        const searchTerm = searchTransInput ? searchTransInput.value.toLowerCase() : '';
        const catFilter = filterCategorySelect ? filterCategorySelect.value : 'all';
        const typeFilter = filterTypeSelect ? filterTypeSelect.value : 'all';
        const fromDate = exportStartDate && exportStartDate.value ? exportStartDate.value : '';
        const toDate = exportEndDate && exportEndDate.value ? exportEndDate.value : '';

        return state.transactions.filter(t => {
            const matchesSearch = t.description.toLowerCase().includes(searchTerm) || t.category.toLowerCase().includes(searchTerm);
            const matchesCat = (catFilter === 'all' || t.category === catFilter);
            const matchesType = (typeFilter === 'all' || t.type === typeFilter);
            const matchesFrom = (!fromDate || t.date >= fromDate);
            const matchesTo = (!toDate || t.date <= toDate);
            return matchesSearch && matchesCat && matchesType && matchesFrom && matchesTo;
        });
    }

    function hasActiveFilters() {
        return !!((searchTransInput && searchTransInput.value) ||
            (filterCategorySelect && filterCategorySelect.value !== 'all') ||
            (filterTypeSelect && filterTypeSelect.value !== 'all') ||
            (exportStartDate && exportStartDate.value) ||
            (exportEndDate && exportEndDate.value));
    }

    function renderAllTransactions() {
        if (!allTransactionsTable) return;
        allTransactionsTable.innerHTML = '';
        const filtered = getFilteredTransactions();
        const sort = sortTransSelect ? sortTransSelect.value : 'date-desc';
        filtered.sort((a, b) => {
            if (sort === 'date-asc') return -cmpDateThenRecorded(a, b);
            if (sort === 'amount-desc') return b.amount - a.amount || cmpDateThenRecorded(a, b);
            if (sort === 'amount-asc') return a.amount - b.amount || cmpDateThenRecorded(a, b);
            return cmpDateThenRecorded(a, b);
        });

        if (filtered.length === 0) {
            allTransactionsTable.innerHTML = emptyRow(6, hasActiveFilters() ? 'Nothing matches these filters' : 'No transactions yet');
        } else {
            filtered.forEach(t => allTransactionsTable.appendChild(txRowEl(t, true)));
        }
        if (paginationInfo) paginationInfo.textContent = `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`;
        const toggle = document.getElementById('filterToggle');
        if (toggle) toggle.classList.toggle('has-dot', hasActiveFilters());
    }

    function exportTransactions(format) {
        if (window.EduUI.gate('Sign up to export your own transactions.')) return;
        const filtered = getFilteredTransactions();
        if (filtered.length === 0) {
            showToast('No transactions found in selected range to export.', 'error');
            return;
        }

        const accountId = state.profile.accountId || 'EDU-UNKNOWN';
        const username = state.profile.username || 'Student';
        const cur = EduCurrency.toCode(state.profile.currency);

        if (format === 'csv') {
            let csv = `Account ID,Username,Currency,Description,Category,Date,Type,Amount,Note\n`;
            filtered.forEach(t => {
                csv += `"${accountId}","${username}","${cur}","${t.description.replace(/"/g, '""')}","${t.category}","${t.date}","${t.type}",${t.amount},"${(t.note || '').replace(/"/g, '""')}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `EduFinance_Transactions_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('CSV export downloaded successfully!', 'success');
        } else if (format === 'print') {
            const printWindow = window.open('', '_blank');
            let html = `
                <html>
                <head>
                    <title>EduFinance Transaction Log</title>
                    <style>
                        body { font-family: Inter, sans-serif; padding: 30px; color: #111; }
                        h2 { margin-bottom: 5px; }
                        .meta { font-size: 0.9rem; color: #555; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                        th, td { border: 1px solid #ddd; padding: 10px 12px; font-size: 0.85rem; text-align: left; }
                        th { background: #f4f4f4; }
                        .text-right { text-align: right; }
                        .success { color: #05cd99; font-weight: bold; }
                        .danger { color: #ee5d50; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h2>EduFinance Financial Report</h2>
                    <div class="meta">
                        <p><strong>Account Holder:</strong> ${escapeHtml(username)} &nbsp;|&nbsp; <strong>Account ID:</strong> ${escapeHtml(accountId)} &nbsp;|&nbsp; <strong>Currency:</strong> ${cur}</p>
                        <p><strong>Generated on:</strong> ${new Date().toLocaleDateString()} &nbsp;|&nbsp; <strong>Total Records:</strong> ${filtered.length}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Category</th>
                                <th>Type</th>
                                <th class="text-right">Amount</th>
                                <th>Note</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            filtered.forEach(t => {
                const sign = t.type === 'income' ? '+' : '-';
                const cls = t.type === 'income' ? 'success' : 'danger';
                html += `
                    <tr>
                        <td>${t.date}</td>
                        <td>${escapeHtml(t.description)}</td>
                        <td>${escapeHtml(t.category)}</td>
                        <td>${t.type}</td>
                        <td class="text-right ${cls}">${sign}${formatCurrency(t.amount)}</td>
                        <td>${escapeHtml(t.note || '')}</td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                    <script>
                        window.onload = function() { window.print(); }
                    </script>
                </body>
                </html>
            `;
            printWindow.document.write(html);
            printWindow.document.close();
            showToast('Print / PDF view opened!', 'success');
        }
    }

    function renderBudgetsList() {
        if (!budgetFullList) return;
        const cats = Object.keys(state.budgets);
        if (cats.length === 0) {
            budgetFullList.innerHTML = '<p class="empty">No budgets yet</p>';
            return;
        }
        const spent = monthTotals().byCat;
        budgetFullList.innerHTML = cats.map(cat => {
            const limit = state.budgets[cat];
            const used = spent[cat] || 0;
            const raw = limit > 0 ? (used / limit) * 100 : 0;
            const pct = Math.min(Math.round(raw), 100);
            const left = limit - used;
            return `
                <div class="budget-item">
                    <div class="meter-top">
                        <span class="meter-name">${escapeHtml(cat)}</span>
                        <span class="meter-num">${formatCurrency(used)} / ${formatCurrency(limit)}
                            <button type="button" class="row-btn" aria-label="Remove budget" onclick="window.deleteBudget('${escapeHtml(cat)}')"><i class="fa-solid fa-trash-can"></i></button>
                        </span>
                    </div>
                    <div class="bar"><i class="${meterClass(raw)}" style="width:${pct}%"></i></div>
                    <small class="${left < 0 ? 'text-neg' : 'text-muted'}">${left < 0 ? formatCurrency(-left) + ' over' : formatCurrency(left) + ' left'}</small>
                </div>`;
        }).join('');
    }

    function renderSavingsGoals() {
        if (!savingsCardsContainer) return;
        if (state.savingsGoals.length === 0) {
            savingsCardsContainer.innerHTML = '<div class="card"><p class="empty">No goals yet</p></div>';
            return;
        }
        savingsCardsContainer.innerHTML = state.savingsGoals.map(g => {
            const pct = g.target > 0 ? Math.min(Math.round((g.current / g.target) * 100), 100) : 0;
            const when = /^\d{4}-\d{2}-\d{2}$/.test(g.date || '') ? 'By ' + formatShortDate(g.date) : '';
            return `
                <div class="card goal-card">
                    <div class="goal-top">
                        <div>
                            <div class="goal-title">${escapeHtml(g.name)}</div>
                            ${when ? `<div class="goal-sub">${when}</div>` : ''}
                        </div>
                        <button type="button" class="row-btn" aria-label="Delete goal" onclick="window.deleteGoal('${escapeHtml(String(g.id))}')"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                    <div class="goal-nums"><b>${formatCurrency(g.current)}</b><span>of ${formatCurrency(g.target)} \u00b7 ${pct}%</span></div>
                    <div class="bar"><i class="${pct >= 100 ? 'pos' : ''}" style="width:${pct}%"></i></div>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="window.openAddFundsModal('${escapeHtml(String(g.id))}')">Add money</button>
                </div>`;
        }).join('');
    }

    function renderProjections() {
        if (!projectionResults) return;
        const weeks = state.projection.weeks || 16;
        const bulk = state.projection.bulk || 4000;
        const safety = state.projection.safety || 300;
        const weeklyAllowance = (bulk - safety) / weeks;

        projectionResults.innerHTML = `
            <div class="plan-result">
                <span>You can spend about</span>
                <strong>${formatCurrency(weeklyAllowance)}</strong>
                <span>each week</span>
            </div>`;

        const fill = (id, val) => {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) el.value = val;
        };
        fill('semesterWeeks', weeks);
        fill('bulkIncome', state.projection.bulk || '');
        fill('savingsSafety', state.projection.safety != null ? state.projection.safety : 500);
    }

    window.deleteTransaction = function(id) {
        if (window.EduUI.gate('Sign up to manage your own transactions.')) return;
        showConfirmDialog('Delete transaction', 'This cannot be undone.', async () => {
            await db.collection('users').doc(currentUser.uid).collection('transactions').doc(id).delete();
            showToast('Deleted', 'success');
        });
    };

    window.deleteBudget = function(cat) {
        if (window.EduUI.gate('Sign up to set your own budgets.')) return;
        showConfirmDialog('Remove budget', `Remove the limit for ${cat}?`, async () => {
            delete state.budgets[cat];
            await db.collection('users').doc(currentUser.uid).collection('settings').doc('budgets').set({ categories: state.budgets });
            renderAll();
            showToast('Budget removed', 'success');
        });
    };

    window.deleteGoal = function(id) {
        if (window.EduUI.gate('Sign up to track your own goals.')) return;
        showConfirmDialog('Delete goal', 'This cannot be undone.', async () => {
            await db.collection('users').doc(currentUser.uid).collection('savingsGoals').doc(id).delete();
            showToast('Goal deleted', 'success');
        });
    };

    window.openAddFundsModal = function(id, name) {
        if (window.EduUI.gate('Sign up to add money to your own goals.')) return;
        const goal = state.savingsGoals.find(g => g.id === id);
        document.getElementById('modalGoalId').value = id;
        document.getElementById('modalGoalName').value = name || (goal ? goal.name : '');
        document.getElementById('fundAmount').value = '';
        addFundsModal.classList.add('show');
    };

    function closeModal() {
        addFundsModal.classList.remove('show');
    }

    function showToast(message, type = 'info') {
        if (!toastMessage) return;
        toastMessage.textContent = message;
        toastNotification.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;

        const iconEl = toastNotification.querySelector('.toast-icon i');
        if (iconEl) {
            iconEl.className = type === 'error' ? 'fa-solid fa-circle-exclamation' : type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-info';
        }

        toastNotification.classList.add('show');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toastNotification.classList.remove('show'), 3000);
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ---------- Insights hub: tiles open their panel in a sheet ----------
    const panelSheet = document.getElementById('panelSheet');
    const panelBody = document.getElementById('panelSheetBody');
    const panelTitle = document.getElementById('panelSheetTitle');
    const insightStore = document.getElementById('insightStore');
    let openPanelEl = null;
    const aiCache = {};

    function returnPanel() {
        if (openPanelEl && insightStore) { insightStore.appendChild(openPanelEl); }
        openPanelEl = null;
    }

    function openPanel(key) {
        const panel = document.getElementById('panel-' + key);
        if (!panel) return;
        returnPanel();
        panelTitle.textContent = panel.dataset.title || '';
        panelBody.appendChild(panel);
        openPanelEl = panel;
        window.EduUI.open(panelSheet);
        panelBody.scrollTop = 0;
        if (key === 'review') loadAiReview();
    }
    window.EduUI.onClose((except) => { if (except !== panelSheet) returnPanel(); });

    function loadAiReview() {
        if (!currentUser || typeof getGeminiFinancialAdvice !== 'function') return;
        const autopsy = new FinancialAnalyzer(state).generateMonthlyAutopsy();
        const key = JSON.stringify(autopsy);
        if (aiCache[key]) return;
        getGeminiFinancialAdvice(autopsy).then(advice => {
            if (!advice) return;
            aiCache[key] = advice;
            const el = document.getElementById('aiAutopsyText');
            if (el) el.textContent = advice;
        });
    }

    function callout(cls, title, text, small) {
        return `<div class="callout ${cls || ''}">${title ? `<strong>${escapeHtml(title)}</strong>` : ''}${escapeHtml(text)}${small ? `<small>${escapeHtml(small)}</small>` : ''}</div>`;
    }

    function monthLabel(key) {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }

    function renderIntelligenceTab() {
        const A = new FinancialAnalyzer(state);
        const fmt = (n) => A.formatCurrency(n);
        const setSub = (key, text, cls) => {
            const el = document.querySelector('[data-sub="' + key + '"]');
            if (el) { el.textContent = text; el.className = 'tile-sub' + (cls ? ' ' + cls : ''); }
        };
        const setBox = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

        // Spending style + achievements
        const profile = A.calculateBehaviorProfile();
        const titleEl = document.getElementById('profileTitleDisplay');
        const descEl = document.getElementById('profileDescDisplay');
        if (titleEl) titleEl.textContent = profile.profileTitle;
        if (descEl) descEl.textContent = profile.description;
        const streaks = A.calculateFinancialStreaks();
        setBox('financialStreaksList', streaks.map(s => `
            <div class="list-item"><i class="fa-solid fa-award text-pos"></i>
                <div class="li-main"><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.description)}</small></div></div>`).join(''));
        setSub('style', profile.profileTitle);

        // Pace + leaks
        const sp = A.calculateSpendingSpeedometer();
        const paceTone = sp.statusType === 'warning' ? 'warn' : sp.statusType === 'success' ? 'pos' : '';
        const leaksData = A.detectSpendingLeaks();
        const leaks = leaksData.hasData ? leaksData.leaks : [];
        setBox('speedometerBox', `
            <div class="pace">
                <div class="pace-row"><div><span>Month passed</span><b>${sp.monthElapsedPct}%</b></div><div class="bar"><i style="width:${sp.monthElapsedPct}%"></i></div></div>
                <div class="pace-row"><div><span>Money spent</span><b>${sp.moneySpentPct}%</b></div><div class="bar"><i class="${paceTone === 'warn' ? 'warn' : paceTone === 'pos' ? 'pos' : ''}" style="width:${sp.moneySpentPct}%"></i></div></div>
                ${callout(paceTone, '', sp.statusMessage)}
            </div>`);
        setBox('leaksBox', leaks.map(l => callout('', l.title, l.description)).join(''));
        setSub('pace', `Spent ${sp.moneySpentPct}% \u00b7 month ${sp.monthElapsedPct}%`, paceTone === 'warn' ? 'warn' : paceTone === 'pos' ? 'pos' : '');

        // Forecast
        const pred = A.predictFutureBalance();
        setBox('futurePredictionBox', `
            <div class="big-figure"><span>Expected at month end</span><b>${fmt(pred.projectedEndMonthBalance)}</b><small>${pred.daysRemaining} days left</small></div>
            <div class="mini-grid" style="margin-top:12px">
                <div class="mini"><span>Balance now</span><b>${fmt(pred.currentBalance)}</b></div>
                <div class="mini"><span>Daily spending</span><b>${fmt(pred.dailyBurnRate)}</b></div>
            </div>`);
        setSub('forecast', fmt(pred.projectedEndMonthBalance), pred.projectedEndMonthBalance >= 0 ? 'pos' : 'neg');

        // Unusual spending
        const unusual = A.detectUnusualPurchases();
        const unusualList = unusual.hasData ? unusual.unusual : [];
        setBox('unusualPurchasesBox', unusualList.length ? unusualList.map(u => `
            <div class="list-item"><div class="li-main"><strong>${escapeHtml(u.description)}</strong><small>${escapeHtml(u.reason)}</small></div>
            <span class="li-end">${fmt(u.amount)}</span></div>`).join('') : '<p class="empty">Nothing unusual</p>');
        setSub('unusual', unusualList.length ? `${unusualList.length} flagged` : 'All clear', unusualList.length ? 'warn' : 'pos');

        // Tools
        setSub('afford', 'Check a purchase');
        setSub('whatif', 'Test a change');

        // Goal risks
        const collisions = A.detectGoalCollisions();
        setBox('goalCollisionsBox', collisions.length ? collisions.map(c => callout('warn', c.goalName, c.warning)).join('')
            : callout('pos', '', 'Your goals fit your expected cashflow.'));
        setSub('collide', collisions.length ? `${collisions.length} at risk` : 'All clear', collisions.length ? 'neg' : 'pos');

        // Recurring
        const rec = A.discoverRecurringExpenses();
        setBox('recurringExpensesBox', rec.length ? `
            <div class="table-wrap"><table class="table compact">
                <thead><tr><th>Item</th><th>Category</th><th class="amt">Amount</th><th class="amt">Times</th><th class="act"><span class="sr-only">Confirm</span></th></tr></thead>
                <tbody>${rec.map(r => `<tr>
                    <td><strong>${escapeHtml(r.description)}</strong></td>
                    <td>${escapeHtml(r.category)}</td>
                    <td class="amt">${fmt(r.amount)}</td>
                    <td class="amt">${r.occurrences}</td>
                    <td class="acts"><button type="button" class="btn btn-ghost btn-sm" onclick="window.confirmRecurring('${escapeHtml(r.description).replace(/&#039;/g, '')}', '', ${Number(r.amount) || 0})">Confirm</button></td>
                </tr>`).join('')}</tbody></table></div>` : '<p class="empty">None found yet</p>');
        setSub('recurring', rec.length ? `${rec.length} found` : 'None yet');

        // Past months
        const periods = A.getTimeMachinePeriods();
        setBox('timeMachineBox', periods.length ? `
            <div class="table-wrap"><table class="table compact">
                <thead><tr><th>Month</th><th class="amt">Income</th><th class="amt">Spent</th><th class="amt">Net</th></tr></thead>
                <tbody>${periods.map(p => `<tr>
                    <td><strong>${monthLabel(p.period)}</strong></td>
                    <td class="amt text-pos">${fmt(p.income)}</td>
                    <td class="amt text-neg">${fmt(p.expense)}</td>
                    <td class="amt ${p.net >= 0 ? 'text-pos' : 'text-neg'}">${fmt(p.net)}</td>
                </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No history yet</p>');
        setSub('history', periods.length ? `${periods.length} ${periods.length === 1 ? 'month' : 'months'}` : 'No history');

        // Why more
        const why = A.explainSpendingIncrease();
        setBox('whySpendMoreBox', callout(why.hasComparison && why.expenseDiff > 0 ? 'warn' : '', '', why.explanation));
        setSub('why', why.hasComparison ? `${why.expenseDiff > 0 ? '+' : '\u2212'}${Math.abs(why.percentChange)}% vs last month` : 'Needs 2 months',
            why.hasComparison ? (why.expenseDiff > 0 ? 'warn' : 'pos') : '');

        // Smart budgets
        const suggestions = A.generateSmartBudgets();
        setBox('smartBudgetsBox', suggestions.length ? `
            <div class="table-wrap"><table class="table compact">
                <thead><tr><th>Category</th><th class="amt">Average</th><th class="amt">Suggested</th><th class="act"><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>${suggestions.map(s => `<tr>
                    <td><strong>${escapeHtml(s.category)}</strong></td>
                    <td class="amt">${fmt(s.currentAverage)}</td>
                    <td class="amt text-pos">${fmt(s.suggestedLimit)}</td>
                    <td class="acts">
                        <button type="button" class="btn btn-primary btn-sm" onclick="window.acceptSmartBudget('${escapeHtml(s.category)}', ${Number(s.suggestedLimit)})">Accept</button>
                        <button type="button" class="btn btn-ghost btn-sm" onclick="window.editSmartBudget('${escapeHtml(s.category)}', ${Number(s.suggestedLimit)})">Edit</button>
                    </td>
                </tr>`).join('')}</tbody></table></div>` : '<p class="empty">Add more expenses first</p>');
        setSub('smart', suggestions.length ? `${suggestions.length} ${suggestions.length === 1 ? 'idea' : 'ideas'}` : 'Needs history');

        // Monthly review
        const autopsy = A.generateMonthlyAutopsy();
        const key = JSON.stringify(autopsy);
        setBox('monthlyAutopsyBox', `
            <div class="mini-grid" style="margin-bottom:12px">
                <div class="mini"><span>Biggest leak</span><b>${escapeHtml(autopsy.biggestLeak)}</b></div>
                <div class="mini"><span>Spending style</span><b>${escapeHtml(autopsy.behaviorProfile)}</b></div>
                <div class="mini wide"><span>Expected at month end</span><b class="${autopsy.projectedMonthEnd >= 0 ? 'text-pos' : 'text-neg'}">${fmt(autopsy.projectedMonthEnd)}</b></div>
            </div>
            <div class="callout brand" id="aiAutopsyText">${escapeHtml(aiCache[key] || autopsy.summary)}</div>`);
        setSub('review', autopsy.biggestLeak && autopsy.biggestLeak !== 'None' ? 'Top leak: ' + autopsy.biggestLeak : 'This month');
    }

    // ---------- Small UI behaviours ----------
    function openFold(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('open');
    }
    function closeFold(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('open');
    }

    function setupExtraListeners() {
        // Add / New buttons that reveal a form on phones
        document.querySelectorAll('.fold-btn').forEach(btn => btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.fold);
            if (target) target.classList.toggle('open');
        }));

        // Transactions filters
        const filterToggle = document.getElementById('filterToggle');
        const filterPanel = document.getElementById('filterPanel');
        if (filterToggle && filterPanel) filterToggle.addEventListener('click', () => filterPanel.classList.toggle('open'));
        [exportStartDate, exportEndDate].forEach(el => el && el.addEventListener('change', renderAllTransactions));
        const clear = document.getElementById('clearFilters');
        if (clear) clear.addEventListener('click', () => {
            if (searchTransInput) searchTransInput.value = '';
            if (filterCategorySelect) filterCategorySelect.value = 'all';
            if (filterTypeSelect) filterTypeSelect.value = 'all';
            if (sortTransSelect) sortTransSelect.value = 'date-desc';
            if (exportStartDate) exportStartDate.value = '';
            if (exportEndDate) exportEndDate.value = '';
            renderAllTransactions();
        });

        // Expense / Income switch in the add form
        document.querySelectorAll('#transTypeSeg .seg-btn').forEach(btn => btn.addEventListener('click', () => {
            document.querySelectorAll('#transTypeSeg .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
            transTypeSelect.value = btn.dataset.type;
            populateCategories();
        }));

        // Insight tiles
        document.querySelectorAll('.tile[data-panel]').forEach(tile => tile.addEventListener('click', () => openPanel(tile.dataset.panel)));
    }

    window.acceptSmartBudget = async function(cat, limit) {
        if (window.EduUI.gate('Sign up to set your own budgets.')) return;
        state.budgets[cat] = limit;
        await db.collection('users').doc(currentUser.uid).collection('settings').doc('budgets').set({
            categories: state.budgets
        }, { merge: true });
        renderAll();
        showToast(`Budget set for ${cat}`, 'success');
    };

    window.editSmartBudget = function(cat, limit) {
        switchTab('budgets');
        openFold('budgetFormCard');
        const budgetCatSelect = document.getElementById('budgetCategory');
        const budgetLimitInput = document.getElementById('budgetLimit');
        if (budgetCatSelect) budgetCatSelect.value = cat;
        if (budgetLimitInput) budgetLimitInput.value = limit;
    };

    window.confirmRecurring = function(desc, cat, amount) {
        showToast(`Confirmed: ${desc} (${formatCurrency(amount)})`, 'success');
    };

    init();
});
