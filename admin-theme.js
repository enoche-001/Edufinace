/* Admin theme toggle (light / luxury black). Saved per browser. */
(function () {
    var KEY = 'edu_admin_theme', root = document.documentElement;
    function get() { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } }
    function paint(btn) { if (btn) btn.innerHTML = get() === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>'; }
    function apply() { if (get() === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme'); }
    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('themeToggle');
        apply(); paint(btn);
        if (btn) btn.addEventListener('click', function () {
            try { localStorage.setItem(KEY, get() === 'dark' ? 'light' : 'dark'); } catch (e) {}
            apply(); paint(btn);
        });
    });
})();
