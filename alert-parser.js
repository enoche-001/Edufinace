/* =========================================
   EduFinance - bank alert parser (works offline, no network)
   Turns the text of a bank SMS / email / app notification into
   { amount, type, description, date, bank, ref, category }.
   It never stores the raw text. Used by smart-add.js and bank-link.js.
   ========================================= */
(function (root) {
    'use strict';

    var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    var MON_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
    var NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';

    var BANKS = [
        ['Opay', /\bo-?pay\b|\bopay\b/i], ['Kuda', /\bkuda\b/i], ['Moniepoint', /\bmoniepoint\b/i],
        ['PalmPay', /\bpalm-?pay\b/i], ['GTBank', /gt-?bank|\bgtb\b|\bguaranty\b|\bgtworld\b/i],
        ['Access Bank', /\baccess\s*(bank|more)?\b|\bdiamond\b/i], ['UBA', /\buba\b|united bank for africa/i],
        ['Zenith Bank', /\bzenith\b/i], ['First Bank', /\bfirst\s*bank\b|\bfirstbank\b|\bfirstmobile\b/i],
        ['Fidelity', /\bfidelity\b/i], ['Sterling', /\bsterling\b/i], ['Wema / ALAT', /\bwema\b|\balat\b/i],
        ['FCMB', /\bfcmb\b/i], ['Stanbic IBTC', /\bstanbic\b/i], ['Union Bank', /\bunion\s*bank\b/i],
        ['Polaris', /\bpolaris\b/i], ['Ecobank', /\becobank\b/i], ['Providus', /\bprovidus\b/i],
        ['Keystone', /\bkeystone\b/i], ['Carbon', /\bcarbon\b/i]
    ];

    // keyword -> app category (the names must match the categories in app.js)
    var EXPENSE_RULES = [
        [/school\s*fee|tuition|portal|jamb|waec|neco|textbook|\bbooks?\b|bookshop|stationer|photocopy|print(ing)?|hostel\s*fee|\bsug\b|dues/i, 'Tuition & Books'],
        [/\brent\b|landlord|electric|\bnepa\b|ikedc|ekedc|phed|\bphcn\b|disco|prepaid|meter|\btoken\b|water\s*bill|\bgas\b|utility/i, 'Rent & Utilities'],
        [/shoprite|spar\b|market|grocer|supermarket|food|restaurant|kitchen|chicken|kfc|dominos|pizza|cafe|bakery|bread|suya|buka|mama\s*put|eatery|chowdeck|glovo|foodcourt|mr\s*biggs|sweet\s*sense|cold\s*stone/i, 'Groceries & Food'],
        [/\buber\b|\bbolt\b|indrive|indriver|taxi|\bfare\b|transport|\bbus\b|\bpark\b|keke|okada|ride|fuel|petrol|filling\s*station|nnpc|oando|total\s*energies|lagos\s*bus|brt/i, 'Transport & Transit'],
        [/netflix|spotify|showmax|apple|google\s*(play|one)|youtube|prime\s*video|dstv|gotv|startimes|airtime|\bdata\b|\bmtn\b|\bglo\b|airtel|9mobile|etisalat|vtu|bundle|subscription|canva|chatgpt|openai|github|domain|hosting|namecheap/i, 'Subscriptions & Tech'],
        [/pharmacy|chemist|hospital|clinic|medic|drug|health|salon|barber|haircut|hair|spa\b|cosmetic|toiletr/i, 'Health & Personal'],
        [/cinema|movie|club|lounge|bar\b|party|event|ticket|bet9ja|sportybet|betking|game|gaming|concert|outing|hangout|gift/i, 'Social & Entertainment']
    ];
    var INCOME_RULES = [
        [/nelfund|student\s*loan|\bgrant\b|\bloan\b/i, 'Student Loan / Grant'],
        [/scholarship|bursary|award/i, 'Scholarship / Bursary'],
        [/salary|payroll|wages|stipend|\bpay\b/i, 'Part-time Job / Salary'],
        [/allowance|pocket|mum\b|mummy|mom\b|dad\b|daddy|papa|mama|father|mother|parent|uncle|aunty|auntie|brother|sister|upkeep/i, 'Allowance / Parents'],
        [/freelance|client|invoice|gig|commission|project|design|logo|website/i, 'Freelance / Side Gig']
    ];

    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
    function today() { var n = new Date(); return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate()); }

    function validDate(y, m, d) {
        if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
        var t = new Date(y, m - 1, d);
        return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
    }

    function clean(t) {
        return String(t == null ? '' : t)
            .replace(/[\u00a0\u200b]/g, ' ')
            .replace(/[\r\t]+/g, ' ')
            .replace(/\n+/g, ' \n ')
            .replace(/ {2,}/g, ' ')
            .trim();
    }

    // Balances look like amounts but are not the transaction, so blank them out first.
    function withoutBalances(t) {
        return t.replace(/(?:avail(?:able)?\.?\s*|ledger\s*|current\s*|new\s*)?bal(?:ance)?\s*[:\-]?\s*(?:NGN|NG|N|\u20a6)?\s*-?\s*[\d,]+(?:\.\d+)?/ig, ' ')
            .replace(/(?:fee|charge|stamp\s*duty|vat|levy)s?\s*[:\-]?\s*(?:NGN|NG|N|\u20a6)?\s*[\d,]+(?:\.\d+)?/ig, ' ');
    }

    function toNumber(s) {
        var n = parseFloat(String(s).replace(/,/g, ''));
        return isFinite(n) ? n : null;
    }

    function findAmount(t) {
        var m = t.match(new RegExp('(?:amt|amount|value)\\s*[:\\-]?\\s*(?:NGN|NG|N|\\u20a6)?\\s*' + NUM, 'i'))
            || t.match(new RegExp('(?:NGN|NG|\\u20a6|\\bN(?=\\s?\\d))\\s*' + NUM, 'i'))
            || t.match(new RegExp(NUM + '\\s*(?:NGN|naira)\\b', 'i'));
        if (!m) return null;
        var n = toNumber(m[1]);
        return n && n > 0 && n < 1e11 ? n : null;
    }

    function findType(t) {
        var s = t.toLowerCase();
        var debit = /\b(debit(?:ed)?|dr|sent|spent|purchase[d]?|withdraw(?:al|n)?|paid|trf to|transfer(?:red)? to|payment to|charged?)\b/;
        var credit = /\b(credit(?:ed)?|cr|received|deposit(?:ed)?|inflow|trf from|transfer(?:red)? from|payment from|reversal|refund(?:ed)?)\b/;
        var d = s.search(debit), c = s.search(credit);
        if (d === -1 && c === -1) return null;
        if (d === -1) return 'income';
        if (c === -1) return 'expense';
        return c < d ? 'income' : 'expense';
    }

    function findDate(t) {
        var m = t.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-\\/\\.,]*' + MON_RE + '[\\s\\-\\/\\.,]*(\\d{4}|\\d{2})\\b', 'i'));
        if (m) {
            var y = +m[3]; if (y < 100) y += 2000;
            if (validDate(y, MONTHS[m[2].toLowerCase()], +m[1])) return ymd(y, MONTHS[m[2].toLowerCase()], +m[1]);
        }
        m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (m && validDate(+m[1], +m[2], +m[3])) return ymd(+m[1], +m[2], +m[3]);
        m = t.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})\b/);   // day first, as in Nigeria
        if (m) {
            var yy = +m[3]; if (yy < 100) yy += 2000;
            if (validDate(yy, +m[2], +m[1])) return ymd(yy, +m[2], +m[1]);
        }
        m = t.match(new RegExp('\\b' + MON_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b', 'i'));
        if (m && validDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2])) return ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
        return null;
    }

    function findTime(t) {
        var m = t.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i);
        if (!m) return '';
        var h = +m[1];
        if (m[3]) { var pm = m[3].toLowerCase() === 'pm'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
        return h < 24 && +m[2] < 60 ? pad(h) + ':' + m[2] : '';
    }

    function findBank(t) {
        for (var i = 0; i < BANKS.length; i++) if (BANKS[i][1].test(t)) return BANKS[i][0];
        return '';
    }

    function titleCase(s) {
        if (s !== s.toUpperCase()) return s;            // mixed case is already readable
        return s.toLowerCase().replace(/(^|[\s\-'&.])([a-z])/g, function (_, a, b) { return a + b.toUpperCase(); });
    }

    function tidyDescription(raw, type) {
        var s = String(raw || '');
        s = s.replace(/\b\d{6,}\b/g, ' ').replace(/\b(?:nip|fip|ussd|web|pmt|atm|pos|mob|nibss|inter[- ]?bank|ibtc)\b[\/:\-]?/ig, ' ');
        s = s.replace(/[\/|_]+/g, ' ').replace(/\s*[:\-]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
        var tr = s.match(/^(?:trf|transfer(?:red)?)\s*(to|from)\s+(.+)$/i);
        if (tr) s = 'Transfer ' + tr[1].toLowerCase() + ' ' + titleCase(tr[2].trim());
        else s = titleCase(s);
        s = s.replace(/^(?:to|from|at)\s+/i, type === 'income' ? 'From ' : 'To ');
        if (s.length > 60) s = s.slice(0, 57).trim() + '...';
        return s;
    }

    function findDescription(t, type) {
        var stop = '(?=\\s+(?:avail|available|bal|balance|date|time|ref|reference|acct|acc|a\\/c|amt|amount|dt|session|txn|trx|value|dated|on)\\b|\\s*[\\n|]|\\s*$)';
        var m = t.match(new RegExp('(?:desc(?:ription)?|narration|narr|remark|details?)\\s*[:\\-]\\s*(.+?)' + stop, 'i'));
        if (m && m[1].trim().length > 1) return tidyDescription(m[1], type);
        var stopPhrase = '(?=\\s+(?:on|at|via|from|ref|reference|bal|avail|date|dated|using|with|successful|has|is)\\b|[.,;\\n]|\\s*$)';
        m = t.match(new RegExp('(?:sent|transfer(?:red)?|paid|payment|trf)\\s+(?:of\\s+)?(?:(?:NGN|NG|N|\\u20a6)\\s*[\\d,.]+\\s+)?to\\s+(.+?)' + stopPhrase, 'i'))
            || t.match(new RegExp('(?:received|credited|deposit|transfer(?:red)?|trf)\\s+(?:of\\s+)?(?:(?:NGN|NG|N|\\u20a6)\\s*[\\d,.]+\\s+)?from\\s+(.+?)' + stopPhrase, 'i'))
            || t.match(new RegExp('(?:spent|purchase(?:d)?|paid|payment)\\s+(?:of\\s+)?(?:(?:NGN|NG|N|\\u20a6)\\s*[\\d,.]+\\s+)?at\\s+(.+?)' + stopPhrase, 'i'));
        if (!m) {
            var f = t.match(new RegExp('\\bfor\\s+(?!the\\b)(.+?)' + stopPhrase, 'i'));
            if (f && f[1].trim().length > 1) return tidyDescription(f[1], type);
        }
        if (m && m[1].trim().length > 1) {
            var verb = /from/i.test(m[0]) && !/\sto\s/i.test(m[0]) ? 'From ' : (/\sat\s/i.test(m[0]) ? '' : 'To ');
            return verb + titleCase(tidyDescription(m[1], type).replace(/^(?:To|From)\s+/, ''));
        }
        return '';
    }

    function findRef(t, key) {
        var m = t.match(/(?:ref(?:erence)?(?:\s*(?:no|number|id))?|session\s*id|txn\s*id|trx\s*id|trans(?:action)?\s*(?:id|ref|no))\s*[:#\-]?\s*([A-Za-z0-9_\-]{8,40})/i);
        if (m) return m[1];
        var h = 5381;
        for (var i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
        return 'h' + (h >>> 0).toString(36);
    }

    function guessCategory(desc, type) {
        var rules = type === 'income' ? INCOME_RULES : EXPENSE_RULES;
        for (var i = 0; i < rules.length; i++) if (rules[i][0].test(desc || '')) return rules[i][1];
        return type === 'income' ? 'Other Income' : 'Miscellaneous';
    }

    function parse(text) {
        var raw = clean(text);
        var out = { ok: false, amount: null, type: null, description: '', date: today(), time: '', bank: '', ref: '', category: '', confidence: 'none', dateFound: false };
        if (!raw || raw.length > 2500) return out;
        var body = withoutBalances(raw);
        out.amount = findAmount(body);
        if (!out.amount) return out;
        out.type = findType(body);
        var d = findDate(body);
        if (d && d <= today()) { out.date = d; out.dateFound = true; }
        out.time = findTime(body);
        out.bank = findBank(raw);
        var typeForDesc = out.type || 'expense';
        out.description = findDescription(body, typeForDesc) || (typeForDesc === 'income' ? 'Bank credit' : 'Bank debit');
        out.category = guessCategory(out.description + ' ' + raw, typeForDesc);
        out.ref = findRef(raw, [out.amount, out.type, out.date, out.time, out.description].join('|'));
        out.ok = true;
        out.confidence = out.type ? (out.bank || /acct|acc\b|a\/c|account|bal|alert|desc|narration/i.test(raw) ? 'high' : 'medium') : 'low';
        if (!out.type) out.type = 'expense';
        return out;
    }

    // Stricter check used before offering an alert that was found on the clipboard.
    function looksLikeAlert(text) {
        var t = String(text || '');
        if (t.length < 20 || t.length > 1200) return false;
        var r = parse(t);
        return r.ok && r.confidence === 'high' && /alert|acct|acc\b|a\/c|account|bal|debit|credit|desc|narration|transfer|received|sent/i.test(t);
    }

    // A paste may hold several alerts separated by blank lines.
    function parseMany(text) {
        var parts = String(text || '').split(/\n\s*\n+/);
        var list = [];
        for (var i = 0; i < parts.length; i++) {
            var r = parse(parts[i]);
            if (r.ok) list.push(r);
        }
        return list;
    }

    var api = { parse: parse, parseMany: parseMany, looksLikeAlert: looksLikeAlert, guessCategory: guessCategory };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.EduAlertParser = api;
})(typeof window !== 'undefined' ? window : this);
