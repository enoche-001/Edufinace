# EduFinance: Easy logging setup guide

Two features were added. Both fill the same review step, so the user always checks and can edit before anything is saved.

| Way a transaction arrives | Needs CAC? | Needs a server? | Status |
|---|---|---|---|
| Paste a bank alert (button, paste box, clipboard banner) | No | No | Real, works offline |
| Share an SMS/email to the installed app (Android) | No | No | Real, works offline |
| Link bank through Mono | Test mode: no. Live mode: Mono will almost certainly ask for a registered business | Yes (small, included in `/server`) | Built for Mono test mode, not yet verified by you |

---

## Part A: Put the update live (do these in order)

1. **Publish the new Firestore rules first.** Open `FIREBASE_RULES.md`, copy the rules block into Firebase Console > Firestore Database > Rules > Publish. Without this, the bank inbox will fail with "Could not save".
2. Upload every file in the zip to your host, keeping the same folder layout. New files: `alert-parser.js`, `smart-add.js`, `bank-link.js`, `bank-config.js`, `smart-add.css`, and the `server/` folder (only needed for real linking; do not upload `server/` to your static host).
3. Changed files: `dashboard.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `FIREBASE_RULES.md`.
4. `sw.js` VERSION is already bumped to `edufinance-v1.2.0`, so installed apps show the Update toast. Open the app once online to let it cache the new files.
5. **Android share target:** Chrome registers it when the PWA is installed. If the app is already installed, uninstall and reinstall it once so the new manifest is read.

## Part B: Test the paste feature (5 minutes)

Sign in, then copy any of these lines (long-press, Copy) and open the Add transaction form:

```
GTBankAlert Acct:XXX1234 Amt:NGN5,000.00 DR Desc:POS/WEB PMT NETFLIX.COM Avail Bal:NGN12,345.67 Date:14-OCT-2026 Time:14:03

Credit Alert! Acct:**4821 Amt:NGN20,000.00 CR Desc:NIP/MUM ALLOWANCE/0000112233445566 Avail Bal:NGN32,000.00 Date:15-OCT-2026

Opay: You received N15,000.00 from CHINEDU OKAFOR. Ref: 2610161234abcd
```

- Tap **Paste bank alert**. Chrome asks once to allow clipboard access. If you decline, a paste box appears instead.
- The form fills: type, amount, description, category, date and a note ("Via GTBank"). Edit anything, tap **Add**.
- After you allow clipboard access once, copying an alert and opening the app shows a one-tap **Use** banner.
- Pasting several alerts separated by a blank line sends them all to the **bank inbox** for review.
- The app remembers the category you pick for a merchant (for example "Bolt") and uses it next time.
- Duplicate protection: if the same alert was already added, you get a warning.

Share target: in your SMS app, select the alert text, tap Share, pick EduFinance. The dashboard opens with the form filled. The text is stored on the phone only, never in a URL or on a server.

**Banks tested:** GTBank, Access, UBA, Zenith, First Bank, Opay, Kuda style messages. Banks change wording often. If one fails, send me the text (hide your account number) and I will extend `alert-parser.js`.

## Part C: Bank linking with Mono (test mode), step by step

Your existing Vercel project is `edufinanceapi.vercel.app` (the one that serves Gemini). Use it. Do not make a new one.

**Step 1: Mono account**
1. Sign up at mono.co and create an app.
2. Switch the dashboard to Test mode.
3. Copy the public key (`test_pk_...`) and secret key (`test_sk_...`).

**Step 2: Firebase key for the server**
1. Firebase Console > Project settings > Service accounts > Generate new private key.
2. Open the downloaded file and copy everything inside. Keep it private.

**Step 3: Add the 3 files to your Gemini repo**
1. Open the GitHub repo that has `api/gemini.js`.
2. Copy `_lib.js`, `mono.js`, `mono-webhook.js` from `server/api/` in the zip into that repo's `api/` folder.
3. Open the repo's `package.json` and add `"firebase-admin": "^12.0.0"` under `dependencies`.
4. Commit and push.

**Step 4: Vercel settings**
1. Vercel > project `edufinanceapi` > Settings > Environment Variables.
2. Add these (leave your Gemini key alone):
   - `MONO_SECRET_KEY` = your `test_sk_` key
   - `MONO_WEBHOOK_SECRET` = a long random string you make up
   - `MONO_AMOUNT_IN_KOBO` = `true`
   - `FIREBASE_SERVICE_ACCOUNT` = the Firebase JSON from Step 2, on one line
   - `ALLOWED_ORIGINS` = the exact address where EduFinance runs, e.g. `https://edufinance.app`
3. Redeploy the project.

**Step 5: Mono webhook**
1. Mono dashboard > Webhooks.
2. URL: `https://edufinanceapi.vercel.app/api/mono-webhook`
3. Secret: the same string as `MONO_WEBHOOK_SECRET`.

**Step 6: Put your public key in the app**
1. Open `bank-config.js` (the server address is already filled in).
2. Paste your `test_pk_` key into `monoPublicKey`.
3. Upload the app files to your host. Bump `VERSION` in `sw.js` if the app does not update.

**Step 7: Publish the Firestore rules** from `FIREBASE_RULES.md` (Firebase Console > Firestore > Rules > Publish).

**Step 8: Test**
1. Open the app, sign in, Profile > Bank link > Connect with Mono.
2. Choose a test bank and use the sandbox login from Mono's docs.
3. Tap Sync now. Transactions appear under "New transactions from your bank" on Home.
4. If amounts are 100x wrong, set `MONO_AMOUNT_IN_KOBO` to `false` and redeploy.

Going live later needs Mono to approve your business (likely the CAC part). Stay on test keys until then. Mono's endpoint and field names can change, so keep https://docs.mono.co open while testing.

## Part D: Real alternatives that do not need CAC

- **Paste and Share (already built)**: the honest, working answer today. Most users already get an SMS or email alert for every transaction.
- **Email forwarding (not built)**: give each user a private address; they auto-forward bank alert emails to it; a small server parses them with the same parser. Possible with an inbound email service. Tell me if you want it.

## Part E: Privacy and trust (do before real users)

- Update `privacy.html` and `terms.html`: say that pasted alert text is read on the device and only the amount, date, description and bank name are saved; bank linking (when live) is read-only through Mono; users can unlink anytime. Under Nigeria's data protection law you should say what you collect and why. This is not legal advice.
- Never ask for bank passwords, PINs, OTPs or card numbers. The app never does, and the paste parser ignores account numbers.
- Admins cannot read bank links or the bank inbox (no admin rule was added on purpose).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not save" in the bank inbox | Publish the new rules (Part A, step 1) |
| Paste button does nothing | Browser blocked clipboard access. Use the paste box that appears. Needs HTTPS |
| Share option missing | Reinstall the PWA. Only Android Chrome supports it |
| Alert not understood | Paste the full alert, not a screenshot. Send me the text and I will extend the parser |
| Mono widget does not open | Check `monoPublicKey` and that the page is served over HTTPS |
| Server says "Not signed in" | `ALLOWED_ORIGINS` or the Firebase project in `FIREBASE_SERVICE_ACCOUNT` does not match the app |
