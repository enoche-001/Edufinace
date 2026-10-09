/* =========================================
   EduFinance - shared UI helpers for the dashboard
   - bottom sheets / dialogs
   - demo (signed-out) gate: blocks saving and asks the visitor to sign up
   - tab-change events
   ========================================= */
(function () {
    const $ = (id) => document.getElementById(id);
    const backdrop = $('sheetBackdrop');
    const closeHooks = [];
    const tabHooks = [];

    function open(sheet) {
        if (!sheet) return;
        closeAll(sheet);
        backdrop.classList.add('show');
        sheet.classList.add('show');
        document.body.classList.add('sheet-open');
    }

    function closeAll(except) {
        document.querySelectorAll('.sheet.show').forEach((s) => { if (s !== except) s.classList.remove('show'); });
        if (!except) {
            backdrop.classList.remove('show');
            document.body.classList.remove('sheet-open');
        }
        closeHooks.forEach((fn) => fn(except || null));
    }

    function isSignedIn() { return document.body.classList.contains('is-user'); }

    // Returns true when the action was blocked (visitor is not signed in)
    function gate(message) {
        if (isSignedIn()) return false;
        const msg = $('authSheetMsg');
        if (msg) msg.textContent = message || 'Sign up to save your own money data.';
        open($('authSheet'));
        return true;
    }

    backdrop.addEventListener('click', () => closeAll());
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-sheet]')) closeAll();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

    window.EduUI = {
        open: open,
        closeAll: closeAll,
        gate: gate,
        isSignedIn: isSignedIn,
        onClose: (fn) => closeHooks.push(fn),
        onTab: (fn) => tabHooks.push(fn),
        tabChanged: (tab) => tabHooks.forEach((fn) => fn(tab)),
        goTo: function () {}          // replaced by app.js
    };
    window.eduGuestGate = gate;
})();
