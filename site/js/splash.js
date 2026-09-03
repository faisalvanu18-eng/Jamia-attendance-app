// ============================================================
//  Splash / loading screen
//  ------------------------------------------------------------
//  Shows the madrasa logo + name on EVERY page load / reload,
//  then fades out. Non-module so it runs early on every page.
//  Include it in <head> AFTER the stylesheet:
//    <script src="js/splash.js"></script>
// ============================================================
(function () {
  var MIN_VISIBLE_MS = 4000;  // minimum time the splash stays on screen
  var start = Date.now();

  function inject() {
    if (document.getElementById("jamiaSplash")) return;
    var el = document.createElement("div");
    el.id = "jamiaSplash";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "لوڈ ہو رہا ہے");
    el.innerHTML =
      '<div class="splash-glow" aria-hidden="true"></div>' +
      '<div class="splash-content">' +
        '<div class="splash-logo-wrap">' +
          '<span class="splash-ring" aria-hidden="true"></span>' +
          '<span class="splash-logo-disc">' +
            '<img class="splash-logo" src="assets/logo.png" alt="Jamia Logo">' +
          '</span>' +
        '</div>' +
        '<div class="splash-name">جامعہ اسلامیہ کوکن کانبلہ</div>' +
        '<div class="splash-sub">طلبہ کی حاضری کا نظام</div>' +
        '<div class="splash-bar" aria-hidden="true"><span id="jamiaSplashFill"></span></div>' +
        '<div class="splash-pct" id="jamiaSplashPct">0%</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
    startProgress();
  }

  // Animate a 0% -> 100% counter over MIN_VISIBLE_MS, updating both the
  // percentage text and the bar fill width.
  var progressTimer = null;
  function startProgress() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    var pctEl = document.getElementById("jamiaSplashPct");
    var fillEl = document.getElementById("jamiaSplashFill");
    var began = Date.now();
    progressTimer = setInterval(function () {
      var elapsed = Date.now() - began;
      var pct = Math.min(100, Math.round((elapsed / MIN_VISIBLE_MS) * 100));
      if (pctEl) pctEl.textContent = pct + "%";
      if (fillEl) fillEl.style.width = pct + "%";
      if (pct >= 100) { clearInterval(progressTimer); progressTimer = null; }
    }, 30);
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

  // Re-show the splash when the page is restored from the back/forward cache
  // (so a BACK navigation also gets the loading screen), then hide it again.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      start = Date.now();
      inject();
      var el = document.getElementById("jamiaSplash");
      if (el) el.classList.remove("splash-hide");
      startProgress();
      scheduleHide();
    }
  });

  // Safety net: never let the splash get stuck.
  setTimeout(hide, 8000);
})();
