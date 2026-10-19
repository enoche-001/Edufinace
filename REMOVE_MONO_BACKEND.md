# Remove Mono from your backend (Vercel project edufinanceapi)

Do these in order. Your Gemini API stays untouched.

## 1. GitHub repo (the one that has api/gemini.js)
1. Open the repo and go into the `api/` folder.
2. Delete `mono.js` and `mono-webhook.js` (open the file, tap the bin icon, commit).
3. `_lib.js`: it was added for Mono. Before deleting, open `gemini.js` and check the top for `require('./_lib')` or `from './_lib'`.
   - If gemini.js does NOT import it, delete `_lib.js`.
   - If it does, keep it.
4. Open `package.json`. If nothing else in `api/` uses `firebase-admin`, remove the `"firebase-admin": "^12.0.0"` line from `dependencies` (watch the commas). If unsure, leave it, it is harmless.
5. Open `vercel.json` if you have one. Remove any entry that mentions `mono` (for example under `functions` or `rewrites`). Leave the rest.
6. Commit. Vercel redeploys on its own.

## 2. Vercel environment variables
Vercel > edufinanceapi > Settings > Environment Variables. Delete only these:
- `MONO_SECRET_KEY`
- `MONO_WEBHOOK_SECRET`
- `MONO_AMOUNT_IN_KOBO`
- `FIREBASE_SERVICE_ACCOUNT` (only if no other api file uses it; it holds a private key, so deleting it is safer)

Keep your Gemini key and `ALLOWED_ORIGINS`. Then Deployments > latest > Redeploy.

## 3. Mono dashboard
1. Webhooks: delete the `https://edufinanceapi.vercel.app/api/mono-webhook` entry.
2. Optional: delete the test app. Your `test_sk_` and `test_pk_` keys were shared in chats and files, so treat them as used.

## 4. Firebase
1. Service account: if you deleted `FIREBASE_SERVICE_ACCOUNT`, go to Firebase Console > Project settings > Service accounts and delete or rotate the key you generated for Mono.
2. Firestore rules: publish the updated rules block in `FIREBASE_RULES.md`. The `bankLinks` rule is gone. Keep the `bankInbox` rule, because paste alerts and the demo bank use it.
3. If any `users/{uid}/bankLinks` documents exist from your tests, you can delete them in the console. Nothing reads them now.

## 5. Check it worked
Open `https://edufinanceapi.vercel.app/api/mono` in a browser. It should show a 404. Then test the Gemini feature in the app to confirm it still works.
