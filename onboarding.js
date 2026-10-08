/* =========================================
   EduFinance - First-time setup wizard
   Step 1 (balance) and step 2 (income sources) are required.
   Steps 3-6 can be skipped.
   The app (app.js) decides when to start it and saves the result.
   ========================================= */

(function (global) {
    const WEEKS_PER_MONTH = 52 / 12;
    const TOTAL_STEPS = 6;
    const REQUIRED_STEPS = { 1: true, 2: true };
    const DEFAULT_WEEKS = 16;

    // Rough share of monthly money each expense usually takes (used only as an editable suggestion)
    const BUDGET_SHARES = {
        'Tuition & Books': 0.10,
        'Rent & Utilities': 0.30,
        'Groceries & Food': 0.25,
        'Transport & Transit': 0.10,
        'Social & Entertainment': 0.08,
        'Subscriptions & Tech': 0.07,
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

    /**
     * Pure calculation. No DOM.
     * input: {
     *   startingBalance, weeks,
     *   sources: { allowance:{amount,freq}, bulk:{amount}, job:{amount,freq}, gifts:{amount} }  (only chosen ones present)
     * }
     */
    function compute(input) {
        const weeks = Math.max(1, Math.round(num(input.weeks)) || DEFAULT_WEEKS);
        const balance = Math.max(0, num(input.startingBalance));
        const src = input.sources || {};

        let regularMonthly = 0;      // allowance + job + bulk spread over the semester
        let guaranteedSemester = 0;  // money expected over the whole semester, gifts excluded

        ['allowance', 'job'].forEach(key => {
            const s = src[key];
            if (!s) return;
            const amt = Math.max(0, num(s.amount));
            if (s.freq === 'weekly') {
                regularMonthly += amt * WEEKS_PER_MONTH;
                guaranteedSemester += amt * weeks;
            } else {
                regularMonthly += amt;
                guaranteedSemester += amt * (weeks / WEEKS_PER_MONTH);
            }
        });

        if (src.bulk) {
            const amt = Math.max(0, num(src.bulk.amount));
            regularMonthly += amt / (weeks / WEEKS_PER_MONTH);
            guaranteedSemester += amt;
        }

        const irregularMonthly = src.gifts ? Math.max(0, num(src.gifts.amount)) : 0;
        const monthlyIncomeEstimate = round2(regularMonthly + irregularMonthly);

        // What suggestions (budgets, buffer) are based on
        const budgetBase = monthlyIncomeEstimate > 0
            ? monthlyIncomeEstimate
            : (balance > 0 ? balance / (weeks / WEEKS_PER_MONTH) : 0);

        return {
            weeks,
            startingBalance: round2(balance),
            regularMonthly: round2(regularMonthly),
            irregularMonthly: round2(irregularMonthly),
            monthlyIncomeEstimate,
            plannerTotal: Math.round(balance + guaranteedSemester),
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

        // ----- Step 3: weeks -----
        const weeksInput = $('onbWeeks');
        const weekChips = $('onbWeekChips').querySelectorAll('.onb-chip');
        function syncWeekChips() {
            weekChips.forEach(c => {
                const on = String(c.dataset.weeks) === String(weeksInput.value);
                c.classList.toggle('selected', on);
                c.setAttribute('aria-pressed', String(on));
            });
        }
        weekChips.forEach(c => c.addEventListener('click', () => {
            weeksInput.value = c.dataset.weeks;
            syncWeekChips();
            clearError();
        }));
        weeksInput.addEventListener('input', () => { syncWeekChips(); clearError(); });

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
            if (selectedSources.has('allowance')) out.allowance = { amount: num($('onbAllowanceAmt').value), freq: $('onbAllowanceFreq').value };
            if (selectedSources.has('bulk')) out.bulk = { amount: num($('onbBulkAmt').value) };
            if (selectedSources.has('job')) out.job = { amount: num($('onbJobAmt').value), freq: $('onbJobFreq').value };
            if (selectedSources.has('gifts')) out.gifts = { amount: num($('onbGiftsAmt').value) };
            return out;
        }

        function currentCalc() {
            return compute({
                startingBalance: $('onbBalance').value,
                weeks: skipped[3] ? DEFAULT_WEEKS : weeksInput.value,
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
            const weekly = (calc.plannerTotal - safety) / calc.weeks;
            const box = $('onbPreview');
            if (calc.plannerTotal <= 0) {
                box.textContent = 'Add your expected money to see a weekly spending amount.';
            } else if (weekly < 0) {
                box.textContent = 'Your buffer is bigger than the money you expect this semester. Try a smaller buffer.';
            } else {
                box.textContent = 'Recommended weekly spending: ' + EduCurrency.format(weekly, currency) + ' over ' + calc.weeks + ' weeks.';
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
                if (s.allowance && !(s.allowance.amount > 0)) return 'Enter your allowance amount.';
                if (s.bulk && !(s.bulk.amount > 0)) return 'Enter how much you get once a semester.';
                if (s.job && !(s.job.amount > 0)) return 'Enter your job or side gig amount.';
                if (s.gifts && $('onbGiftsAmt').value !== '' && num($('onbGiftsAmt').value) < 0) return 'Gift amount cannot be negative.';
            }
            if (n === 3) {
                const w = parseInt(weeksInput.value, 10);
                if (!(w >= 1 && w <= 52)) return 'Enter a semester length between 1 and 52 weeks.';
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
            if (src.allowance) incomeSources.push({ type: 'allowance', amount: src.allowance.amount, frequency: src.allowance.freq });
            if (src.bulk) incomeSources.push({ type: 'semester', amount: src.bulk.amount, frequency: 'semester' });
            if (src.job) incomeSources.push({ type: 'job', amount: src.job.amount, frequency: src.job.freq });
            if (src.gifts) incomeSources.push({ type: 'gifts', amount: src.gifts.amount, frequency: 'irregular' });

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
                projection: { weeks: calc.weeks, bulk: calc.plannerTotal, safety: Math.round(safetyValue()) },
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
