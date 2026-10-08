/* =========================================
   EduFinance - Financial Intelligence & AI Layer
   ========================================= */

class FinancialAnalyzer {
    constructor(state) {
        this.state = state;
    }

    getTransactions() {
        return this.state.transactions || [];
    }

    getBudgets() {
        return this.state.budgets || {};
    }

    getSavingsGoals() {
        return this.state.savingsGoals || [];
    }

    getProfile() {
        return this.state.profile || { currency: 'USD' };
    }

    formatCurrency(amount) {
        return EduCurrency.format(amount, this.getProfile().currency, { trim: true });
    }

    // 1. SPENDING LEAK DETECTOR
    detectSpendingLeaks() {
        const txs = this.getTransactions().filter(t => t.type === 'expense');
        if (txs.length === 0) {
            return { hasData: false, message: "No expense transactions available to detect spending leaks." };
        }

        const categoryMap = {};
        let smallPurchasesCount = 0;
        let smallPurchasesTotal = 0;

        txs.forEach(t => {
            if (!categoryMap[t.category]) {
                categoryMap[t.category] = { count: 0, total: 0, items: [] };
            }
            categoryMap[t.category].count += 1;
            categoryMap[t.category].total += t.amount;
            categoryMap[t.category].items.push(t);

            if (t.amount <= 25) {
                smallPurchasesCount++;
                smallPurchasesTotal += t.amount;
            }
        });

        let biggestCat = null;
        let maxTotal = -1;
        for (const [cat, data] of Object.entries(categoryMap)) {
            if (data.total > maxTotal) {
                maxTotal = data.total;
                biggestCat = { name: cat, ...data };
            }
        }

        let leaks = [];
        if (biggestCat) {
            leaks.push({
                type: 'heavy_category',
                title: `Biggest Spending Leak: ${biggestCat.name}`,
                description: `Your biggest spending leak is ${biggestCat.name}. You made ${biggestCat.count} purchase${biggestCat.count > 1 ? 's' : ''} totaling ${this.formatCurrency(biggestCat.total)}.`
            });
        }

        if (smallPurchasesCount >= 3) {
            leaks.push({
                type: 'small_purchases',
                title: 'Frequent Small Purchases',
                description: `You have ${smallPurchasesCount} small purchases totaling ${this.formatCurrency(smallPurchasesTotal)}. These frequent minor spendings can quietly drain your balance.`
            });
        }

        return {
            hasData: true,
            leaks,
            biggestCategory: biggestCat,
            smallPurchases: { count: smallPurchasesCount, total: smallPurchasesTotal }
        };
    }

    // 2. SPENDING SPEEDOMETER
    calculateSpendingSpeedometer() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        
        const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
        const currentDay = now.getDate();
        const monthElapsedPct = Math.round((currentDay / totalDaysInMonth) * 100);

        const txs = this.getTransactions();
        let monthlyIncome = 0;
        let monthlySpent = 0;

        txs.forEach(t => {
            const d = new Date(t.date);
            if (d.getFullYear() === year && d.getMonth() === month) {
                if (t.type === 'income' && !t.isOpeningBalance) monthlyIncome += t.amount;
                if (t.type === 'expense') monthlySpent += t.amount;
            }
        });

        // Expected monthly money from the setup wizard (allowance, job, etc.) counts even before it is logged
        const expectedIncome = parseFloat(this.getProfile().monthlyIncomeEstimate) || 0;
        const incomeBase = Math.max(monthlyIncome, expectedIncome);
        const availableMoney = incomeBase > 0 ? incomeBase : (Object.values(this.getBudgets()).reduce((a,b)=>a+b, 0) || monthlySpent || 1);
        const moneySpentPct = Math.min(Math.round((monthlySpent / availableMoney) * 100), 100);

        let statusMessage = "";
        let statusType = "normal";

        if (moneySpentPct > monthElapsedPct + 15) {
            statusMessage = `You've used ${moneySpentPct}% of your monthly spending money, but only ${monthElapsedPct}% of the month has passed. You are spending faster than normal!`;
            statusType = "warning";
        } else if (moneySpentPct < monthElapsedPct - 15) {
            statusMessage = `You've used ${moneySpentPct}% of your monthly spending money, while ${monthElapsedPct}% of the month has passed. Great job pacing your spending!`;
            statusType = "success";
        } else {
            statusMessage = `You've used ${moneySpentPct}% of your monthly spending money and ${monthElapsedPct}% of the month has passed. Your spending pace is well-balanced.`;
            statusType = "normal";
        }

        return {
            monthElapsedPct,
            moneySpentPct,
            monthlySpent,
            availableMoney,
            statusMessage,
            statusType
        };
    }

    // 3. FUTURE BALANCE PREDICTION
    predictFutureBalance() {
        const txs = this.getTransactions();
        let currentBalance = 0;
        txs.forEach(t => {
            if (t.type === 'income') currentBalance += t.amount;
            else currentBalance -= t.amount;
        });

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        let recentExpensesTotal = 0;
        let expenseDaysCount = new Set();

        txs.forEach(t => {
            if (t.type === 'expense' && new Date(t.date) >= thirtyDaysAgo) {
                recentExpensesTotal += t.amount;
                expenseDaysCount.add(t.date);
            }
        });

        const activeDays = Math.max(expenseDaysCount.size, 1);
        const dailyBurnRate = recentExpensesTotal / activeDays;

        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = Math.max(lastDayOfMonth - now.getDate(), 0);

        const estimatedRemainingSpending = dailyBurnRate * daysRemaining;
        const projectedEndMonthBalance = currentBalance - estimatedRemainingSpending;

        return {
            currentBalance,
            dailyBurnRate,
            daysRemaining,
            estimatedRemainingSpending,
            projectedEndMonthBalance: Math.round(projectedEndMonthBalance * 100) / 100,
            isEstimate: true
        };
    }

    // 4. CAN I AFFORD THIS?
    canIAffordThis(amount) {
        const pred = this.predictFutureBalance();
        const goals = this.getSavingsGoals();
        const safetyBuffer = this.state.projection?.safety ?? 200;
        const adjustedProjectedBalance = pred.projectedEndMonthBalance - amount;
        
        let canAfford = true;
        let advice = "";

        if (adjustedProjectedBalance < 0) {
            canAfford = false;
            advice = `Not recommended. This purchase would cause your projected month-end balance to drop into a deficit (${this.formatCurrency(adjustedProjectedBalance)}).`;
        } else if (adjustedProjectedBalance < safetyBuffer) {
            canAfford = false;
            advice = `Proceed with caution. While positive, your projected month-end balance (${this.formatCurrency(adjustedProjectedBalance)}) would fall below your safety buffer (${this.formatCurrency(safetyBuffer)}).`;
        } else {
            canAfford = true;
            advice = `Yes, you can comfortably afford this purchase. Your projected month-end balance would remain healthy at ${this.formatCurrency(adjustedProjectedBalance)}.`;
        }

        return {
            purchaseAmount: amount,
            currentBalance: pred.currentBalance,
            projectedBalanceWithoutPurchase: pred.projectedEndMonthBalance,
            projectedBalanceWithPurchase: Math.round(adjustedProjectedBalance * 100) / 100,
            canAfford,
            advice
        };
    }

    // 5. WHAT-IF MONEY SIMULATOR
    simulateWhatIf(scenarioType, value) {
        const pred = this.predictFutureBalance();
        let projected = pred.projectedEndMonthBalance;
        let message = "";

        if (scenarioType === 'spend_less_pct') {
            const savings = pred.estimatedRemainingSpending * (value / 100);
            projected += savings;
            message = `If you reduce remaining monthly spending by ${value}%, you will save ${this.formatCurrency(savings)}, raising your month-end balance to ${this.formatCurrency(projected)}.`;
        } else if (scenarioType === 'extra_income') {
            projected += value;
            message = `If you earn an extra ${this.formatCurrency(value)} this month, your month-end balance will rise to ${this.formatCurrency(projected)}.`;
        } else if (scenarioType === 'remove_recurring') {
            projected += value;
            message = `If you remove a recurring expense of ${this.formatCurrency(value)}/month, your month-end balance will improve to ${this.formatCurrency(projected)}.`;
        }

        return {
            baselineProjectedBalance: pred.projectedEndMonthBalance,
            simulatedProjectedBalance: Math.round(projected * 100) / 100,
            message
        };
    }

    // 6. UNUSUAL / IMPULSE PURCHASE DETECTOR
    detectUnusualPurchases() {
        const txs = this.getTransactions().filter(t => t.type === 'expense');
        if (txs.length < 3) return { hasData: false, unusual: [] };

        const catStats = {};
        txs.forEach(t => {
            if (!catStats[t.category]) catStats[t.category] = [];
            catStats[t.category].push(t.amount);
        });

        const unusual = [];
        txs.forEach(t => {
            const amounts = catStats[t.category];
            const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
            if (t.amount > avg * 2.5 && t.amount > 50) {
                unusual.push({
                    ...t,
                    averageForCategory: Math.round(avg * 100) / 100,
                    reason: `Amount (${this.formatCurrency(t.amount)}) is significantly higher than your average for ${t.category} (${this.formatCurrency(avg)}).`
                });
            }
        });

        return { hasData: true, unusual };
    }

    // 7. RECURRING EXPENSE DISCOVERY
    discoverRecurringExpenses() {
        const txs = this.getTransactions().filter(t => t.type === 'expense');
        const descMap = {};

        txs.forEach(t => {
            const key = t.description.toLowerCase().trim();
            if (!descMap[key]) descMap[key] = [];
            descMap[key].push(t);
        });

        const recurring = [];
        for (const [desc, items] of Object.entries(descMap)) {
            if (items.length >= 2) {
                const firstAmt = items[0].amount;
                const isSimilarAmount = items.every(i => Math.abs(i.amount - firstAmt) <= firstAmt * 0.1);
                if (isSimilarAmount) {
                    recurring.push({
                        description: items[0].description,
                        category: items[0].category,
                        amount: firstAmt,
                        occurrences: items.length,
                        estimatedInterval: 'Monthly / Weekly'
                    });
                }
            }
        }

        return recurring;
    }

    // 8. FINANCIAL TIME MACHINE
    getTimeMachinePeriods() {
        const txs = this.getTransactions();
        const periods = {};

        txs.forEach(t => {
            const monthKey = t.date.substring(0, 7);
            if (!periods[monthKey]) {
                periods[monthKey] = { period: monthKey, income: 0, expense: 0, categories: {}, txCount: 0 };
            }
            if (t.type === 'income') periods[monthKey].income += t.amount;
            if (t.type === 'expense') {
                periods[monthKey].expense += t.amount;
                periods[monthKey].categories[t.category] = (periods[monthKey].categories[t.category] || 0) + t.amount;
            }
            periods[monthKey].txCount++;
        });

        const result = Object.values(periods).sort((a, b) => b.period.localeCompare(a.period));
        return result.map(p => {
            const sortedCats = Object.entries(p.categories).sort((a, b) => b[1] - a[1]);
            const topCats = sortedCats.slice(0, 3).map(c => `${c[0]} (${this.formatCurrency(c[1])})`).join(', ');
            const net = p.income - p.expense;
            return {
                ...p,
                net,
                summaryText: `Period ${p.period}: Income ${this.formatCurrency(p.income)}, Expenses ${this.formatCurrency(p.expense)}. Net: ${this.formatCurrency(net)}. Main drivers: ${topCats || 'None'}.`
            };
        });
    }

    // 9. WHY DID I SPEND MORE?
    explainSpendingIncrease() {
        const periods = this.getTimeMachinePeriods();
        if (periods.length < 2) {
            return { hasComparison: false, explanation: "Insufficient historical periods to compare spending changes." };
        }

        const current = periods[0];
        const previous = periods[1];

        const diff = current.expense - previous.expense;
        const percentChange = previous.expense > 0 ? Math.round((diff / previous.expense) * 100) : 0;

        let explanation = "";
        if (diff > 0) {
            explanation = `Your spending increased by ${this.formatCurrency(diff)} (${percentChange}%) in ${current.period} compared to ${previous.period}. This was driven by higher transaction activity and increased expenses across key categories.`;
        } else {
            explanation = `Great job! Your spending decreased by ${this.formatCurrency(Math.abs(diff))} (${Math.abs(percentChange)}%) in ${current.period} compared to ${previous.period}.`;
        }

        return {
            hasComparison: true,
            currentPeriod: current.period,
            previousPeriod: previous.period,
            expenseDiff: diff,
            percentChange,
            explanation
        };
    }

    // 10. GOAL COLLISION DETECTOR
    detectGoalCollisions() {
        const goals = this.getSavingsGoals();
        const pred = this.predictFutureBalance();
        const collisions = [];

        goals.forEach(g => {
            const remaining = Math.max(g.target - g.current, 0);
            if (remaining > pred.projectedEndMonthBalance && pred.projectedEndMonthBalance > 0) {
                collisions.push({
                    goalName: g.name,
                    remainingNeeded: remaining,
                    projectedBalance: pred.projectedEndMonthBalance,
                    warning: `Goal "${g.name}" requires ${this.formatCurrency(remaining)}, which exceeds your projected month-end balance (${this.formatCurrency(pred.projectedEndMonthBalance)}). Consider extending the deadline.`
                });
            }
        });

        return collisions;
    }

    // 11. SMART BUDGET SUGGESTIONS
    generateSmartBudgets() {
        const txs = this.getTransactions().filter(t => t.type === 'expense');
        const catMap = {};

        txs.forEach(t => {
            if (!catMap[t.category]) catMap[t.category] = [];
            catMap[t.category].push(t.amount);
        });

        const suggestions = [];
        for (const [cat, amounts] of Object.entries(catMap)) {
            const total = amounts.reduce((a, b) => a + b, 0);
            const avg = total / amounts.length;
            const suggestedLimit = Math.round(avg * (amounts.length > 3 ? 1.05 : 1.2) * 10) / 10;
            suggestions.push({
                category: cat,
                suggestedLimit: Math.max(suggestedLimit, 50),
                currentAverage: Math.round(avg * 100) / 100
            });
        }

        return suggestions;
    }

    // 12. SPENDING BEHAVIOR PROFILE
    calculateBehaviorProfile() {
        const txs = this.getTransactions().filter(t => t.type === 'expense');
        if (txs.length === 0) {
            return { profileTitle: "New Financer", description: "Start logging transactions to generate your personalized spending behavior profile." };
        }

        let weekendCount = 0;
        let smallCount = 0;
        let largeCount = 0;

        txs.forEach(t => {
            const day = new Date(t.date).getDay();
            if (day === 0 || day === 6) weekendCount++;
            if (t.amount < 30) smallCount++;
            if (t.amount > 200) largeCount++;
        });

        const total = txs.length;
        let profileTitle = "Balanced Spender";
        let description = "You maintain a steady and balanced spending rhythm across categories and days.";

        if (weekendCount / total > 0.5) {
            profileTitle = "Weekend Spender";
            description = `Over ${Math.round((weekendCount/total)*100)}% of your purchases happen on weekends, indicating social activity or weekend outings.`;
        } else if (smallCount / total > 0.6) {
            profileTitle = "Frequent Small-Purchase Spender";
            description = `Over ${Math.round((smallCount/total)*100)}% of your transactions are small routine purchases.`;
        } else if (largeCount > 0 && largeCount / total > 0.2) {
            profileTitle = "Large-Purchase Spender";
            description = "You tend to make high-value purchases spaced out over time.";
        } else if (this.getSavingsGoals().length > 0) {
            profileTitle = "Goal-Focused Saver";
            description = "You actively maintain savings goals alongside your day-to-day spending.";
        }

        return { profileTitle, description };
    }

    // 14. SMART FINANCIAL STREAKS
    calculateFinancialStreaks() {
        const budgets = this.getBudgets();
        const txs = this.getTransactions().filter(t => t.type === 'expense');
        
        const spendingMap = {};
        txs.forEach(t => { spendingMap[t.category] = (spendingMap[t.category] || 0) + t.amount; });

        let budgetAdherenceCount = 0;
        let totalBudgets = Object.keys(budgets).length;

        for (const [cat, limit] of Object.entries(budgets)) {
            const spent = spendingMap[cat] || 0;
            if (spent <= limit) budgetAdherenceCount++;
        }

        const savingsGoals = this.getSavingsGoals();
        const goalsOnTrack = savingsGoals.filter(g => g.current > 0).length;

        const achievements = [];
        if (totalBudgets > 0 && budgetAdherenceCount === totalBudgets) {
            achievements.push({ title: "Budget Master", description: "Staying under all configured category budget limits." });
        }
        if (goalsOnTrack > 0) {
            achievements.push({ title: "Active Saver", description: `Making consistent contributions toward ${goalsOnTrack} active savings goal${goalsOnTrack > 1 ? 's' : ''}.` });
        }
        if (txs.length > 0) {
            achievements.push({ title: "Diligent Tracker", description: "Consistently logging transaction activity." });
        }

        return achievements;
    }

    // 15. MONTHLY MONEY AUTOPSY
    generateMonthlyAutopsy() {
        const speedometer = this.calculateSpendingSpeedometer();
        const leaks = this.detectSpendingLeaks();
        const unusual = this.detectUnusualPurchases();
        const profile = this.calculateBehaviorProfile();
        const pred = this.predictFutureBalance();

        return {
            income: speedometer.availableMoney,
            spending: speedometer.monthlySpent,
            netSavings: speedometer.availableMoney - speedometer.monthlySpent,
            biggestLeak: leaks.biggestCategory ? leaks.biggestCategory.name : 'None',
            unusualCount: unusual.unusual.length,
            behaviorProfile: profile.profileTitle,
            projectedMonthEnd: pred.projectedEndMonthBalance,
            summary: `Monthly Review: Total spent ${this.formatCurrency(speedometer.monthlySpent)} out of ${this.formatCurrency(speedometer.availableMoney)}. Projected month-end balance: ${this.formatCurrency(pred.projectedEndMonthBalance)}.`
        };
    }
}
