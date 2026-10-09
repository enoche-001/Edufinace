/* =========================================
   EduFinance - Demo account data
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
    const tx = (type, amount, description, category, date, note) =>
        ({ id: 'demo_tx_' + (++n), type, amount, description, category, date, note: note || '' });

    const transactions = [];
    for (let m = 0; m <= 2; m++) {
        transactions.push(
            tx('income', 1400, 'Student loan payout', 'Student Loan / Grant', on(m, 1)),
            tx('income', 450, 'Campus library shift', 'Part-time Job / Salary', on(m, 12), 'Weekend hours'),
            tx('expense', 620, 'Dorm rent', 'Rent & Utilities', on(m, 2)),
            tx('expense', 35, 'Internet and power', 'Rent & Utilities', on(m, 4)),
            tx('expense', 12, 'Music streaming', 'Subscriptions & Tech', on(m, 5)),
            tx('expense', 72, 'Groceries', 'Groceries & Food', on(m, 8)),
            tx('expense', 64, 'Groceries', 'Groceries & Food', on(m, 17)),
            tx('expense', 18, 'Campus bus pass', 'Transport & Transit', on(m, 9)),
            tx('expense', 14, 'Cinema night', 'Social & Entertainment', on(m, 14)),
            tx('expense', 9, 'Coffee with friends', 'Social & Entertainment', on(m, 19)),
            tx('expense', 8, 'Pharmacy', 'Health & Personal', on(m, 21))
        );
    }
    transactions.push(
        tx('expense', 185, 'Chemistry textbooks', 'Tuition & Books', on(0, 3), 'Semester books'),
        tx('expense', 21, 'Lunch', 'Groceries & Food', daysAgo(1)),
        tx('expense', 120, 'New headphones', 'Subscriptions & Tech', daysAgo(2), 'Unplanned'),
        tx('income', 900, 'Merit scholarship', 'Scholarship / Bursary', on(0, 1))
    );

    // Newest first, like the live app
    transactions.sort((a, b) => b.date.localeCompare(a.date));

    window.EDU_DEMO = {
        currency: 'USD',
        transactions,
        budgets: {
            'Groceries & Food': 300,
            'Rent & Utilities': 700,
            'Social & Entertainment': 60,
            'Transport & Transit': 40
        },
        savingsGoals: [
            { id: 'demo_goal_1', name: 'New laptop', target: 1200, current: 750, date: daysAgo(-75) },
            { id: 'demo_goal_2', name: 'Emergency fund', target: 500, current: 180, date: 'No deadline' }
        ],
        projection: { weeks: 16, bulk: 4200, safety: 300 },
        profile: {
            username: 'Demo Student',
            firstName: 'Alex',
            lastName: 'Demo',
            dob: '2005-01-01',
            accountId: 'EDU-998877',
            currency: 'USD',
            avatar: 'fa-user-graduate',
            monthlyIncomeEstimate: 1850
        },
        debts: [
            { id: 'demo_debt_1', person: 'Tunde', amount: 40, paid: 10, direction: 'owed_to_me', note: 'Lunch and data', phone: '', due: daysAgo(-5), settled: false, createdAt: daysAgo(9) },
            { id: 'demo_debt_2', person: 'Amaka', amount: 25, paid: 0, direction: 'i_owe', note: 'Lab coat', phone: '', due: '', settled: false, createdAt: daysAgo(4) },
            { id: 'demo_debt_3', person: 'Seun', amount: 15, paid: 15, direction: 'owed_to_me', note: 'Printing', phone: '', due: '', settled: true, settledAt: daysAgo(3), createdAt: daysAgo(20) }
        ]
    };
})();
