# Firestore Security Rules for EduFinance

Copy these into the Firebase Console under **Firestore Database > Rules**, then press **Publish**.
Nothing in this repo applies them automatically, so they only protect users once they are published.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    // An admin is anyone whose UID exists as a document in the "admins" collection.
    // That collection can only be edited from the Firebase Console (see below).
    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    // dob must look like "YYYY-MM-DD" (what <input type="date"> sends)
    // and be at least 13 years before the server's current time.
    function hasValidDob(data) {
      return data.get('dob', null) is string
        && data.dob.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && int(data.dob.split('-')[0]) >= 1900
        && isAtLeast13(data.dob);
    }

    function isAtLeast13(dob) {
      let p = dob.split('-');
      // Feb 29 birthdays: treat as Feb 28 so the date exists in non-leap years
      let day = (p[1] == '02' && p[2] == '29') ? 28 : int(p[2]);
      return timestamp.date(int(p[0]) + 13, int(p[1]), day) <= request.time;
    }

    // A user may only save data if their profile already exists with a valid dob.
    // This stops someone creating an account with the SDK and skipping the signup form.
    function hasValidProfile(userId) {
      return hasValidDob(get(/databases/$(database)/documents/users/$(userId)/settings/profile).data);
    }

    // Owe / Owed records: basic shape and size checks.
    function validDebt(d) {
      return d.person is string && d.person.size() > 0 && d.person.size() <= 60
        && d.amount is number && d.amount > 0 && d.amount <= 1000000000000
        && d.get('paid', 0) is number && d.get('paid', 0) >= 0
        && d.direction in ['owed_to_me', 'i_owe']
        && d.get('note', '') is string && d.get('note', '').size() <= 200
        && d.get('phone', '') is string && d.get('phone', '').size() <= 20;
    }

    // The profile itself: the age rule lives here.
    match /users/{userId}/settings/profile {
      allow read: if isOwner(userId);
      allow create, update: if isOwner(userId) && hasValidDob(request.resource.data);
    }

    // Everything else is private to the owner, and needs a valid profile to write.
    // Settings documents are listed one by one on purpose: a wildcard here would also
    // match "profile" and silently bypass the age rule above.
    match /users/{userId}/transactions/{id} {
      allow read: if isOwner(userId);
      allow create, update, delete: if isOwner(userId) && hasValidProfile(userId);
    }

    match /users/{userId}/savingsGoals/{id} {
      allow read: if isOwner(userId);
      allow create, update, delete: if isOwner(userId) && hasValidProfile(userId);
    }

    match /users/{userId}/debts/{id} {
      allow read: if isOwner(userId);
      allow create, update: if isOwner(userId) && hasValidProfile(userId) && validDebt(request.resource.data);
      allow delete: if isOwner(userId) && hasValidProfile(userId);
    }

    match /users/{userId}/settings/budgets {
      allow read: if isOwner(userId);
      allow create, update, delete: if isOwner(userId) && hasValidProfile(userId);
    }

    match /users/{userId}/settings/projection {
      allow read: if isOwner(userId);
      allow create, update, delete: if isOwner(userId) && hasValidProfile(userId);
    }

    // ---------- Admin dashboard (admin.html) ----------

    // A signed-in user can check whether THEY are an admin. Only admins can list the others.
    // Nobody can write here from the app: add or remove admins in the Firebase Console.
    match /admins/{adminId} {
      allow get: if request.auth != null && request.auth.uid == adminId;
      allow list: if isAdmin();
      allow write: if false;
    }

    // Read-only access for admins, across all users. Collection-group reads need these.
    // They grant READ only. Admins cannot create, edit or delete user data.
    match /{path=**}/settings/{docId} {
      allow read: if isAdmin();
    }
    match /{path=**}/transactions/{docId} {
      allow read: if isAdmin();
    }
    match /{path=**}/savingsGoals/{docId} {
      allow read: if isAdmin();
    }
    match /{path=**}/debts/{docId} {
      allow read: if isAdmin();
    }

    // Anything not listed above is denied by default.
  }
}
```

## What this does

- A profile cannot be saved unless `dob` is a real date string and the person is 13 or older.
- Other data (transactions, goals, budgets, planner) cannot be written until that profile exists.
- Owe / Owed records are checked for a name, a positive amount and a valid direction.
- Users can only ever read and write their own data.
- Admins (UIDs listed in the `admins` collection) can READ all user data for the admin dashboard, but cannot change it.
- The `admins` collection cannot be written from the app, so nobody can make themselves an admin.

## Limits to know about

- It checks the date someone submits. It cannot prove the date is true, so a person can still type a false birth date.
- Each protected write costs one extra document read for the profile check.
- Accounts created before the age check existed, with no valid `dob` on their profile, cannot write transactions, goals, budgets or the planner until they save a valid date of birth in Profile settings. The app now prompts them to do this.
- If you add a new collection or settings document later, add a `match` block for it. Until you do, it is denied. Admin read access to a new collection under `users/{uid}/` needs its own `/{path=**}/<name>/{docId}` block too.
- Each admin read of a protected document costs one extra read for the admin check on the query. The admin page loads everything in one go and has a Refresh cooldown to keep reads low.
- Profile documents now also store `email` and `createdAt` (older accounts are filled in the next time they open the app).

## Test in the Rules Playground before publishing

Firebase Console > Firestore > Rules > **Rules Playground**, signed in as a test user:

1. `set` on `users/{uid}/settings/profile` with `dob: "2005-06-15"` should be **allowed**.
2. Same path with `dob: "2020-01-01"` should be **denied**.
3. Same path with no `dob` field should be **denied**.
4. `add` on `users/{uid}/transactions` for a user whose profile does not exist should be **denied**.
5. Signed in as a normal user, `get` on `admins/{your-uid}` should be **denied**, and a collection-group `list` on `transactions` should be **denied**.
6. Signed in as an admin (your UID exists in `admins`), a `get` on `users/{any-uid}/transactions/{id}` should be **allowed**, and a `create` there should be **denied**.
