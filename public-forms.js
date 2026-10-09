/* =========================================
   EduFinance - Public forms -> Firestore
   Contact Us  -> support_tickets
   Newsletter  -> newsletter_subscribers
   (Read by admin.html. Rules are in FIREBASE_RULES.md.)
   ========================================= */
(function () {
    'use strict';

    const firebaseConfig = {
        apiKey: "AIzaSyCoYCIqZH-HOrT6TDOHCxEx2gwDkwdWUB4",
        authDomain: "edufinance-5b7f4.firebaseapp.com",
        projectId: "edufinance-5b7f4",
        storageBucket: "edufinance-5b7f4.firebasestorage.app",
        messagingSenderId: "810409268124",
        appId: "1:810409268124:web:dd782b00adf4d0c7b82e59"
    };

    let db = null;
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
    } catch (e) {
        console.error('Firebase init error:', e);
    }

    function setBusy(form, busy, label) {
        const btn = form.querySelector('button[type="submit"]');
        if (!btn) return;
        if (busy) { btn.dataset.html = btn.innerHTML; btn.innerHTML = label; btn.disabled = true; }
        else { btn.innerHTML = btn.dataset.html || btn.innerHTML; btn.disabled = false; }
    }

    // ---------- Contact form ----------
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!db) { alert('Could not connect right now. Please try again later.'); return; }
            const get = (id) => (document.getElementById(id) || {}).value || '';
            setBusy(contactForm, true, 'Sending…');
            try {
                await db.collection('support_tickets').add({
                    name: get('contactName').trim().slice(0, 80),
                    email: get('contactEmail').trim().slice(0, 120),
                    subject: (get('contactSubject').trim() || 'General enquiry').slice(0, 120),
                    message: get('contactMsg').trim().slice(0, 2000),
                    status: 'open',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert('Message sent successfully! We will get back to you soon.');
                contactForm.reset();
            } catch (err) {
                console.error(err);
                alert('Sorry, your message could not be sent. Please try again.');
            } finally {
                setBusy(contactForm, false);
            }
        });
    }

    // ---------- Newsletter form ----------
    document.querySelectorAll('.newsletter-form').forEach((form) => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!db) { alert('Could not connect right now. Please try again later.'); return; }
            const input = form.querySelector('input[type="email"]');
            const email = (input.value || '').trim().toLowerCase();
            if (!email) return;
            setBusy(form, true, '…');
            try {
                // Doc id = email, so the same address can't be added twice.
                await db.collection('newsletter_subscribers').doc(email).set({
                    email,
                    active: true,
                    subscribedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert('Subscribed successfully!');
                form.reset();
            } catch (err) {
                if (err && err.code === 'permission-denied') {
                    // Re-subscribing an existing address is blocked by the rules; treat as success.
                    alert("You're already subscribed. Thanks!");
                    form.reset();
                } else {
                    console.error(err);
                    alert('Sorry, we could not subscribe you. Please try again.');
                }
            } finally {
                setBusy(form, false);
            }
        });
    });
})();
