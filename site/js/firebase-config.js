// ============================================================
//  Firebase configuration
//  ------------------------------------------------------------
//  1. Go to  https://console.firebase.google.com
//  2. Create a project (e.g. "jamia-kokan-attendance").
//  3. Add a Web App (</> icon) and COPY the config values here.
//  4. Enable  Authentication > Sign-in method > Email/Password.
//  5. Create a  Cloud Firestore  database (production mode).
//
//  NOTE: These values are NOT secrets — they are safe to ship
//  in the browser. Your data is protected by firestore.rules.
// ============================================================

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "jamia-kokan-attendance.firebaseapp.com",
  projectId: "jamia-kokan-attendance",
  storageBucket: "jamia-kokan-attendance.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// Set to true ONLY while testing locally with the Firebase Emulator
// (firebase emulators:start). Set to false before deploying.
export const USE_EMULATOR = false;

// ============================================================
//  API_MODE — use the online PostgreSQL backend (recommended for
//  real, shared, deployable use). The frontend talks to the REST
//  API in server.js, which stores everything in PostgreSQL.
//
//  When API_MODE is true it takes priority over DEMO_MODE and
//  Firebase. By default the API is served from the SAME origin as
//  the site (server.js serves both). To point at a different API
//  host, set  window.API_BASE = "https://your-api.example.com"
//  before the modules load.
// ============================================================
export const API_MODE = true;

// ============================================================
//  DEMO_MODE — runs the whole app OFFLINE in the browser using
//  localStorage (no server/database needed). Great for a quick
//  look at how everything works. Ignored when API_MODE is true.
// ============================================================
export const DEMO_MODE = false;

// Demo login accounts (only used when DEMO_MODE is true):
// Demo credentials are retained only for the disabled DEMO_MODE development path.

