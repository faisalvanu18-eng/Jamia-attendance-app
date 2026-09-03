// ============================================================
//  Splash / loading screen
//  ------------------------------------------------------------
//  Shows the madrasa logo + name for a brief moment on page load,
//  then fades out. Non-module so it runs early on every page.
//  Include it in <head> AFTER the stylesheet:
//    <script src="js/splash.js"></script>
// ============================================================
(function () {
  // Don't show the splash more than once per browsing session so navigating
  // between internal pages stays snappy. Remove this block if you want it on
  // every single page load.
  try {
    if (sessionStorage.getItem("jamiaSplashShown")) return;
    sessionStorage.setItem("jamiaSplashShown", "1");
  } catch (e) { /* sessionStorage unavailable — just show it */ }

  var MIN_VISIBLE_MS = 1500; // minimum time the splash stays on screen
  var start = Date.now();

  function inject() {
    if (document.getElementById("jamiaSplash")) return;
    var el = document.createElement("div");
    el.id = "jamiaSplash";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "لوڈ ہو رہا ہے");
    el.innerHTML =
      '<img class="splash-logo" src="assets/logo.png" alt="Jamia Logo">' +
      '<div class="splash-name">جامعہ اسلامیہ کوکن</div>' +
      '<div class="splash-sub">طلبہ کی حاضری کا نظام</div>' +
      '<div class="splash-spinner" aria-hidden="true"></div>';
    (document.body || document.documentElement).appendChild(el);
  }

  function hide() {
    var el = document.getElementById("jamiaSplash");
    if (!el) return;
    el.classList.add("splash-hide");
    // Remove from the DOM after the fade-out transition completes.
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 600);
  }

  function scheduleHide() {
    var elapsed = Date.now() - start;
    var wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    setTimeout(hide, wait);
  }

  // Inject as soon as the body exists.
  if (document.body) {
    inject();
  } else {
    document.addEventListener("DOMContentLoaded", inject);
  }

  // Hide once the page has fully loaded (or immediately if already loaded),
  // but never before MIN_VISIBLE_MS so it doesn't flash.
  if (document.readyState === "complete") {
    scheduleHide();
  } else {
    window.addEventListener("load", scheduleHide);
  }

  // Safety net: never let the splash get stuck.
  setTimeout(hide, 6000);
})();
