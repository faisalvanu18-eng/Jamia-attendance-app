// Plain (non-module) global config so that classic <script> files
// (auth-guard.js, seed-demo.js, inline login handler) know which
// backend mode is active. Keep these in sync with firebase-config.js.
//
//   API_MODE  -> online PostgreSQL backend (recommended)
//   DEMO_MODE -> offline localStorage demo
window.JAMIA_TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

window.JAMIA_CONFIG = {
  API_MODE: true,
  DEMO_MODE: false
};
