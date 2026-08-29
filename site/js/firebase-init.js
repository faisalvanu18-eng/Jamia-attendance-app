// Initialises Firebase (App + Auth + Firestore) once for the whole site.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { firebaseConfig, USE_EMULATOR, DEMO_MODE, API_MODE } from "./firebase-config.js";

// In DEMO_MODE or API_MODE we never touch real Firebase — export inert placeholders.
export let app = null;
export let auth = null;
export let db = null;

if (!DEMO_MODE && !API_MODE) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Connect to local emulators when developing.
  if (USE_EMULATOR && location.hostname === "localhost") {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    console.info("[Firebase] Using local emulators");
  }
}
