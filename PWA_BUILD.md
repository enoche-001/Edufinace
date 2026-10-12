# EduFinance PWA notes

**Entry point:** `start.html` (manifest `start_url`). Animated splash, then signed-in users go to `dashboard.html`, others to `login.html`. The landing page (`index.html`) redirects to the splash when opened inside the installed app, so it never shows there. In a normal browser it still works as your public site.

**Files added:** `manifest.webmanifest`, `sw.js`, `pwa.js`, `pwa.css`, `start.html`, `offline.html`, `favicon.svg`, `icons/*`, `screenshots/*`.

**Hooks you can use**
- `<button data-pwa-install hidden>Install app</button>`: shown only when install is possible (landing nav and dashboard Profile already have one).
- `window.EduPWA.install()`, `.canInstall()`, `.isStandalone`, `.isIOS`.

**Deploy checklist**
1. Serve over HTTPS (Firebase Hosting, Netlify, Vercel, GitHub Pages all work). Keep all files in the same folder as `index.html`.
2. Each time you change files, bump `VERSION` in `sw.js` so installed apps pick up the update (they get an "Update" toast).
3. Add your deployed domain to Firebase Auth > Settings > Authorized domains.

**Package as an Android app (APK/AAB):** open https://www.pwabuilder.com, enter your live URL, choose Android. For Play Store, host `/.well-known/assetlinks.json` with the fingerprint PWABuilder gives you. Screenshots for the richer install dialog are in `screenshots/` (replace them with real app screenshots once you deploy).
