// Mobile bottom navigation, floating + button and sheets.
// Works on top of app.js: it clicks the existing sidebar items to switch tabs.
(function () {
    const mq = window.matchMedia('(max-width: 768px)');
    const $ = (id) => document.getElementById(id);
    const backdrop = $('sheetBackdrop');
    const addSheet = $('quickAddSheet');
    const moreSheet = $('moreSheet');
    const sheetBody = $('quickAddSheetBody');
    const quickForm = $('quickAddForm');
    if (!backdrop || !addSheet || !moreSheet || !quickForm) return;

    const quickCard = quickForm.closest('.card');
    const homeParent = quickCard.parentNode;
    const homeNext = quickCard.nextSibling;
    const moreTabs = ['savings', 'debts', 'projections', 'profile'];

    function goTo(tab) {
        const item = document.querySelector('.sidebar-menu .menu-item[data-tab="' + tab + '"]');
        if (item) item.click();
        closeSheets();
        window.scrollTo(0, 0);
    }

    function syncActive() {
        const active = document.querySelector('.sidebar-menu .menu-item.active');
        const tab = active ? active.getAttribute('data-tab') : 'dashboard';
        document.querySelectorAll('.bn-item[data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === tab));
        $('bnMore').classList.toggle('active', moreTabs.indexOf(tab) !== -1);
    }
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(mi => {
        new MutationObserver(syncActive).observe(mi, { attributes: true, attributeFilter: ['class'] });
    });

    function openSheet(sheet) {
        closeSheets();
        if (sheet === addSheet) sheetBody.appendChild(quickCard);
        backdrop.classList.add('show');
        sheet.classList.add('show');
        document.body.classList.add('sheet-open');
    }

    function closeSheets() {
        backdrop.classList.remove('show');
        addSheet.classList.remove('show');
        moreSheet.classList.remove('show');
        document.body.classList.remove('sheet-open');
        if (quickCard.parentNode === sheetBody) {
            homeParent.insertBefore(quickCard, homeNext);
        }
    }

    // Tabs + More items
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.go)));
    $('bnMore').addEventListener('click', () => openSheet(moreSheet));
    $('fabAdd').addEventListener('click', () => openSheet(addSheet));
    backdrop.addEventListener('click', closeSheets);
    document.querySelectorAll('[data-close-sheet]').forEach(b => b.addEventListener('click', closeSheets));

    // Close the add sheet once a transaction is submitted
    quickForm.addEventListener('submit', () => { setTimeout(closeSheets, 350); });

    // More sheet actions reuse the existing buttons
    $('moreTheme').addEventListener('click', () => { const t = $('themeToggleBtn'); if (t) t.click(); closeSheets(); });
    $('moreLogout').addEventListener('click', () => { const l = $('logoutBtn'); if (l) l.click(); closeSheets(); });
    $('moreDemo').addEventListener('click', () => { const d = $('loadDemoData'); if (d) d.click(); closeSheets(); });
    $('bnMore').addEventListener('click', () => {
        const d = $('loadDemoData');
        $('moreDemo').style.display = (d && getComputedStyle(d).display === 'none') ? 'none' : '';
    });

    // Hide the bar while the keyboard is up (not while typing inside a sheet)
    const typing = (el) => el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    document.addEventListener('focusin', (e) => {
        if (mq.matches && typing(e.target) && !e.target.closest('.bottom-sheet')) document.body.classList.add('kb-open');
    });
    document.addEventListener('focusout', () => document.body.classList.remove('kb-open'));

    // Resizing to desktop: put everything back
    mq.addEventListener('change', (e) => { if (!e.matches) closeSheets(); });
    syncActive();
})();
