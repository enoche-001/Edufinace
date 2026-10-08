/* =========================================
   EduFinance - Currency helper (shared by login, dashboard, intelligence)
   - Stores ISO codes ("NGN", "USD") instead of symbols
   - Auto-detects a sensible default from the device (no API calls)
   - Formats with Intl.NumberFormat so symbols/decimals are always right
   ========================================= */

(function (global) {
    const CURRENCIES = [
        'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'RWF', 'ETB', 'XOF', 'XAF', 'EGP', 'MAD',
        'CAD', 'AUD', 'NZD', 'INR', 'PKR', 'BDT', 'LKR', 'NPR', 'PHP', 'IDR', 'MYR', 'SGD', 'THB', 'VND',
        'CNY', 'JPY', 'KRW', 'HKD', 'AED', 'SAR', 'TRY', 'ILS', 'BRL', 'MXN', 'ARS', 'COP', 'CLP', 'PEN',
        'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'UAH', 'RUB'
    ];

    // Old accounts saved a symbol instead of a code. Map them forward.
    const LEGACY_SYMBOLS = {
        '$': 'USD', '€': 'EUR', '£': 'GBP', '₦': 'NGN',
        'CA$': 'CAD', 'A$': 'AUD', '¥': 'JPY'
    };

    // Country (from device language, e.g. en-NG) -> currency
    const REGION_TO_CURRENCY = {
        US: 'USD', GB: 'GBP', NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', UG: 'UGX', TZ: 'TZS', RW: 'RWF',
        ET: 'ETB', EG: 'EGP', MA: 'MAD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', PK: 'PKR', BD: 'BDT',
        LK: 'LKR', NP: 'NPR', PH: 'PHP', ID: 'IDR', MY: 'MYR', SG: 'SGD', TH: 'THB', VN: 'VND', CN: 'CNY',
        JP: 'JPY', KR: 'KRW', HK: 'HKD', AE: 'AED', SA: 'SAR', TR: 'TRY', IL: 'ILS', BR: 'BRL', MX: 'MXN',
        AR: 'ARS', CO: 'COP', CL: 'CLP', PE: 'PEN', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
        CZ: 'CZK', HU: 'HUF', RO: 'RON', UA: 'UAH', RU: 'RUB',
        // Eurozone
        AT: 'EUR', BE: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR', GR: 'EUR', IE: 'EUR',
        IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR',
        ES: 'EUR', HR: 'EUR',
        // West / Central African CFA
        SN: 'XOF', CI: 'XOF', ML: 'XOF', BF: 'XOF', BJ: 'XOF', TG: 'XOF', NE: 'XOF', GW: 'XOF',
        CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF', GQ: 'XAF'
    };

    // Timezone -> country. Timezone beats language because many phones are set to en-US.
    const TZ_TO_REGION = {
        'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA',
        'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kigali': 'RW', 'Africa/Addis_Ababa': 'ET',
        'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN',
        'Africa/Douala': 'CM',
        'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
        'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP', 'Asia/Manila': 'PH', 'Asia/Jakarta': 'ID',
        'Asia/Kuala_Lumpur': 'MY', 'Asia/Singapore': 'SG', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
        'Asia/Saigon': 'VN', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
        'Asia/Hong_Kong': 'HK', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Jerusalem': 'IL',
        'Europe/Istanbul': 'TR', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
        'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL',
        'Europe/Lisbon': 'PT', 'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
        'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL',
        'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Kyiv': 'UA',
        'Europe/Kiev': 'UA', 'Europe/Moscow': 'RU', 'Europe/Athens': 'GR', 'Europe/Helsinki': 'FI',
        'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
        'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
        'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
        'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
        'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'America/Argentina/Buenos_Aires': 'AR',
        'America/Bogota': 'CO', 'America/Santiago': 'CL', 'America/Lima': 'PE',
        'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
        'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US'
    };

    function toCode(value) {
        if (!value) return 'USD';
        const v = String(value).trim();
        if (LEGACY_SYMBOLS[v]) return LEGACY_SYMBOLS[v];
        const up = v.toUpperCase();
        return /^[A-Z]{3}$/.test(up) ? up : 'USD';
    }

    function detect() {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz && TZ_TO_REGION[tz]) return REGION_TO_CURRENCY[TZ_TO_REGION[tz]] || 'USD';
        } catch (e) { /* ignore */ }
        try {
            const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
            for (const l of langs) {
                const region = new Intl.Locale(l).region;
                if (region && REGION_TO_CURRENCY[region]) return REGION_TO_CURRENCY[region];
            }
        } catch (e) { /* ignore */ }
        return 'USD';
    }

    function format(amount, currency, opts) {
        const code = toCode(currency);
        const num = parseFloat(amount) || 0;
        const o = opts || {};
        const options = { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' };
        if (o.trim && Number.isInteger(num)) { // whole numbers without .00
            options.minimumFractionDigits = 0;
            options.maximumFractionDigits = 0;
        }
        try {
            return new Intl.NumberFormat(navigator.language || 'en', options).format(num);
        } catch (e) {
            try {
                return new Intl.NumberFormat('en', options).format(num);
            } catch (e2) {
                return code + ' ' + num.toFixed(2);
            }
        }
    }

    function symbol(currency) {
        const code = toCode(currency);
        try {
            const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
            const p = parts.find(x => x.type === 'currency');
            return p ? p.value : code;
        } catch (e) {
            return code;
        }
    }

    function label(code) {
        let name = code;
        try {
            const dn = new Intl.DisplayNames(['en'], { type: 'currency' });
            name = dn.of(code) || code;
        } catch (e) { /* older browsers: just show the code */ }
        const sym = symbol(code);
        return sym && sym !== code ? `${code} - ${name} (${sym})` : `${code} - ${name}`;
    }

    // Fills a <select> with every supported currency and selects `selected`.
    function populateSelect(selectEl, selected) {
        if (!selectEl) return;
        const chosen = toCode(selected);
        selectEl.innerHTML = '';
        CURRENCIES.forEach(code => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = label(code);
            selectEl.appendChild(opt);
        });
        // Guard: if a saved code isn't in our list, still show it
        if (!CURRENCIES.includes(chosen)) {
            const opt = document.createElement('option');
            opt.value = chosen;
            opt.textContent = label(chosen);
            selectEl.appendChild(opt);
        }
        selectEl.value = chosen;
    }

    global.EduCurrency = { CURRENCIES, toCode, detect, format, symbol, label, populateSelect };
})(window);
