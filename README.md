# Bike Tours R Us (Phase 2)

The tour planner and roadbook for 2027 onwards. Tours live in Firebase, so you and Tony
plan them in the app's Plan tab; nothing is hard-coded.

Uses the **same Firebase project as the 2026 crew app**, so everyone's existing logins keep working.

## What's in here
- `index.html`, `css/app.css`, `js/app.js`: the app
- `js/config.js`: paste your Firebase web config here (no emails)
- `js/firebase-bundle.js`: Firebase SDK 10.14, bundled so the app works offline
- `data/tour-2026.json`: the 2026 tour, ready to bring in from the Plan tab
- `firestore.rules`: rule **additions** to paste into your existing rules
- `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/`: home-screen app pieces

## One-time setup
1. **Rules:** Firebase console > Firestore Database > Rules. Keep everything that's there.
   Paste the block between the "copy from here / copy to here" markers in `firestore.rules`
   just before the last closing brace of `match /databases/{database}/documents { ... }`. Publish.
2. **Editors:** Firestore Database > Data > Start collection `admins`, document ID `editors`,
   field `emails` (type array) with two strings: your login email and Tony's, in lowercase. Save.
3. **Config:** copy `config.js` values from the 2026 crew repo's `config.js` (the `firebase` part only).
4. **Publish:** new GitHub repo (e.g. `bike-tours-r-us`), upload everything, Settings > Pages >
   Deploy from a branch > main > / (root).
5. **Authorised domain:** already done for 2026 if it's the same GitHub username.

## Updating later
Upload changed files. App files update the next time the app is opened with signal.
If you change fonts or icons, bump `VERSION` in `sw.js`.
