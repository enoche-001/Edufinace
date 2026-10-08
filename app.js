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
        setupAuthListener();
    }

    function setupAuthListener() {
        if (!auth) {
            renderAll();
            return;
        }

        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                subscribeToFirestoreData(user.uid);
            } else {
                currentUser = null;
                loadLocalDemoData();
            }
        });
    }

    function loadLocalDemoData() {
        state.transactions = [
            { id: 'tx_1', type: 'income', amount: 3500, description: 'Student Financial Aid / Loan', category: 'Student Loan / Grant', note: 'Fall Semester Disbursement', date: '2026-09-01' },
            { id: 'tx_2', type: 'expense', amount: 950, description: 'Campus Dorm Rent', category: 'Rent & Utilities', note: 'September Rent', date: '2026-09-02' },
            { id: 'tx_3', type: 'expense', amount: 320, description: 'Semester Textbooks', category: 'Tuition & Books', note: 'Calculus 101 Book', date: '2026-09-03' },
            { id: 'tx_4', type: 'expense', amount: 145, description: 'Weekly Groceries', category: 'Groceries & Food', note: 'Trader Joes', date: '2026-09-10' }
        ];
        state.budgets = { 'Groceries & Food': 300, 'Rent & Utilities': 1000 };
        state.savingsGoals = [
            { id: 'goal_1', name: 'New MacBook Pro', target: 1200, current: 750, date: '2026-12-15' }
        ];
        state.profile = {
            username: 'Demo Student',
            firstName: 'Alex',
            lastName: 'Demo',
            dob: '2005-01-01',
            accountId: 'EDU-998877',
            currency: 'USD', // demo data is written in dollars
            avatar: 'fa-user-graduate'
        };
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
            state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
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
        if (state.theme === 'dark') {
            body.setAttribute('data-theme', 'dark');
            themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            body.removeAttribute('data-theme');
            themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
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

    function renderAvatarOptions() {
        if (!avatarGrid) return;
        avatarGrid.innerHTML = '';
        avatarCollection.forEach(icon => {
            const item = document.createElement('div');
            item.className = `avatar-option ${state.profile.avatar === icon ? 'selected' : ''}`;
            item.innerHTML = `<i class="fa-solid ${icon}"></i>`;
            item.addEventListener('click', () => {
                state.profile.avatar = icon;
                renderAvatarOptions();
            });
            avatarGrid.appendChild(item);
        });
    }

    function setupEventListeners() {
        themeToggleBtn.addEventListener('click', toggleTheme);
        mobileToggle.addEventListener('click', () => sidebar.classList.add('open'));
        closeSidebar.addEventListener('click', () => sidebar.classList.remove('open'));

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
            const newTrans = {
                type: transTypeSelect.value,
                amount: parseFloat(document.getElementById('transAmount').value),
                description: document.getElementById('transDesc').value.trim(),
                category: transCategorySelect.value,
                note: document.getElementById('transNote').value.trim(),
                date: transDateInput.value
            };

            if (currentUser) {
                await db.collection('users').doc(currentUser.uid).collection('transactions').add(newTrans);
            } else {
                newTrans.id = 'tx_' + Date.now();
                state.transactions.unshift(newTrans);
                renderAll();
            }
            quickAddForm.reset();
            setDefaultDate();
            populateCategories();
            showToast('Transaction added successfully!', 'success');
        });

        if (searchTransInput) searchTransInput.addEventListener('input', renderAllTransactions);
        if (filterCategorySelect) filterCategorySelect.addEventListener('change', renderAllTransactions);
        if (filterTypeSelect) filterTypeSelect.addEventListener('change', renderAllTransactions);
        if (sortTransSelect) sortTransSelect.addEventListener('change', renderAllTransactions);

        if (budgetForm) {
            budgetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
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
                showToast(`Budget limit set for ${cat}!`, 'success');
            });
        }

        if (savingsGoalForm) {
            savingsGoalForm.addEventListener('submit', async (e) => {
                e.preventDefault();
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
                showToast('Savings goal created!', 'success');
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
                showToast('Semester plan saved!', 'success');
            });
        }

        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
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
                showToast('Profile and currency updated successfully!', 'success');
            });
        }

        if (passwordForm) {
            passwordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const oldPwd = document.getElementById('oldPassword').value;
                const newPwd = document.getElementById('newPassword').value;

                if (!currentUser || !currentUser.email) {
                    showToast('Guest mode cannot change password.', 'error');
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
                if (box) {
                    box.innerHTML = `
                        <div style="padding: 14px; background: ${res.canAfford ? 'var(--success-light)' : 'var(--danger-light)'}; border: 1px solid ${res.canAfford ? 'var(--success)' : 'var(--danger)'}; border-radius: 10px;">
                            <strong>${res.canAfford ? '<i class="fa-solid fa-circle-check text-success"></i> Affordability Approved' : '<i class="fa-solid fa-triangle-exclamation text-danger"></i> Affordability Warning'}</strong>
                            <p style="font-size: 0.9rem; margin-top: 6px; line-height: 1.5;">${escapeHtml(res.advice)}</p>
                            <small class="text-muted" style="display: block; margin-top: 6px;">Projected balance with purchase: ${analyzer.formatCurrency(res.projectedBalanceWithPurchase)}</small>
                        </div>
                    `;
                }
            });
        }

        const runSimulatorBtn = document.getElementById('runSimulatorBtn');
        if (runSimulatorBtn) {
            runSimulatorBtn.addEventListener('click', () => {
                const type = document.getElementById('simulatorType').value;
                const val = parseFloat(document.getElementById('simulatorValue').value) || 0;
                const analyzer = new FinancialAnalyzer(state);
                const sim = analyzer.simulateWhatIf(type, val);
                const box = document.getElementById('simulatorResultBox');
                if (box) {
                    box.innerHTML = `
                        <div style="padding: 14px; background: var(--primary-light); border: 1px solid var(--primary); border-radius: 10px;">
                            <strong><i class="fa-solid fa-bolt text-primary"></i> Simulation Results</strong>
                            <p style="font-size: 0.9rem; margin-top: 6px; line-height: 1.5;">${escapeHtml(sim.message)}</p>
                        </div>
                    `;
                }
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

        if (loadDemoDataBtn) {
            if (currentUser) {
                loadDemoDataBtn.style.display = 'none';
            } else {
                loadDemoDataBtn.addEventListener('click', () => {
                    loadLocalDemoData();
                    showToast('Demo data loaded!', 'success');
                });
            }
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

    function switchTab(tabId) {
        menuItems.forEach(i => i.classList.toggle('active', i.getAttribute('data-tab') === tabId));
        tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `${tabId}-tab`));
    }

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

    // ---------- First-time setup wizard ----------
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
            expenseCategories: state.expense,
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
        const usernameEl = document.querySelector('.username');
        const greetingEl = document.getElementById('greetingHeading');
        const userAvatarDisp = document.getElementById('userAvatarDisplay');

        const uname = state.profile.username || 'Student';
        if (usernameEl) usernameEl.textContent = uname;
        if (greetingEl) greetingEl.textContent = `Welcome back, ${uname}`;
        if (userAvatarDisp) {
            userAvatarDisp.className = `avatar fa-solid ${state.profile.avatar || 'fa-user-graduate'}`;
        }

        if (loadDemoDataBtn) {
            if (currentUser) {
                loadDemoDataBtn.style.display = 'none';
            } else {
                loadDemoDataBtn.style.display = 'block';
            }
        }
    }

    function renderProfileSection() {
        const pUser = document.getElementById('profileUsername');
        const pFirst = document.getElementById('profileFirstName');
        const pLast = document.getElementById('profileLastName');
        const pDob = document.getElementById('profileDob');
        const pAccId = document.getElementById('profileAccountIdDisplay');
        const pCur = document.getElementById('profileCurrency');

        if (pUser && document.activeElement !== pUser) pUser.value = state.profile.username || '';
        if (pFirst && document.activeElement !== pFirst) pFirst.value = state.profile.firstName || '';
        if (pLast && document.activeElement !== pLast) pLast.value = state.profile.lastName || '';
        if (pDob && document.activeElement !== pDob) pDob.value = state.profile.dob || '';
        if (pAccId) pAccId.textContent = state.profile.accountId || 'EDU-XXXXXX';
        if (pCur) {
            const code = EduCurrency.toCode(state.profile.currency);
            if (!pCur.options.length || pCur.value !== code) EduCurrency.populateSelect(pCur, code);
        }
    }

    function renderDashboardStats() {
        let totalIncome = 0;
        let totalExpenses = 0;

        state.transactions.forEach(t => {
            if (t.type === 'income') totalIncome += t.amount;
            else totalExpenses += t.amount;
        });

        const balance = totalIncome - totalExpenses;
        if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(balance);
        if (monthlyIncomeEl) monthlyIncomeEl.textContent = formatCurrency(totalIncome);
        if (monthlyExpensesEl) monthlyExpensesEl.textContent = formatCurrency(totalExpenses);

        const remainingWeeks = state.projection.weeks || 16;
        const avgWeeklyExpense = totalExpenses > 0 ? (totalExpenses / 4) : 150; 
        const forecast = balance - (avgWeeklyExpense * (remainingWeeks / 4));
        if (termForecastEl) termForecastEl.textContent = formatCurrency(forecast);

        if (balanceStatusEl) {
            if (balance >= 0) {
                balanceStatusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Within safe range';
                balanceStatusEl.className = 'stat-footer text-success';
            } else {
                balanceStatusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Deficit warning!';
                balanceStatusEl.className = 'stat-footer text-danger';
            }
        }
    }

    function renderDashboardTransactions() {
        if (!dashboardTransactionsTable) return;
        dashboardTransactionsTable.innerHTML = '';
        const recent = state.transactions.slice(0, 5);

        if (recent.length === 0) {
            dashboardTransactionsTable.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No transactions found.</td></tr>`;
            return;
        }

        recent.forEach(t => {
            const tr = document.createElement('tr');
            const amtClass = t.type === 'income' ? 'text-success' : 'text-danger';
            const sign = t.type === 'income' ? '+' : '-';
            const noteHtml = t.note ? `<br><small class="text-muted"><i class="fa-solid fa-note-sticky"></i> ${escapeHtml(t.note)}</small>` : '';
            tr.innerHTML = `
                <td class="td-desc"><strong>${escapeHtml(t.description)}</strong>${noteHtml}</td>
                <td class="td-cat"><span class="badge ${t.type === 'income' ? 'badge-income' : 'badge-expense'}">${escapeHtml(t.category)}</span></td>
                <td class="td-date">${t.date}</td>
                <td class="text-right td-amt ${amtClass}"><strong>${sign}${formatCurrency(t.amount)}</strong></td>
                <td class="text-center td-act">
                    <button class="action-btn delete-btn" onclick="window.deleteTransaction('${t.id}')"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            dashboardTransactionsTable.appendChild(tr);
        });
    }

    function renderDashboardBudgets() {
        if (!dashboardBudgetGrid) return;
        dashboardBudgetGrid.innerHTML = '';
        const categoriesList = Object.keys(state.budgets);

        if (categoriesList.length === 0) {
            dashboardBudgetGrid.innerHTML = `<p class="text-muted text-center py-3 col-span-2">No budget limits configured.</p>`;
            return;
        }

        const spendingMap = {};
        state.transactions.forEach(t => {
            if (t.type === 'expense') spendingMap[t.category] = (spendingMap[t.category] || 0) + t.amount;
        });

        categoriesList.forEach(cat => {
            const limit = state.budgets[cat];
            const spent = spendingMap[cat] || 0;
            const pct = Math.min(Math.round((spent / limit) * 100), 100);
            const card = document.createElement('div');
            card.className = 'budget-progress-card';
            card.innerHTML = `
                <div class="budget-card-info">
                    <span class="budget-cat-name">${escapeHtml(cat)}</span>
                    <span class="budget-nums">${formatCurrency(spent)} / ${formatCurrency(limit)}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill ${pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : ''}" style="width: ${pct}%"></div>
                </div>
            `;
            dashboardBudgetGrid.appendChild(card);
        });
    }

    function renderDashboardSavings() {
        if (!dashboardSavingsList) return;
        dashboardSavingsList.innerHTML = '';
        const goals = state.savingsGoals.slice(0, 3);
        if (goals.length === 0) {
            dashboardSavingsList.innerHTML = `<p class="text-muted text-center py-3">No active savings goals.</p>`;
            return;
        }
        goals.forEach(g => {
            const pct = Math.min(Math.round((g.current / g.target) * 100), 100);
            const item = document.createElement('div');
            item.className = 'savings-widget-item';
            item.innerHTML = `
                <div class="budget-card-info">
                    <span class="budget-cat-name">${escapeHtml(g.name)}</span>
                    <span class="budget-nums">${formatCurrency(g.current)} / ${formatCurrency(g.target)}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${pct}%"></div>
                </div>
            `;
            dashboardSavingsList.appendChild(item);
        });
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

    function renderAllTransactions() {
        if (!allTransactionsTable) return;
        allTransactionsTable.innerHTML = '';
        const filtered = getFilteredTransactions();

        filtered.forEach(t => {
            const tr = document.createElement('tr');
            const amtClass = t.type === 'income' ? 'text-success' : 'text-danger';
            const sign = t.type === 'income' ? '+' : '-';
            const noteHtml = t.note ? `<br><small class="text-muted"><i class="fa-solid fa-note-sticky"></i> ${escapeHtml(t.note)}</small>` : '';
            tr.innerHTML = `
                <td class="td-desc"><strong>${escapeHtml(t.description)}</strong>${noteHtml}</td>
                <td class="td-cat"><span class="badge ${t.type === 'income' ? 'badge-income' : 'badge-expense'}">${escapeHtml(t.category)}</span></td>
                <td class="td-date">${t.date}</td>
                <td class="td-type"><span class="text-capitalize">${t.type}</span></td>
                <td class="text-right td-amt ${amtClass}"><strong>${sign}${formatCurrency(t.amount)}</strong></td>
                <td class="text-center td-act">
                    <button class="action-btn delete-btn" onclick="window.deleteTransaction('${t.id}')"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            allTransactionsTable.appendChild(tr);
        });
        if (paginationInfo) paginationInfo.textContent = `Showing ${filtered.length} transactions`;
    }

    function exportTransactions(format) {
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
        budgetFullList.innerHTML = '';
        const categoriesList = Object.keys(state.budgets);
        if (categoriesList.length === 0) {
            budgetFullList.innerHTML = `<p class="text-muted text-center py-4">No budgets set.</p>`;
            return;
        }
        const spendingMap = {};
        state.transactions.forEach(t => { if (t.type === 'expense') spendingMap[t.category] = (spendingMap[t.category] || 0) + t.amount; });

        categoriesList.forEach(cat => {
            const limit = state.budgets[cat];
            const spent = spendingMap[cat] || 0;
            const pct = Math.min(Math.round((spent / limit) * 100), 100);
            const item = document.createElement('div');
            item.className = 'budget-full-item';
            item.innerHTML = `
                <div class="budget-card-info">
                    <span class="budget-cat-name">${escapeHtml(cat)}</span>
                    <div>
                        <span>${formatCurrency(spent)} / ${formatCurrency(limit)}</span>
                        <button class="action-btn delete-btn" onclick="window.deleteBudget('${escapeHtml(cat)}')"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </div>
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${pct}%"></div></div>
            `;
            budgetFullList.appendChild(item);
        });
    }

    function renderSavingsGoals() {
        if (!savingsCardsContainer) return;
        savingsCardsContainer.innerHTML = '';
        if (state.savingsGoals.length === 0) {
            savingsCardsContainer.innerHTML = `<p class="text-muted text-center py-4">No savings goals.</p>`;
            return;
        }
        state.savingsGoals.forEach(g => {
            const pct = Math.min(Math.round((g.current / g.target) * 100), 100);
            const card = document.createElement('div');
            card.className = 'savings-goal-card';
            card.innerHTML = `
                <div class="goal-card-top">
                    <h3 class="goal-title">${escapeHtml(g.name)}</h3>
                    <button class="action-btn delete-btn" onclick="window.deleteGoal('${g.id}')"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <div class="budget-card-info"><span class="goal-amounts">${formatCurrency(g.current)}</span><span>Target: ${formatCurrency(g.target)}</span></div>
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${pct}%"></div></div>
                <div class="text-right mt-2"><button class="btn btn-primary btn-small" onclick="window.openAddFundsModal('${g.id}', '${escapeHtml(g.name)}')">Add Funds</button></div>
            `;
            savingsCardsContainer.appendChild(card);
        });
    }

    function renderProjections() {
        if (!projectionResults) return;
        const weeks = state.projection.weeks || 16;
        const bulk = state.projection.bulk || 4000;
        const safety = state.projection.safety || 300;
        const spendable = bulk - safety;
        const weeklyAllowance = spendable / weeks;

        projectionResults.innerHTML = `
            <div class="allowance-highlight-box">
                <span class="text-muted font-weight-bold">Recommended Weekly Allowance</span>
                <div class="allowance-amount">${formatCurrency(weeklyAllowance)}</div>
            </div>
        `;
    }

    window.deleteTransaction = function(id) {
        showConfirmDialog('Delete Transaction', 'Are you sure you want to delete this transaction?', async () => {
            if (currentUser) {
                await db.collection('users').doc(currentUser.uid).collection('transactions').doc(id).delete();
            } else {
                state.transactions = state.transactions.filter(t => t.id !== id);
                renderAll();
            }
            showToast('Transaction deleted.', 'success');
        });
    };

    window.deleteBudget = function(cat) {
        showConfirmDialog('Remove Budget', `Are you sure you want to remove the budget limit for ${cat}?`, async () => {
            delete state.budgets[cat];
            if (currentUser) {
                await db.collection('users').doc(currentUser.uid).collection('settings').doc('budgets').set({ categories: state.budgets });
            }
            renderAll();
            showToast('Budget removed.', 'success');
        });
    };

    window.deleteGoal = function(id) {
        showConfirmDialog('Delete Savings Goal', 'Are you sure you want to delete this savings goal?', async () => {
            if (currentUser) {
                await db.collection('users').doc(currentUser.uid).collection('savingsGoals').doc(id).delete();
            } else {
                state.savingsGoals = state.savingsGoals.filter(g => g.id !== id);
                renderAll();
            }
            showToast('Goal deleted.', 'success');
        });
    };

    window.openAddFundsModal = function(id, name) {
        document.getElementById('modalGoalId').value = id;
        document.getElementById('modalGoalName').value = name;
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
        setTimeout(() => toastNotification.classList.remove('show'), 3500);
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function renderIntelligenceTab() {
        const analyzer = new FinancialAnalyzer(state);

        const profile = analyzer.calculateBehaviorProfile();
        const titleEl = document.getElementById('profileTitleDisplay');
        const descEl = document.getElementById('profileDescDisplay');
        if (titleEl) titleEl.textContent = profile.profileTitle;
        if (descEl) descEl.textContent = profile.description;

        const streaksList = document.getElementById('financialStreaksList');
        if (streaksList) {
            streaksList.innerHTML = '';
            const streaks = analyzer.calculateFinancialStreaks();
            if (streaks.length === 0) {
                streaksList.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">Complete budgets or savings goals to unlock financial achievements.</p>`;
            } else {
                streaks.forEach(s => {
                    const div = document.createElement('div');
                    div.style.cssText = "display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border-color);";
                    div.innerHTML = `<i class="fa-solid fa-award text-success" style="font-size: 1.2rem;"></i><div><strong>${escapeHtml(s.title)}</strong><br><small class="text-muted">${escapeHtml(s.description)}</small></div>`;
                    streaksList.appendChild(div);
                });
            }
        }

        const speed = analyzer.calculateSpendingSpeedometer();
        const speedBox = document.getElementById('speedometerBox');
        if (speedBox) {
            speedBox.innerHTML = `
                <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 6px;">Month Elapsed: ${speed.monthElapsedPct}% | Spent: ${speed.moneySpentPct}%</div>
                <p style="font-size: 0.9rem;" class="${speed.statusType === 'warning' ? 'text-danger' : speed.statusType === 'success' ? 'text-success' : 'text-muted'}">${escapeHtml(speed.statusMessage)}</p>
            `;
        }

        const leaksBox = document.getElementById('leaksBox');
        if (leaksBox) {
            leaksBox.innerHTML = '';
            const leaksData = analyzer.detectSpendingLeaks();
            if (!leaksData.hasData || leaksData.leaks.length === 0) {
                leaksBox.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">No spending leaks detected.</p>`;
            } else {
                leaksData.leaks.forEach(l => {
                    const div = document.createElement('div');
                    div.style.cssText = "padding: 10px; background: var(--danger-light); border-radius: 8px; border: 1px solid var(--danger); font-size: 0.85rem;";
                    div.innerHTML = `<strong><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(l.title)}</strong><p class="text-muted" style="margin-top: 4px;">${escapeHtml(l.description)}</p>`;
                    leaksBox.appendChild(div);
                });
            }
        }

        const pred = analyzer.predictFutureBalance();
        const predBox = document.getElementById('futurePredictionBox');
        if (predBox) {
            predBox.innerHTML = `
                <div class="allowance-highlight-box">
                    <span class="text-muted font-weight-bold">Projected Month-End Balance</span>
                    <div class="allowance-amount">${analyzer.formatCurrency(pred.projectedEndMonthBalance)}</div>
                    <small class="text-muted">Current: ${analyzer.formatCurrency(pred.currentBalance)} | Est. Daily Burn: ${analyzer.formatCurrency(pred.dailyBurnRate)}</small>
                </div>
                <p class="text-muted" style="font-size: 0.8rem; text-align: center;">*Estimate based on historical spending rate and remaining days in month.</p>
            `;
        }

        const collisionsBox = document.getElementById('goalCollisionsBox');
        if (collisionsBox) {
            collisionsBox.innerHTML = '';
            const collisions = analyzer.detectGoalCollisions();
            if (collisions.length === 0) {
                collisionsBox.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">No goal collisions detected. Your savings goals fit within your projected cashflow.</p>`;
            } else {
                collisions.forEach(c => {
                    const div = document.createElement('div');
                    div.style.cssText = "padding: 10px; background: var(--warning-light); border-radius: 8px; border: 1px solid var(--warning); font-size: 0.85rem;";
                    div.innerHTML = `<strong><i class="fa-solid fa-triangle-exclamation text-warning"></i> Goal Risk: ${escapeHtml(c.goalName)}</strong><p class="text-muted" style="margin-top: 4px;">${escapeHtml(c.warning)}</p>`;
                    collisionsBox.appendChild(div);
                });
            }
        }

        const unusualBox = document.getElementById('unusualPurchasesBox');
        if (unusualBox) {
            unusualBox.innerHTML = '';
            const unusual = analyzer.detectUnusualPurchases();
            if (!unusual.hasData || unusual.unusual.length === 0) {
                unusualBox.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">No unusual or impulse purchases detected.</p>`;
            } else {
                unusual.unusual.forEach(u => {
                    const div = document.createElement('div');
                    div.style.cssText = "padding: 8px; background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.85rem;";
                    div.innerHTML = `<strong>${escapeHtml(u.description)} (${analyzer.formatCurrency(u.amount)})</strong><br><small class="text-muted">${escapeHtml(u.reason)}</small>`;
                    unusualBox.appendChild(div);
                });
            }
        }

        const recurringBox = document.getElementById('recurringExpensesBox');
        if (recurringBox) {
            recurringBox.innerHTML = '';
            const rec = analyzer.discoverRecurringExpenses();
            if (rec.length === 0) {
                recurringBox.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">No recurring expenses detected yet.</p>`;
            } else {
                rec.forEach(r => {
                    const div = document.createElement('div');
                    div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.85rem;";
                    div.innerHTML = `<div><strong>${escapeHtml(r.description)}</strong><br><small class="text-muted">${escapeHtml(r.category)} • ${analyzer.formatCurrency(r.amount)} (${r.occurrences}x)</small></div><button class="btn btn-primary btn-small" onclick="window.confirmRecurring('${escapeHtml(r.description)}', '${escapeHtml(r.category)}', ${r.amount})">Confirm</button>`;
                    recurringBox.appendChild(div);
                });
            }
        }

        const timeBox = document.getElementById('timeMachineBox');
        if (timeBox) {
            timeBox.innerHTML = '';
            const periods = analyzer.getTimeMachinePeriods();
            if (periods.length === 0) {
                timeBox.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">No historical periods available.</p>`;
            } else {
                periods.forEach(p => {
                    const div = document.createElement('div');
                    div.style.cssText = "padding: 8px; background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.85rem;";
                    div.innerHTML = `<strong>Period: ${p.period}</strong><br><span class="text-success">Income: ${analyzer.formatCurrency(p.income)}</span> | <span class="text-danger">Expense: ${analyzer.formatCurrency(p.expense)}</span><br><small class="text-muted">${escapeHtml(p.summaryText)}</small>`;
                    timeBox.appendChild(div);
                });
            }
        }

        const whyBox = document.getElementById('whySpendMoreBox');
        if (whyBox) {
            const why = analyzer.explainSpendingIncrease();
            whyBox.innerHTML = `<p style="font-size: 0.9rem; line-height: 1.5;">${escapeHtml(why.explanation)}</p>`;
        }

        const smartBudgetsBox = document.getElementById('smartBudgetsBox');
        if (smartBudgetsBox) {
            smartBudgetsBox.innerHTML = '';
            const suggestions = analyzer.generateSmartBudgets();
            if (suggestions.length === 0) {
                smartBudgetsBox.innerHTML = `<p class="text-muted">Insufficient expense history to generate smart budget suggestions.</p>`;
            } else {
                suggestions.forEach(s => {
                    const card = document.createElement('div');
                    card.style.cssText = "background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;";
                    card.innerHTML = `
                        <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(s.category)}</div>
                        <div style="font-size: 0.85rem;" class="text-muted">Suggested Limit: <strong class="text-primary">${analyzer.formatCurrency(s.suggestedLimit)}</strong> (Avg spent: ${analyzer.formatCurrency(s.currentAverage)})</div>
                        <div style="display: flex; gap: 8px; margin-top: 4px;">
                            <button class="btn btn-success btn-small flex-1" onclick="window.acceptSmartBudget('${escapeHtml(s.category)}', ${s.suggestedLimit})">Accept</button>
                            <button class="btn btn-secondary-outline btn-small flex-1" onclick="window.editSmartBudget('${escapeHtml(s.category)}', ${s.suggestedLimit})">Edit</button>
                        </div>
                    `;
                    smartBudgetsBox.appendChild(card);
                });
            }
        }

        const autopsyBox = document.getElementById('monthlyAutopsyBox');
        if (autopsyBox) {
            const autopsy = analyzer.generateMonthlyAutopsy();
            autopsyBox.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 12px;">
                    <div style="padding: 10px; background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border-color);">
                        <span class="text-muted" style="font-size: 0.8rem;">Biggest Leak</span>
                        <div style="font-weight: 700; font-size: 1rem;">${escapeHtml(autopsy.biggestLeak)}</div>
                    </div>
                    <div style="padding: 10px; background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border-color);">
                        <span class="text-muted" style="font-size: 0.8rem;">Behavior Profile</span>
                        <div style="font-weight: 700; font-size: 1rem;" class="text-primary">${escapeHtml(autopsy.behaviorProfile)}</div>
                    </div>
                    <div style="padding: 10px; background: var(--bg-input); border-radius: 8px; border: 1px solid var(--border-color);">
                        <span class="text-muted" style="font-size: 0.8rem;">Projected Month-End</span>
                        <div style="font-weight: 700; font-size: 1rem;" class="text-success">${analyzer.formatCurrency(autopsy.projectedMonthEnd)}</div>
                    </div>
                </div>
                <div style="padding: 14px; background: var(--primary-light); border: 1px solid var(--primary); border-radius: 10px;">
                    <strong style="display: block; margin-bottom: 6px;"><i class="fa-solid fa-wand-magic-sparkles text-primary"></i> Monthly Financial Review & Autopsy</strong>
                    <p style="font-size: 0.9rem; line-height: 1.6;" id="aiAutopsyText">${escapeHtml(autopsy.summary)}</p>
                </div>
            `;

            // Fetch Gemini AI review (using key stored in code for testing, prior to backend migration)
            getGeminiFinancialAdvice(autopsy).then(advice => {
                if (advice) {
                    const txtEl = document.getElementById('aiAutopsyText');
                    if (txtEl) txtEl.textContent = advice;
                }
            });
        }
    }

    window.acceptSmartBudget = async function(cat, limit) {
        state.budgets[cat] = limit;
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).collection('settings').doc('budgets').set({
                categories: state.budgets
            }, { merge: true });
        }
        renderAll();
        showToast(`Smart budget accepted for ${cat}!`, 'success');
    };

    window.editSmartBudget = function(cat, limit) {
        switchTab('budgets');
        const budgetCatSelect = document.getElementById('budgetCategory');
        const budgetLimitInput = document.getElementById('budgetLimit');
        if (budgetCatSelect) budgetCatSelect.value = cat;
        if (budgetLimitInput) budgetLimitInput.value = limit;
        showToast(`Loaded ${cat} into Budget tab for editing.`, 'info');
    };

    window.confirmRecurring = function(desc, cat, amount) {
        showToast(`Confirmed recurring expense: ${desc} (${formatCurrency(amount)})`, 'success');
    };

    init();
});
