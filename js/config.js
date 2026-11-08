// Bike Tours R Us: settings.
// Paste the same Firebase web config you used for the 2026 crew app
// (Firebase console > Project settings > General > Your apps > SDK setup and configuration > Config).
// No emails go in this file: admins are set once in Firestore (admins/editors); each tour's editors and riders are added in the app (Plan > Crew).
window.TOUR_CONFIG = {
  firebase: {
   apiKey: "AIzaSyC2L-aEPgEshZ9uHCKM9VNgr1SwWzNi02s",
    authDomain: "bike-tour-2026.firebaseapp.com",
    projectId: "bike-tour-2026",
    storageBucket: "bike-tour-2026.firebasestorage.app",
    messagingSenderId: "498247627512",
    appId: "1:498247627512:web:b6838492da7a28e7d4410d"
  }
};
