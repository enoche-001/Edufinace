/* =========================================
   SteadyScale - Demo account data
   Used when someone opens the dashboard without logging in.
   Dates are built from today so every chart and insight stays current.
   ========================================= */
(function () {
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    // A date in a month relative to now (0 = this month, 1 = last month, ...). Never in the future.
    function on(monthsAgo, day) {
        const now = new Date();
        const last = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0).getDate();
        // this month: spread the days across the days that have passed so far
        const dd = monthsAgo === 0 ? Math.max(1, Math.round(day * now.getDate() / 28)) : Math.min(day, last);
        const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, dd);
        if (d > now) d.setTime(now.getTime());
        return iso(d);
    }
    function daysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return iso(d);
    }

    let n = 0;
    // Each demo entry gets a plausible time of day so the detail card and same-day ordering work
    const stamp = (date, k) => {
        const [y, m, d] = date.split('-').map(Number);
        const t = new Date(y, m - 1, d, 7 + (k * 5) % 14, (k * 17) % 60);
        return t > new Date() ? new Date().toISOString() : t.toISOString();
    };
    const tx = (type, amount, description, category, date, note) => {
        ++n;
        return { id: 'demo_tx_' + n, type, amount, description, category, date, note: note || '', createdAt: stamp(date, n) };
    };

    const transactions = [];
    for (let m = 0; m <= 2; m++) {
        transactions.push(
            tx('income', 2400, 'Monthly salary', 'Salary', on(m, 1)),
            tx('income', 450, 'Freelance design invoice', 'Freelance / Side Hustle', on(m, 12), 'Logo project'),
            tx('expense', 780, 'Apartment rent', 'Rent & Utilities', on(m, 2)),
            tx('expense', 95, 'Electricity and internet', 'Rent & Utilities', on(m, 4)),
            tx('expense', 12, 'Streaming subscription', 'Subscriptions & Tech', on(m, 5)),
            tx('expense', 112, 'Groceries', 'Groceries', on(m, 8)),
            tx('expense', 96, 'Groceries', 'Groceries', on(m, 17)),
            tx('expense', 55, 'Monthly transit pass', 'Transport', on(m, 9)),
            tx('expense', 24, 'Cleaning supplies', 'Household & Family', on(m, 10)),
            tx('expense', 38, 'Dinner out', 'Dining', on(m, 14)),
            tx('expense', 9, 'Coffee with a client', 'Dining', on(m, 19)),
            tx('expense', 14, 'Pharmacy', 'Health & Personal', on(m, 21))
        );
    }
    transactions.push(
        tx('expense', 185, 'Industry conference ticket', 'Professional Development', on(0, 3), 'Annual conference'),
        tx('expense', 21, 'Lunch', 'Dining', daysAgo(1)),
        tx('expense', 120, 'New headphones', 'Subscriptions & Tech', daysAgo(2), 'Unplanned'),
        tx('income', 900, 'Performance bonus', 'Other Income', on(0, 1))
    );

    // Newest first, like the live app
    transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    window.EDU_DEMO = {
        currency: 'USD',
        transactions,
        budgets: {
            'Groceries': 300,
            'Rent & Utilities': 900,
            'Dining': 100,
            'Transport': 60
        },
        savingsGoals: [
            { id: 'demo_goal_1', name: 'Home office upgrade', target: 1200, current: 750, date: daysAgo(-75) },
            { id: 'demo_goal_2', name: 'Emergency fund', target: 3000, current: 1100, date: 'No deadline' }
        ],
        projection: { cycle: 'monthly', startDay: 1, anchor: '', income: 2850, safety: 300 },
        profile: {
            username: 'Demo User',
            firstName: 'Alex',
            lastName: 'Demo',
            dob: '1990-01-01',
            accountId: 'SS-998877', accountType: 'general',
            currency: 'USD',
            avatar: 'fa-user',
            monthlyIncomeEstimate: 2850
        },
        debts: [
            { id: 'demo_debt_1', person: 'Tunde', amount: 40, paid: 10, direction: 'owed_to_me', note: 'Dinner and fuel', phone: '', due: daysAgo(-5), settled: false, createdAt: daysAgo(9) },
            { id: 'demo_debt_2', person: 'Amaka', amount: 25, paid: 0, direction: 'i_owe', note: 'Utilities split', phone: '', due: '', settled: false, createdAt: daysAgo(4) },
            { id: 'demo_debt_3', person: 'Seun', amount: 15, paid: 15, direction: 'owed_to_me', note: 'Parking', phone: '', due: '', settled: true, settledAt: daysAgo(3), createdAt: daysAgo(20) }
        ]
    };
})();
