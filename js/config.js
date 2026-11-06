// Bike Tours R Us: settings.
// Paste the same Firebase web config you used for the 2026 crew app
// (Firebase console > Project settings > General > Your apps > SDK setup and configuration > Config).
// No emails go in this file: editors are set once in Firestore (admins/editors), riders are added in the app's Plan tab.
window.TOUR_CONFIG = {
  firebase: {
    apiKey: "PASTE_API_KEY_HERE",
    authDomain: "PASTE.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    storageBucket: "PASTE.appspot.com",
    messagingSenderId: "PASTE",
    appId: "PASTE"
  }
};
