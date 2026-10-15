# EduFinance: Easy logging setup guide

Two features were added. Both fill the same review step, so the user always checks and can edit before anything is saved.

| Way a transaction arrives | Needs CAC? | Needs a server? | Status |
|---|---|---|---|
| Paste a bank alert (button, paste box, clipboard banner) | No | No | Real, works offline |
| Share an SMS/email to the installed app (Android) | No | No | Real, works offline |
| Link bank (Demo mode): fake bank + test alerts | No | No | Demo, for showing the idea |
| Link bank (Mono, real) | Test mode: no. Live mode: Mono will almost certainly ask for a registered business | Yes (small, included in `/server`) | Built, needs your keys |

---

## Part A: Put the update live (do these in order)

1. **Publish the new Firestore rules first.** Open `FIREBASE_RULES.md`, copy the rules block into Firebase Console > Firestore Database > Rules > Publish. Without this, linking a demo bank and the bank inbox will fail with "Could not save".
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

## Part C: Demo the bank link (no CAC needed)

1. Profile > **Bank link** > Link a bank account > pick any bank > confirm. It is labelled **Demo** everywhere.
2. In the sheet tap **Money out**, **Money in** or **Send 3**. A fake alert arrives in the inbox about a second later and the Home screen shows "N new transactions from your bank".
3. Tap Review, edit the description or category, tap Add.

Be upfront with anyone you demo this to: nothing real is connected. The Demo tag stays visible so nobody thinks it is a live bank connection.

## Part D: Real bank linking with Mono (when you are ready)

Mono is a Nigerian open banking provider (now part of Flutterwave). It has a free test mode with simulated banks. I built the code from Mono's published flow but could not run it against your Mono account, so verify each step in the sandbox before trusting it. Field names and endpoints can change, so keep https://docs.mono.co open while you do this.

**1. Mono account.** Sign up at mono.co, create an app, switch the dashboard to **Test mode**. Copy the test public key (`test_pk_...`) and test secret key (`test_sk_...`).

**2. Firebase service account.** Firebase Console > Project settings > Service accounts > Generate new private key. Keep the JSON file private.

**3. Deploy the server.** Put the `server/` folder in its own Git repo (or its own Vercel project with Root Directory set to `server`). In Vercel > Settings > Environment Variables, add every line from `server/.env.example` with your real values. `FIREBASE_SERVICE_ACCOUNT` is the whole JSON on one line. `ALLOWED_ORIGINS` must contain the exact address where EduFinance runs. Deploy. You will get a URL such as `https://edufinance-bank.vercel.app`.

**4. Webhook.** Mono dashboard > Webhooks: set the URL to `https://YOUR-SERVER/api/mono-webhook` and a secret. Put the same secret in `MONO_WEBHOOK_SECRET`.

**5. Point the app at it.** Edit `bank-config.js`:

```js
window.EDU_BANK_CONFIG = {
    mode: 'mono',
    monoPublicKey: 'test_pk_xxxxxxxx',
    apiBase: 'https://edufinance-bank.vercel.app'
};
```

Re-upload and bump `VERSION` in `sw.js`.

**6. Try it.** Profile > Bank link > Connect with Mono. Pick a test bank and use the sandbox credentials from Mono's docs. The server swaps the one-time code for an account id, saves the link, and fetches transactions into the bank inbox. **Sync now** pulls again on demand.

**7. Check these in the sandbox.** Mono amounts are usually in kobo. If your sandbox amounts look 100x too big or small, set `MONO_AMOUNT_IN_KOBO=false`. Also confirm the webhook header name (`mono-webhook-secret`) and the event name (`mono.events.account_updated`) match the dashboard.

**8. Going live.** Live keys need Mono to approve your business. That is where the CAC certificate usually comes in. Until then, stay in test mode and keep the app on Demo for real users.

**What real linking does not do:** it does not give instant per-transaction push by itself. It syncs when Mono says new data is ready, or when the user taps Sync now. Ask Mono whether real-time transaction webhooks are available on your plan.

## Part E: Real alternatives that do not need CAC

- **Paste and Share (already built)**: the honest, working answer today. Most users already get an SMS or email alert for every transaction.
- **Email forwarding (not built)**: give each user a private address; they auto-forward bank alert emails to it; a small server parses them with the same parser. Possible with an inbound email service. Tell me if you want it.

## Part F: Privacy and trust (do before real users)

- Update `privacy.html` and `terms.html`: say that pasted alert text is read on the device and only the amount, date, description and bank name are saved; bank linking (when live) is read-only through Mono; users can unlink anytime. Under Nigeria's data protection law you should say what you collect and why. This is not legal advice.
- Never ask for bank passwords, PINs, OTPs or card numbers. The app never does, and the paste parser ignores account numbers.
- Admins cannot read bank links or the bank inbox (no admin rule was added on purpose).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not save" when linking the demo bank | Publish the new rules (Part A, step 1) |
| Paste button does nothing | Browser blocked clipboard access. Use the paste box that appears. Needs HTTPS |
| Share option missing | Reinstall the PWA. Only Android Chrome supports it |
| Alert not understood | Paste the full alert, not a screenshot. Send me the text and I will extend the parser |
| Mono widget does not open | Check `monoPublicKey` and that the page is served over HTTPS |
| Server says "Not signed in" | `ALLOWED_ORIGINS` or the Firebase project in `FIREBASE_SERVICE_ACCOUNT` does not match the app |
