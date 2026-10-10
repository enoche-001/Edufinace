/* EduFinance - first-visit newsletter prompt (landing page only).
   Asks once. "Yes" subscribes; "No" is remembered and never asked again.
   Browsers do not let a website read a visitor's email address, so:
     - signed-in visitors: we use their account email (one tap)
     - everyone else: the email box opens with the browser's autofill suggestion
   Writes to the same newsletter_subscribers collection as the footer form. */
(function () {
    'use strict';
    var FLAG = 'edu_newsletter_prompt';           // 'subscribed' | 'declined'
    try { if (localStorage.getItem(FLAG)) return; } catch (e) { /* private mode: still ask once per page */ }
    if (typeof firebase === 'undefined') return;

    var db = null;
    try { db = firebase.firestore(); } catch (e) { return; }
    var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    var remember = function (v) { try { localStorage.setItem(FLAG, v); } catch (e) {} };

    function css() {
        var s = document.createElement('style');
        s.textContent =
            '.nlp-back{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .2s}' +
            '.nlp-back.on{opacity:1}' +
            '.nlp-card{width:100%;max-width:400px;background:#fff;color:#171d45;border-radius:22px;padding:26px 22px 20px;box-shadow:0 30px 80px rgba(0,0,0,.35);font-family:Inter,system-ui,sans-serif;transform:translateY(12px);transition:transform .25s}' +
            '.nlp-back.on .nlp-card{transform:none}' +
            '.nlp-ico{width:46px;height:46px;border-radius:14px;background:#8b5cf6;color:#fff;display:grid;place-items:center;font-size:20px;margin-bottom:14px}' +
            '.nlp-card h2{font-size:1.25rem;font-weight:800;margin:0 0 6px}' +
            '.nlp-card p{font-size:.92rem;line-height:1.5;color:#646e90;margin:0 0 14px}' +
            '.nlp-card input{width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1px solid #e5e8f1;font:inherit;color:inherit;background:#f5f6fb;margin-bottom:6px;outline:none}' +
            '.nlp-card input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.2)}' +
            '.nlp-msg{min-height:20px;font-size:.82rem;color:#d9453b;margin-bottom:6px}' +
            '.nlp-row{display:flex;gap:10px}' +
            '.nlp-btn{flex:1;padding:13px;border-radius:12px;border:1px solid transparent;font:inherit;font-weight:700;cursor:pointer}' +
            '.nlp-yes{background:#8b5cf6;color:#fff}.nlp-yes:disabled{opacity:.5;cursor:default}' +
            '.nlp-no{background:transparent;border-color:#e5e8f1;color:#646e90}' +
            '@media (prefers-color-scheme:dark){.nlp-card{background:#0d0d10;color:#f4f4f6;border:1px solid #232328}.nlp-card p{color:#8b8b95}.nlp-card input{background:#15151a;border-color:#232328}.nlp-no{border-color:#232328;color:#8b8b95}}';
        document.head.appendChild(s);
    }

    function open(knownEmail) {
        css();
        var back = document.createElement('div');
        back.className = 'nlp-back';
        back.innerHTML =
            '<div class="nlp-card" role="dialog" aria-modal="true" aria-labelledby="nlpTitle">' +
            '<div class="nlp-ico">&#9993;</div>' +
            '<h2 id="nlpTitle">Subscribe to our newsletter?</h2>' +
            '<p id="nlpText"></p>' +
            '<input type="email" id="nlpEmail" name="email" autocomplete="email" inputmode="email" placeholder="you@example.com" aria-label="Email address">' +
            '<div class="nlp-msg" id="nlpMsg" role="alert"></div>' +
            '<div class="nlp-row"><button type="button" class="nlp-btn nlp-no" id="nlpNo">No, thanks</button>' +
            '<button type="button" class="nlp-btn nlp-yes" id="nlpYes">Yes, subscribe</button></div></div>';
        document.body.appendChild(back);
        requestAnimationFrame(function () { back.classList.add('on'); });

        var $ = function (id) { return back.querySelector('#' + id); };
        var input = $('nlpEmail'), msg = $('nlpMsg'), yes = $('nlpYes');
        if (knownEmail) {
            input.value = knownEmail;
            $('nlpText').textContent = 'Get student finance tips and product updates at ' + knownEmail + '. Unsubscribe any time.';
        } else {
            $('nlpText').textContent = 'Student finance tips and product updates, occasionally. Enter your email to join, or tap No.';
        }

        function close(v) { if (v) remember(v); back.classList.remove('on'); setTimeout(function () { back.remove(); }, 250); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') close('declined'); }
        document.addEventListener('keydown', onKey);
        $('nlpNo').onclick = function () { close('declined'); };
        back.addEventListener('click', function (e) { if (e.target === back) close('declined'); });

        async function subscribe() {
            var email = (input.value || '').trim().toLowerCase();
            if (!EMAIL_RE.test(email)) { msg.textContent = 'Please enter a valid email address.'; input.focus(); return; }
            msg.textContent = ''; yes.disabled = true; yes.textContent = 'Subscribing…';
            try {
                await db.collection('newsletter_subscribers').doc(email).set({
                    email: email, active: true,
                    subscribedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                done(email, false);
            } catch (err) {
                if (err && err.code === 'permission-denied') return done(email, true); // already on the list
                console.error(err);
                msg.textContent = 'Could not subscribe right now. Please try again.';
                yes.disabled = false; yes.textContent = 'Yes, subscribe';
            }
        }
        function done(email, already) {
            remember('subscribed');
            back.querySelector('.nlp-card').innerHTML =
                '<div class="nlp-ico">&#10003;</div><h2>' + (already ? "You're already subscribed" : "You're subscribed") + '</h2>' +
                '<p>Thanks! We will write to ' + email.replace(/[<>&]/g, '') + ' now and then.</p>' +
                '<div class="nlp-row"><button type="button" class="nlp-btn nlp-yes" id="nlpClose">Done</button></div>';
            back.querySelector('#nlpClose').onclick = function () { close(); };
            setTimeout(function () { close(); }, 4000);
        }
        yes.onclick = subscribe;
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); subscribe(); } });
        if (!knownEmail) setTimeout(function () { input.focus(); }, 300);
    }

    // Wait briefly to see whether the visitor is signed in, then show the prompt.
    var shown = false;
    function go(email) { if (shown) return; shown = true; setTimeout(function () { open(email || ''); }, 900); }
    try {
        var unsub = firebase.auth().onAuthStateChanged(function (u) { if (unsub) unsub(); go(u && u.email); });
        setTimeout(function () { go(''); }, 2500);   // auth slow or unavailable
    } catch (e) { go(''); }
})();
