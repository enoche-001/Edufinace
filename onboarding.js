/* =========================================
   SteadyScale - First-time setup wizard
   Step 1 (balance) and step 2 (income sources) are required.
   Steps 3-6 can be skipped.
   The app (app.js) decides when to start it and saves the result.
   ========================================= */

(function (global) {
    const WEEKS_PER_MONTH = 52 / 12;
    const TOTAL_STEPS = 6;
    const REQUIRED_STEPS = { 1: true, 2: true };

    // Rough share of monthly money each expense usually takes (used only as an editable suggestion)
    const BUDGET_SHARES = {
        'Professional Development': 0.04,
        'Rent & Utilities': 0.30,
        'Groceries': 0.15,
        'Dining': 0.08,
        'Transport': 0.10,
        'Household & Family': 0.07,
        'Social & Entertainment': 0.06,
        'Subscriptions & Tech': 0.05,
        'Health & Personal': 0.05,
        'Miscellaneous': 0.05
    };

    function num(v) {
        const n = parseFloat(v);
        return isFinite(n) ? n : 0;
    }

    function round2(n) {
        return Math.round(n * 100) / 100;
    }

    // 7,433.33 -> 7,400 ; 52 -> 52 ; keeps suggestions looking human
    function niceRound(n) {
        if (!(n > 0)) return 0;
        const mag = Math.pow(10, Math.max(Math.floor(Math.log10(n)) - 1, 0));
        return Math.round(n / mag) * mag;
    }

    // Monthly equivalent of an amount paid weekly, every two weeks or monthly
    function toMonthly(amt, freq) {
        if (freq === 'weekly') return amt * WEEKS_PER_MONTH;
        if (freq === 'biweekly') return amt * 26 / 12;
        return amt;
    }

    /**
     * Pure calculation. No DOM.
     * input: {
     *   startingBalance, cycle: 'monthly' | 'biweekly',
     *   sources: { salary:{amount,freq}, freelance:{amount,freq}, household:{amount}, other:{amount} }  (only chosen ones present)
     * }
     */
    function compute(input) {
        const cycle = input.cycle === 'biweekly' ? 'biweekly' : 'monthly';
        const balance = Math.max(0, num(input.startingBalance));
        const src = input.sources || {};

        let regularMonthly = 0;      // salary + freelance + household, as a typical month

        ['salary', 'freelance'].forEach(key => {
            const s = src[key];
            if (!s) return;
            regularMonthly += toMonthly(Math.max(0, num(s.amount)), s.freq);
        });
        if (src.household) regularMonthly += Math.max(0, num(src.household.amount));

        // Bonuses and irregular money are never counted as guaranteed
        const irregularMonthly = src.other ? Math.max(0, num(src.other.amount)) : 0;
        const monthlyIncomeEstimate = round2(regularMonthly + irregularMonthly);

        const cycleIncome = cycle === 'biweekly' ? regularMonthly * 12 / 26 : regularMonthly;
        const cycleDays = cycle === 'biweekly' ? 14 : 365 / 12;

        // What suggestions (budgets, buffer) are based on
        const budgetBase = monthlyIncomeEstimate > 0 ? monthlyIncomeEstimate : balance;

        return {
            cycle,
            cycleDays,
            startingBalance: round2(balance),
            regularMonthly: round2(regularMonthly),
            irregularMonthly: round2(irregularMonthly),
            monthlyIncomeEstimate,
            cycleIncome: round2(cycleIncome),
            budgetBase: round2(budgetBase),
            suggestedBuffer: niceRound(budgetBase * 0.10)
        };
    }

    function suggestBudget(category, budgetBase) {
        const share = BUDGET_SHARES[category] || 0.05;
        return niceRound(budgetBase * share);
    }

    /* ---------------- UI ---------------- */

    function start(ctx) {
        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;

        const $ = id => document.getElementById(id);
        const currency = EduCurrency.toCode(ctx.currency);
        const sym = EduCurrency.symbol(currency);

        let step = 1;
        const skipped = {};
        const touched = { safety: false };
        const selectedSources = new Set();
        const selectedCats = new Set();

        overlay.querySelectorAll('[data-cur]').forEach(el => { el.textContent = sym; });
        $('onbWelcomeName').textContent = ctx.name ? ', ' + ctx.name : '';

        // ----- Step 2: source chips -----
        $('onbSourceChips').querySelectorAll('.onb-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const key = chip.dataset.source;
                const on = !selectedSources.has(key);
                if (on) selectedSources.add(key); else selectedSources.delete(key);
                chip.classList.toggle('selected', on);
                chip.setAttribute('aria-pressed', String(on));
                $('onbPanel_' + key).hidden = !on;
                clearError();
            });
        });

        // ----- Step 3: pay cycle -----
        let cycle = 'monthly';
        const cycleChips = $('onbCycleChips').querySelectorAll('.onb-chip');
        const startDayInput = $('onbStartDay');
        const anchorInput = $('onbAnchor');
        function syncCycle() {
            cycleChips.forEach(c => {
                const on = c.dataset.cycle === cycle;
                c.classList.toggle('selected', on);
                c.setAttribute('aria-pressed', String(on));
            });
            $('onbCycleMonthly').hidden = cycle !== 'monthly';
            $('onbCycleBiweekly').hidden = cycle !== 'biweekly';
        }
        cycleChips.forEach(c => c.addEventListener('click', () => {
            cycle = c.dataset.cycle;
            syncCycle();
            clearError();
        }));
        startDayInput.addEventListener('input', clearError);
        anchorInput.addEventListener('input', clearError);

        // ----- Step 4: budget chips + rows (built from the app's own categories) -----
        const chipBox = $('onbBudgetChips');
        const rowBox = $('onbBudgetRows');
        chipBox.innerHTML = '';
        rowBox.innerHTML = '';
        (ctx.expenseCategories || []).forEach((cat, i) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'onb-chip';
            chip.setAttribute('aria-pressed', 'false');
            chip.textContent = cat;
            chipBox.appendChild(chip);

            const row = document.createElement('div');
            row.className = 'onb-panel';
            row.hidden = true;
            const label = document.createElement('label');
            label.className = 'onb-label';
            label.htmlFor = 'onbBudget_' + i;
            label.textContent = cat + ' (monthly limit)';
            const wrap = document.createElement('div');
            wrap.className = 'onb-money';
            const s = document.createElement('span');
            s.className = 'onb-money-sym';
            s.textContent = sym;
            const input = document.createElement('input');
            input.type = 'number';
            input.id = 'onbBudget_' + i;
            input.className = 'form-control';
            input.inputMode = 'decimal';
            input.min = '0';
            input.step = 'any';
            input.placeholder = 'Monthly limit';
            input.dataset.category = cat;
            input.addEventListener('input', () => { input.dataset.touched = '1'; clearError(); });
            wrap.appendChild(s);
            wrap.appendChild(input);
            row.appendChild(label);
            row.appendChild(wrap);
            rowBox.appendChild(row);

            chip.addEventListener('click', () => {
                const on = !selectedCats.has(cat);
                if (on) selectedCats.add(cat); else selectedCats.delete(cat);
                chip.classList.toggle('selected', on);
                chip.setAttribute('aria-pressed', String(on));
                row.hidden = !on;
                if (on && !input.value) {
                    const sug = suggestBudget(cat, currentCalc().budgetBase);
                    if (sug > 0) input.value = sug;
                }
                clearError();
            });
        });

        // ----- Step 6: safety -----
        $('onbSafety').addEventListener('input', () => { touched.safety = true; updatePreview(); clearError(); });

        // ----- Helpers -----
        function clearError() { $('onbError').textContent = ''; }
        function showError(msg) { $('onbError').textContent = msg; }

        function collectSources() {
            const out = {};
            if (selectedSources.has('salary')) out.salary = { amount: num($('onbSalaryAmt').value), freq: $('onbSalaryFreq').value };
            if (selectedSources.has('freelance')) out.freelance = { amount: num($('onbFreelanceAmt').value), freq: $('onbFreelanceFreq').value };
            if (selectedSources.has('household')) out.household = { amount: num($('onbHouseholdAmt').value) };
            if (selectedSources.has('other')) out.other = { amount: num($('onbOtherAmt').value) };
            return out;
        }

        function currentCalc() {
            return compute({
                startingBalance: $('onbBalance').value,
                cycle: skipped[3] ? 'monthly' : cycle,
                sources: collectSources()
            });
        }

        function safetyValue() {
            if (skipped[6]) return currentCalc().suggestedBuffer;
            const raw = $('onbSafety').value;
            return raw === '' ? currentCalc().suggestedBuffer : Math.max(0, num(raw));
        }

        function updatePreview() {
            const calc = currentCalc();
            const safety = safetyValue();
            const weekly = (calc.cycleIncome - safety) / (calc.cycleDays / 7);
            const box = $('onbPreview');
            if (calc.cycleIncome <= 0) {
                box.textContent = 'Add your expected income to see a weekly spending amount.';
            } else if (weekly < 0) {
                box.textContent = 'Your buffer is bigger than the income you expect each cycle. Try a smaller buffer.';
            } else {
                box.textContent = 'Recommended weekly spending: ' + EduCurrency.format(weekly, currency) + ' per week.';
            }
        }

        // ----- Validation (returns '' when OK) -----
        function validate(n) {
            if (n === 1) {
                const raw = $('onbBalance').value;
                if (raw === '' || !(num(raw) >= 0)) return 'Enter how much money you have now. Use 0 if you have none.';
            }
            if (n === 2) {
                if (selectedSources.size === 0) return 'Pick at least one way money reaches you.';
                const s = collectSources();
                if (s.salary && !(s.salary.amount > 0)) return 'Enter your salary or wages amount.';
                if (s.freelance && !(s.freelance.amount > 0)) return 'Enter your typical freelance or side hustle amount.';
                if (s.household && !(s.household.amount > 0)) return 'Enter the household contribution amount.';
                if (s.other && $('onbOtherAmt').value !== '' && num($('onbOtherAmt').value) < 0) return 'Irregular income cannot be negative.';
            }
            if (n === 3) {
                if (cycle === 'monthly') {
                    const d = parseInt(startDayInput.value, 10);
                    if (!(d >= 1 && d <= 28)) return 'Enter a start day between 1 and 28.';
                } else if (!anchorInput.value) {
                    return 'Pick the date of your last payday.';
                }
            }
            if (n === 4) {
                let msg = '';
                rowBox.querySelectorAll('input').forEach(inp => {
                    if (msg || !selectedCats.has(inp.dataset.category)) return;
                    if (!(num(inp.value) > 0)) msg = 'Enter a limit for ' + inp.dataset.category + ', or tap it again to remove it.';
                });
                if (msg) return msg;
            }
            if (n === 5) {
                const name = $('onbGoalName').value.trim();
                const target = $('onbGoalTarget').value;
                if (name || target !== '') {
                    if (!name) return 'Give your savings goal a name.';
                    if (!(num(target) > 0)) return 'Enter a target amount for your goal.';
                    if (num($('onbGoalSaved').value) < 0) return 'Amount already saved cannot be negative.';
                }
            }
            if (n === 6) {
                if ($('onbSafety').value !== '' && num($('onbSafety').value) < 0) return 'Safety buffer cannot be negative.';
            }
            return '';
        }

        // ----- Build result for app.js to save -----
        function buildResult() {
            const calc = currentCalc();
            const src = collectSources();

            const incomeSources = [];
            if (src.salary) incomeSources.push({ type: 'salary', amount: src.salary.amount, frequency: src.salary.freq });
            if (src.freelance) incomeSources.push({ type: 'freelance', amount: src.freelance.amount, frequency: src.freelance.freq });
            if (src.household) incomeSources.push({ type: 'household', amount: src.household.amount, frequency: 'monthly' });
            if (src.other) incomeSources.push({ type: 'irregular', amount: src.other.amount, frequency: 'irregular' });

            const budgets = {};
            if (!skipped[4]) {
                rowBox.querySelectorAll('input').forEach(inp => {
                    if (selectedCats.has(inp.dataset.category) && num(inp.value) > 0) {
                        budgets[inp.dataset.category] = round2(num(inp.value));
                    }
                });
            }

            let goal = null;
            const gName = $('onbGoalName').value.trim();
            if (!skipped[5] && gName && num($('onbGoalTarget').value) > 0) {
                goal = {
                    name: gName,
                    target: round2(num($('onbGoalTarget').value)),
                    current: round2(num($('onbGoalSaved').value)),
                    date: $('onbGoalDate').value || 'No deadline'
                };
            }

            return {
                startingBalance: calc.startingBalance,
                incomeSources,
                monthlyIncomeEstimate: calc.monthlyIncomeEstimate,
                projection: {
                    cycle: calc.cycle,
                    startDay: (skipped[3] || calc.cycle !== 'monthly') ? 1 : parseInt(startDayInput.value, 10),
                    anchor: (!skipped[3] && calc.cycle === 'biweekly') ? anchorInput.value : '',
                    income: Math.round(calc.cycleIncome),
                    safety: Math.round(safetyValue())
                },
                budgets,
                goal
            };
        }

        // ----- Navigation -----
        function render() {
            overlay.querySelectorAll('.onb-step').forEach(el => {
                el.classList.toggle('active', Number(el.dataset.step) === step);
            });
            $('onbStepLabel').textContent = 'Step ' + step + ' of ' + TOTAL_STEPS;
            $('onbProgressBar').style.width = Math.round((step / TOTAL_STEPS) * 100) + '%';
            $('onbBack').style.visibility = step === 1 ? 'hidden' : 'visible';
            $('onbSkip').hidden = !!REQUIRED_STEPS[step];
            $('onbNext').textContent = step === TOTAL_STEPS ? 'Finish setup' : 'Continue';
            clearError();

            if (step === 4) {
                // refresh suggestions the user has not edited
                const base = currentCalc().budgetBase;
                rowBox.querySelectorAll('input').forEach(inp => {
                    if (!inp.dataset.touched && selectedCats.has(inp.dataset.category)) {
                        const sug = suggestBudget(inp.dataset.category, base);
                        inp.value = sug > 0 ? sug : '';
                    }
                });
            }
            if (step === 6) {
                const box = $('onbSafety');
                if (!touched.safety) {
                    const sug = currentCalc().suggestedBuffer;
                    box.value = sug > 0 ? sug : '';
                }
                updatePreview();
            }
            overlay.querySelector('.onb-body').scrollTop = 0;
        }

        async function finish() {
            const btn = $('onbNext');
            const skipBtn = $('onbSkip');
            btn.disabled = true;
            skipBtn.disabled = true;
            btn.textContent = 'Saving...';
            try {
                await ctx.finish(buildResult());
                overlay.hidden = true;
                document.removeEventListener('keydown', onKey);
            } catch (err) {
                console.error(err);
                showError('Could not save your setup. Check your connection and try again.');
                btn.disabled = false;
                skipBtn.disabled = false;
                btn.textContent = 'Finish setup';
            }
        }

        function next(isSkip) {
            if (isSkip) {
                skipped[step] = true;
            } else {
                const err = validate(step);
                if (err) { showError(err); return; }
                skipped[step] = false;
            }
            if (step === TOTAL_STEPS) { finish(); return; }
            step += 1;
            render();
        }

        function onKey(e) {
            if (overlay.hidden) return;
            if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
                e.preventDefault();
                if (!$('onbNext').disabled) next(false);
            }
        }

        $('onbNext').onclick = () => next(false);
        $('onbSkip').onclick = () => next(true);
        $('onbBack').onclick = () => { if (step > 1) { step -= 1; render(); } };
        document.addEventListener('keydown', onKey);

        overlay.hidden = false;
        render();
    }

    global.EduOnboarding = { start, compute, niceRound, suggestBudget };
})(window);
