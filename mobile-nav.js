// Phone bottom bar, the + button and the More / Add sheets.
// Sheets themselves come from sheets.js (EduUI); tab switching comes from app.js.
(function () {
    const mq = window.matchMedia('(max-width: 768px)');
    const $ = (id) => document.getElementById(id);
    const addSheet = $('quickAddSheet');
    const moreSheet = $('moreSheet');
    const sheetBody = $('quickAddSheetBody');
    const quickForm = $('quickAddForm');
    if (!addSheet || !moreSheet || !quickForm || !window.EduUI) return;

    const quickCard = quickForm.closest('.card');
    const homeParent = quickCard.parentNode;
    const homeNext = quickCard.nextSibling;
    const moreTabs = ['budgets', 'savings', 'debts', 'projections', 'profile'];

    function putCardBack() {
        if (quickCard.parentNode === sheetBody) {
            quickCard.classList.remove('in-sheet');
            homeParent.insertBefore(quickCard, homeNext);
        }
    }
    EduUI.onClose((except) => { if (except !== addSheet) putCardBack(); });

    function openAdd() {
        if (EduUI.gate('Sign up to start tracking your own money.')) return;
        sheetBody.appendChild(quickCard);
        quickCard.classList.add('in-sheet');
        EduUI.open(addSheet);
    }

    // Bottom bar highlight follows the active tab
    EduUI.onTab((tab) => {
        document.querySelectorAll('.bn-item[data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === tab));
        $('bnMore').classList.toggle('active', moreTabs.indexOf(tab) !== -1);
    });

    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => EduUI.goTo(b.dataset.go)));
    $('bnMore').addEventListener('click', () => EduUI.open(moreSheet));
    $('fabAdd').addEventListener('click', openAdd);

    // Close the add sheet after a successful submit (gate blocks guests earlier)
    quickForm.addEventListener('submit', () => { setTimeout(() => EduUI.closeAll(), 350); });

    $('moreTheme').addEventListener('click', () => { const t = $('themeToggleBtn'); if (t) t.click(); EduUI.closeAll(); });

    // Keep the bar out of the way of the keyboard (not while typing inside a sheet)
    const typing = (el) => el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    document.addEventListener('focusin', (e) => {
        if (mq.matches && typing(e.target) && !e.target.closest('.sheet') && !e.target.closest('.modal')) document.body.classList.add('kb-open');
    });
    document.addEventListener('focusout', () => document.body.classList.remove('kb-open'));

    mq.addEventListener('change', (e) => { if (!e.matches) EduUI.closeAll(); });
})();
