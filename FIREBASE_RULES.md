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

    // Anything not listed above is denied by default.
  }
}
```

## What this does

- A profile cannot be saved unless `dob` is a real date string and the person is 13 or older.
- Other data (transactions, goals, budgets, planner) cannot be written until that profile exists.
- Owe / Owed records are checked for a name, a positive amount and a valid direction.
- Users can only ever read and write their own data.

## Limits to know about

- It checks the date someone submits. It cannot prove the date is true, so a person can still type a false birth date.
- Each protected write costs one extra document read for the profile check.
- Accounts created before the age check existed, with no valid `dob` on their profile, cannot write transactions, goals, budgets or the planner until they save a valid date of birth in Profile settings. The app now prompts them to do this.
- If you add a new collection or settings document later, add a `match` block for it. Until you do, it is denied.

## Test in the Rules Playground before publishing

Firebase Console > Firestore > Rules > **Rules Playground**, signed in as a test user:

1. `set` on `users/{uid}/settings/profile` with `dob: "2005-06-15"` should be **allowed**.
2. Same path with `dob: "2020-01-01"` should be **denied**.
3. Same path with no `dob` field should be **denied**.
4. `add` on `users/{uid}/transactions` for a user whose profile does not exist should be **denied**.
