# EduFinance Admin: one-time setup

1. **Publish the rules.** Copy the rules block from `FIREBASE_RULES.md` into Firebase Console > Firestore Database > Rules, then press Publish.
2. **Make sure your admin account exists.** Sign up or log in once at `login.html` with the email you want to use as admin.
3. **Copy your UID.** Firebase Console > Authentication > Users > copy the "User UID" of that account.
   (Or open `admin.html`, sign in, and copy the UID shown on the "Access not granted" screen.)
4. **Create the admins collection.** Firestore Database > Data > Start collection:
   - Collection ID: `admins`
   - Document ID: paste your UID
   - Field: `email` (string) = your email. Optionally add `name` (string).
5. **Open `admin.html`**, sign in, and you are in.

To remove an admin, delete their document in `admins`. Admin rights can only be changed in the Firebase Console.

If Google sign-in fails with "unauthorized domain", add your site's domain under Authentication > Settings > Authorized domains.
