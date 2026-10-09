/* =========================================
   EduFinance - Insights AI
   Lives only in the Insights section:
   - AI card at the top of Insights (on/off, level, quick questions)
   - Insight sentences rewritten by Gemini at the user's level
   - Chat sheet about transactions, budgets, goals and app activity
   All numbers are calculated in the app (FinancialAnalyzer) and handed
   to Gemini as facts. Gemini explains and reasons; it does not do the maths.
   ========================================= */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const LEVEL_PREF_KEY = 'edu_ai_level';
    const LEVEL_ORDER = ['auto', 'beginner', 'intermediate', 'advanced'];
    const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
    const MAX_THREAD = 40;
    const MAX_INPUT = 500;

    let host = null;
    let thread = [];
    let sending = false;
    let lastSendAt = 0;
    let lastUserText = '';

    // ---------- helpers ----------
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function hash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return String(h);
    }
    function uid() { return host && host.uid ? host.uid() : null; }
    function signedIn() { return !!(window.EduUI && EduUI.isSignedIn()); }
    function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
    function safeDel(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
    function onKey() { return 'edu_ai_on_' + (uid() || 'x'); }
    function chatKey() { return 'edu_ai_chat_' + (uid() || 'x'); }

    function enabled() { return signedIn() && safeGet(onKey()) === '1'; }
    function analyzer() { return new FinancialAnalyzer(host.getState()); }

    function levelPref() {
        const v = safeGet(LEVEL_PREF_KEY);
        return LEVEL_ORDER.indexOf(v) > -1 ? v : 'auto';
    }
    function currentLevel() {
        const pref = levelPref();
        return pref === 'auto' ? analyzer().detectLevel().level : pref;
    }
    function cleanText(v, max) {
        if (typeof v !== 'string') return '';
        const t = v.replace(/\s+/g, ' ').trim();
        return t.length > (max || 700) ? t.slice(0, max || 700).trim() : t;
    }

    // ---------- hero card ----------
    function localHeadline() {
        try {
            const a = analyzer();
            const sp = a.calculateSpendingSpeedometer();
            return sp.statusMessage;
        } catch (e) { return 'See where your money is going.'; }
    }

    function quickQuestions(level) {
        if (level === 'beginner') return ['Where is my money going?', 'Am I spending too fast?', 'How can I save a bit more?'];
        if (level === 'intermediate') return ['What changed since last month?', 'Which budget is at risk?', 'Which costs repeat every month?'];
        return ['Break down this month by category', 'What if I cut spending by 15%?', 'Which transactions look off?'];
    }

    function renderHero() {
        const hero = $('aiHero');
        if (!hero) return;
        const on = enabled();
        const guest = !signedIn();
        const lvl = currentLevel();
        const pref = levelPref();

        const head = $('aiHeadline');
        const sub = $('aiSub');
        const openBtn = $('aiOpenChat');
        const levelBtn = $('aiLevelBtn');
        const chips = $('aiHeroChips');
        const offBtn = $('aiTurnOff');

        hero.classList.toggle('is-on', on);
        hero.classList.toggle('loading', on && headlineBusy);

        if (levelBtn) {
            levelBtn.hidden = !on;
            levelBtn.textContent = LEVEL_LABEL[lvl] + (pref === 'auto' ? ' \u00b7 Auto' : '');
            levelBtn.setAttribute('aria-label', 'Explanation level: ' + LEVEL_LABEL[lvl] + (pref === 'auto' ? ', chosen automatically' : '') + '. Tap to change.');
        }

        if (on) {
            head.textContent = currentHeadline() || localHeadline();
            sub.textContent = 'Written for your level. Numbers come from your own records.';
            openBtn.innerHTML = '<i class="fa-solid fa-comment-dots"></i> Ask about your money';
            if (offBtn) offBtn.hidden = false;
            chips.hidden = false;
            chips.innerHTML = quickQuestions(lvl).map(q => '<button type="button" class="ai-chip" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('');
        } else {
            head.textContent = guest ? localHeadline() : 'Ask questions about your money and get answers in plain words.';
            sub.textContent = guest
                ? 'Sign up to chat with AI about your own spending, budgets and goals.'
                : 'Turning this on sends a summary of your figures and recent transactions to Google Gemini.';
            openBtn.innerHTML = guest
                ? '<i class="fa-solid fa-comment-dots"></i> Chat with AI'
                : '<i class="fa-solid fa-wand-magic-sparkles"></i> Turn on AI insights';
            if (offBtn) offBtn.hidden = true;
            chips.hidden = true;
            chips.innerHTML = '';
        }
    }

    function setEnabled(v) {
        if (v) safeSet(onKey(), '1'); else safeDel(onKey());
        if (!v) { sentences = {}; safeDel(sentKey()); } else { loadSentences(); }
        if (host && host.rerender) host.rerender();
        if (v) scheduleHeadline(0);
    }

    // ---------- AI sentences ----------
    // The backend answers one short request at a time, so every card asks for its own
    // sentence when it is opened. Answers are cached until the figures or level change.
    const PANEL_ASK = {
        headline: 'in one sentence (max 22 words) the single most useful thing to know right now',
        pace: 'whether their spending pace is healthy and why',
        forecast: 'what their expected month-end balance means for them',
        style: 'what their spending style says and one habit to keep or change',
        unusual: 'what to make of the unusual purchases listed',
        collide: 'whether their savings goals fit their cash flow',
        why: 'why their spending changed compared with last month',
        review: 'a short monthly review with one concrete next step'
    };
    let sentences = {};
    const pending = {};
    let headlineBusy = false;
    let headlineTimer = null;

    function sentKey() { return 'edu_ai_sent_' + (uid() || 'x'); }
    function loadSentences() {
        try { sentences = JSON.parse(safeGet(sentKey()) || '{}') || {}; } catch (e) { sentences = {}; }
    }
    function saveSentences() { safeSet(sentKey(), JSON.stringify(sentences)); }

    function isInsightsActive() {
        const t = $('intelligence-tab');
        return !!(t && t.classList.contains('active'));
    }

    // Only the facts this card needs, so requests stay small
    function panelFacts(panel, c) {
        const cur = c.currency;
        switch (panel) {
            case 'headline': return { currency: cur, balanceNow: c.balanceNow, pace: c.pace, forecast: c.forecast, biggestCategory: c.biggestSpendingCategory };
            case 'pace': return { currency: cur, pace: c.pace, spentThisMonth: c.thisMonth.expense, biggestCategory: c.biggestSpendingCategory, smallPurchases: c.smallPurchases };
            case 'forecast': return { currency: cur, balanceNow: c.balanceNow, forecast: c.forecast };
            case 'style': return { currency: cur, style: c.spendingStyle, smallPurchases: c.smallPurchases, activity: c.appActivity };
            case 'unusual': return c.unusualPurchases.length ? { currency: cur, unusual: c.unusualPurchases.slice(0, 3) } : null;
            case 'collide': return c.goals.length ? { currency: cur, goals: c.goals.slice(0, 4), atRisk: c.goalRisks.slice(0, 3), projectedMonthEnd: c.forecast.projectedMonthEndBalance } : null;
            case 'why': return c.changeVsLastMonth ? { currency: cur, change: c.changeVsLastMonth, history: c.monthlyHistory.slice(0, 2) } : null;
            case 'review': return { currency: cur, income: c.thisMonth.income, expense: c.thisMonth.expense, pace: c.pace, forecast: c.forecast, biggestCategory: c.biggestSpendingCategory, style: c.spendingStyle, change: c.changeVsLastMonth };
            default: return null;
        }
    }
    function keyFor(panel, facts, level) { return hash(JSON.stringify(facts) + '|' + level + '|' + panel); }

    function currentHeadline() {
        const have = sentences.headline;
        if (!have) return '';
        const facts = panelFacts('headline', analyzer().buildAIContext({ maxTransactions: 0 }));
        return facts && have.key === keyFor('headline', facts, currentLevel()) ? have.text : '';
    }

    function setCallout(el, text) { if (el && text) el.textContent = text; }

    function addNote(box, text) {
        if (!box || !text) return;
        box.querySelectorAll('.ai-note').forEach(n => n.remove());
        box.insertAdjacentHTML('beforeend', '<div class="callout brand ai-note" style="margin-top:12px"><i class="fa-solid fa-wand-magic-sparkles"></i> ' + esc(text) + '</div>');
    }

    function applySentence(panel, text) {
        if (!text) return;
        if (panel === 'headline') { const h = $('aiHeadline'); if (h) h.textContent = text; }
        else if (panel === 'pace') setCallout(document.querySelector('#speedometerBox .callout'), text);
        else if (panel === 'forecast') addNote($('futurePredictionBox'), text);
        else if (panel === 'style') setCallout($('profileDescDisplay'), text);
        else if (panel === 'unusual') { const bx = $('unusualPurchasesBox'); if (bx && bx.querySelector('.list-item')) addNote(bx, text); }
        else if (panel === 'collide') {
            const bx = $('goalCollisionsBox');
            if (bx) {
                const cls = ((bx.querySelector('.callout') || {}).className || 'callout').replace(' ai-note', '');
                bx.innerHTML = '<div class="' + esc(cls) + ' ai-note"><i class="fa-solid fa-wand-magic-sparkles"></i> ' + esc(text) + '</div>';
            }
        }
        else if (panel === 'why') setCallout(document.querySelector('#whySpendMoreBox .callout'), text);
        else if (panel === 'review') setCallout($('aiAutopsyText'), text);
    }

    async function ensureSentence(panel) {
        if (!enabled() || !PANEL_ASK[panel]) return;
        const ctx = analyzer().buildAIContext({ maxTransactions: 0 });
        const facts = panelFacts(panel, ctx);
        if (!facts) return;
        const level = currentLevel();
        const key = keyFor(panel, facts, level);
        const have = sentences[panel];
        if (have && have.key === key) { applySentence(panel, have.text); return; }
        if (pending[panel] === key) return;
        pending[panel] = key;
        if (panel === 'headline') { headlineBusy = true; renderHero(); }
        const text = cleanText(await window.EduAI.sentence(panel, PANEL_ASK[panel], facts, level), 600);
        delete pending[panel];
        if (panel === 'headline') headlineBusy = false;
        if (text && enabled()) {
            sentences[panel] = { key, text };
            saveSentences();
            applySentence(panel, text);
        }
        if (panel === 'headline') renderHero();
    }

    // Re-apply answers we already have after the panels are rebuilt (no network)
    function applyCached() {
        if (!enabled()) return;
        const ctx = analyzer().buildAIContext({ maxTransactions: 0 });
        const level = currentLevel();
        Object.keys(PANEL_ASK).forEach(panel => {
            const have = sentences[panel];
            const facts = panelFacts(panel, ctx);
            if (have && facts && have.key === keyFor(panel, facts, level)) applySentence(panel, have.text);
        });
    }

    function scheduleHeadline(delay) {
        clearTimeout(headlineTimer);
        if (!enabled() || !isInsightsActive()) return;
        headlineTimer = setTimeout(() => ensureSentence('headline'), delay == null ? 900 : delay);
    }

    // Afford / What-if: local result shows first, AI wording replaces it when ready
    function refine(kind, facts, cb) {
        if (!enabled() || typeof cb !== 'function') return;
        const ctx = analyzer().buildAIContext({ maxTransactions: 0 });
        const slim = { currency: ctx.currency, balanceNow: ctx.balanceNow, forecast: ctx.forecast, thisMonth: ctx.thisMonth, goals: ctx.goals };
        window.EduAI.phrase(kind, facts, currentLevel(), slim).then(text => {
            const t = cleanText(text, 600);
            if (t) cb(t);
        });
    }

    // ---------- chat ----------
    function loadThread() {
        try { thread = JSON.parse(safeGet(chatKey()) || '[]').filter(m => m && (m.role === 'user' || m.role === 'ai') && typeof m.text === 'string'); }
        catch (e) { thread = []; }
    }
    function saveThread() {
        thread = thread.slice(-MAX_THREAD);
        safeSet(chatKey(), JSON.stringify(thread));
    }

    function formatText(raw) {
        const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        let text = String(raw);
        if (text.indexOf('\n') === -1 && (text.match(/(^|[.!?:])\s+[-\u2022]\s+(?=\S)/g) || []).length >= 2) {
            text = text.replace(/\s+[-\u2022]\s+(?=\S)/g, '\n- ');
        }
        const lines = esc(text).split('\n');
        let out = '', inList = false;
        lines.forEach(line => {
            const m = /^\s*(?:[-*\u2022]|\d+[.)])\s+(.*)$/.exec(line);
            if (m) {
                if (!inList) { out += '<ul>'; inList = true; }
                out += '<li>' + inline(m[1]) + '</li>';
            } else {
                if (inList) { out += '</ul>'; inList = false; }
                if (line.trim()) out += '<p>' + inline(line) + '</p>';
            }
        });
        if (inList) out += '</ul>';
        return out || '<p></p>';
    }

    function welcomeText() {
        const st = host.getState();
        const name = (st.profile && (st.profile.firstName || '')) || '';
        const lvl = currentLevel();
        const hi = name ? 'Hi ' + name + '!' : 'Hi!';
        if (lvl === 'beginner') return hi + ' I can look at your spending, budgets, savings goals and what you have logged in the app. Ask me anything, like "where did my money go this week?"';
        if (lvl === 'intermediate') return hi + ' I can compare months, check budgets against spending, look at goals and recurring costs, and see how you have been using the app. What do you want to dig into?';
        return hi + ' I have your transactions, month-by-month history, budgets, goals and app activity. Ask for breakdowns, comparisons or scenarios.';
    }

    function renderThread(typing) {
        const box = $('aiThread');
        if (!box) return;
        const ai = (html, extra) => '<div class="ai-msg ai' + (extra || '') + '"><span class="ai-av"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div class="ai-bubble">' + html + '</div></div>';
        let html = ai('<p>' + esc(welcomeText()) + '</p>');
        thread.forEach(m => {
            if (m.role === 'user') html += '<div class="ai-msg me"><div class="ai-bubble"><p>' + esc(m.text).replace(/\n/g, '<br>') + '</p></div></div>';
            else html += ai(formatText(m.text), m.error ? ' err' : '');
        });
        if (typing) html += '<div class="ai-msg ai"><span class="ai-av"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div class="ai-bubble"><span class="ai-dots" aria-label="AI is typing"><i></i><i></i><i></i></span></div></div>';
        box.innerHTML = html;
        if (!typing && thread.length && thread[thread.length - 1].role === 'ai') { const last = box.querySelector('.ai-msg.ai:last-child'); if (last) last.classList.add('ai-in'); }
        box.scrollTop = box.scrollHeight;
    }

    function renderChatChips() {
        const el = $('aiChips');
        if (!el) return;
        el.innerHTML = quickQuestions(currentLevel()).map(q => '<button type="button" class="ai-chip" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('');
        el.hidden = thread.length > 0;
    }

    function errorMessage(e) {
        const code = e && e.code;
        if (code === 'busy') return 'I am getting a lot of questions right now. Give it a moment and try again.';
        if (code === 'timeout') return 'That took too long. Please try again.';
        if (code === 'network') return 'I could not connect. Check your internet and try again.';
        if (code === 'toolarge') return 'That needs too much data at once. Try a shorter question.';
        return 'I could not answer that just now. Please try again.';
    }

    function setBusy(b) {
        sending = b;
        const btn = $('aiSend');
        if (btn) btn.disabled = b;
    }

    async function send(text) {
        text = String(text || '').trim().slice(0, MAX_INPUT);
        if (!text || sending) return;
        if (!signedIn()) { EduUI.gate('Sign up to chat with AI about your own money.'); return; }
        if (!enabled()) return;
        const now = Date.now();
        if (now - lastSendAt < 1200) return;
        lastSendAt = now;

        lastUserText = text;
        thread.push({ role: 'user', text });
        saveThread();
        renderChatChips();
        renderThread(true);
        setBusy(true);

        const history = thread.slice(0, -1).filter(m => !m.error).slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text.slice(0, 1200) }));
        try {
            const ctx = analyzer().buildAIContext({ maxTransactions: 60 });
            const reply = await window.EduAI.chat(text, history, ctx, currentLevel());
            thread.push({ role: 'ai', text: cleanText(reply, 4000) || 'I could not put an answer together. Try asking another way.' });
            saveThread();
        } catch (e) {
            if (e && e.code === 'auth') { EduUI.gate('Sign in again to chat with AI.'); }
            thread.push({ role: 'ai', text: errorMessage(e), error: true });
        }
        setBusy(false);
        renderThread(false);
        // keep failed replies out of saved history
        thread = thread.filter(m => !m.error);
        saveThread();
        if (document.querySelector('#aiThread .ai-msg.err')) addRetry();
    }

    function addRetry() {
        const last = document.querySelector('#aiThread .ai-msg.err:last-child .ai-bubble');
        if (!last) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'link-btn ai-retry'; b.textContent = 'Try again';
        b.addEventListener('click', () => {
            thread = thread.filter(m => !m.error);
            if (thread.length && thread[thread.length - 1].role === 'user' && thread[thread.length - 1].text === lastUserText) thread.pop();
            saveThread();
            lastSendAt = 0;
            send(lastUserText);
        });
        last.appendChild(b);
    }

    function openChat(prefill) {
        if (!signedIn()) { EduUI.gate('Sign up to chat with AI about your own money.'); return; }
        if (!enabled()) { setEnabled(true); }
        loadThread();
        renderThread(false);
        renderChatChips();
        EduUI.open($('aiChatSheet'));
        const input = $('aiInput');
        if (prefill) { send(prefill); return; }
        if (input && window.matchMedia && !matchMedia('(pointer: coarse)').matches) setTimeout(() => input.focus(), 260);
    }

    function growInput() {
        const input = $('aiInput');
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    }

    // keep the chat above the on-screen keyboard on phones
    function fitSheet() {
        const sh = $('aiChatSheet');
        if (!sh || !sh.classList.contains('show') || !window.visualViewport || window.innerWidth > 768) return;
        const vv = window.visualViewport;
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        if (kb > 80) { sh.style.bottom = kb + 'px'; sh.style.height = Math.max(240, vv.height - 12) + 'px'; }
        else { sh.style.bottom = ''; sh.style.height = ''; }
        const box = $('aiThread');
        if (box) box.scrollTop = box.scrollHeight;
    }

    function bindOnce() {
        if (bindOnce.done) return;
        bindOnce.done = true;

        $('aiOpenChat').addEventListener('click', () => {
            if (!signedIn()) { EduUI.gate('Sign up to chat with AI about your own money.'); return; }
            if (!enabled()) { setEnabled(true); return; }
            openChat();
        });
        $('aiTurnOff').addEventListener('click', () => {
            setEnabled(false);
            if (host && host.toast) host.toast('AI insights are off', 'info');
        });
        $('aiLevelBtn').addEventListener('click', () => {
            const next = LEVEL_ORDER[(LEVEL_ORDER.indexOf(levelPref()) + 1) % LEVEL_ORDER.length];
            safeSet(LEVEL_PREF_KEY, next);
            renderHero();
            if (host && host.toast) host.toast('Level: ' + (next === 'auto' ? 'Auto (' + LEVEL_LABEL[currentLevel()] + ')' : LEVEL_LABEL[next]), 'info');
            scheduleHeadline(150);
        });
        document.addEventListener('click', (e) => {
            const chip = e.target.closest && e.target.closest('.ai-chip');
            if (!chip || !chip.dataset.q) return;
            if (chip.closest('#aiHero')) openChat(chip.dataset.q);
            else send(chip.dataset.q);
        });

        $('aiComposer').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = $('aiInput');
            const v = input.value;
            input.value = ''; growInput();
            send(v);
        });
        const input = $('aiInput');
        input.addEventListener('input', growInput);
        input.addEventListener('keydown', (e) => {
            const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
            if (e.key === 'Enter' && !e.shiftKey && !touch) { e.preventDefault(); $('aiComposer').requestSubmit(); }
        });
        $('aiClear').addEventListener('click', () => {
            thread = []; saveThread(); renderThread(false); renderChatChips();
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', fitSheet);
            window.visualViewport.addEventListener('scroll', fitSheet);
        }
        EduUI.onClose(() => { const sh = $('aiChatSheet'); if (sh) { sh.style.bottom = ''; sh.style.height = ''; } });
        EduUI.onTab((tab) => { if (tab === 'intelligence') { renderHero(); scheduleHeadline(300); } });
    }

    // ---------- public ----------
    window.EduInsightsAI = {
        init(h) { host = h; bindOnce(); },
        enabled,
        level: currentLevel,
        refine,
        // called by app.js at the end of renderIntelligenceTab()
        onRender() {
            if (!host) return;
            if (!sentences || !Object.keys(sentences).length) loadSentences();
            renderHero();
            if (enabled()) { applyCached(); scheduleHeadline(isInsightsActive() ? 900 : 0); }
        },
        // called by app.js when a tile opens its panel
        onPanel(panel) { ensureSentence(panel); }
    };
})();
