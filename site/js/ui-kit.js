// ============================================================
//  UI Kit — shared helpers (non-module, load on any page)
//    <script src="js/ui-kit.js"></script>
//  Exposes: window.Toast, window.UIKit
// ============================================================
(function () {
  // ---- Toasts ----
  function host() {
    var h = document.getElementById("uiToastHost");
    if (!h) {
      h = document.createElement("div");
      h.id = "uiToastHost";
      h.setAttribute("aria-live", "polite");
      document.body.appendChild(h);
    }
    return h;
  }

  function icon(type) {
    if (type === "error") return "!";
    if (type === "info") return "i";
    return "\u2713"; // check for success
  }

  function show(message, type, duration) {
    type = type || "success";
    duration = duration || 3200;
    var el = document.createElement("div");
    el.className = "ui-toast toast-" + type;
    el.setAttribute("role", "status");
    el.innerHTML =
      '<span class="toast-ic" aria-hidden="true">' + icon(type) + '</span>' +
      '<span class="toast-msg"></span>';
    el.querySelector(".toast-msg").textContent = message;
    host().appendChild(el);

    var remove = function () {
      el.classList.add("leaving");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    };
    var timer = setTimeout(remove, duration);
    el.addEventListener("click", function () { clearTimeout(timer); remove(); });
    return el;
  }

  window.Toast = {
    success: function (m, d) { return show(m, "success", d); },
    error:   function (m, d) { return show(m, "error", d || 4500); },
    info:    function (m, d) { return show(m, "info", d); },
    show: show
  };

  // ---- Skeleton helpers ----
  // Fill a table <tbody> with shimmering skeleton rows while data loads.
  function tableSkeleton(tbody, opts) {
    if (typeof tbody === "string") tbody = document.getElementById(tbody);
    if (!tbody) return;
    opts = opts || {};
    var rows = opts.rows || 5;
    var cols = opts.cols || 3;
    var html = "";
    for (var r = 0; r < rows; r++) {
      html += "<tr>";
      for (var c = 0; c < cols; c++) {
        html += '<td><div class="skeleton skeleton-line ' + (c === 0 ? "sm" : "md") + '"></div></td>';
      }
      html += "</tr>";
    }
    tbody.innerHTML = html;
  }

  // Fill any container with a few skeleton list rows.
  function listSkeleton(box, rows) {
    if (typeof box === "string") box = document.getElementById(box);
    if (!box) return;
    rows = rows || 4;
    var html = "";
    for (var i = 0; i < rows; i++) {
      html +=
        '<div class="skeleton-row">' +
          '<div class="skeleton skeleton-circle"></div>' +
          '<div class="skeleton-lines">' +
            '<div class="skeleton skeleton-line lg"></div>' +
            '<div class="skeleton skeleton-line sm"></div>' +
          '</div>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  // Build an empty-state block (returns HTML string).
  function emptyState(opts) {
    opts = opts || {};
    var title = opts.title || "";
    var text = opts.text || "";
    var iconSvg = opts.iconSvg ||
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    var action = opts.actionHtml ? opts.actionHtml : "";
    return '<div class="empty-state">' +
      '<div class="empty-ic" aria-hidden="true">' + iconSvg + '</div>' +
      (title ? '<div class="empty-title">' + title + '</div>' : '') +
      (text ? '<div class="empty-text">' + text + '</div>' : '') +
      action +
    '</div>';
  }

  // Animate a number counting up to a target value.
  function countUp(el, target, duration) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return;
    target = Number(target) || 0;
    duration = duration || 900;
    var startVal = 0;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      // ease-out
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(startVal + (target - startVal) * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  // Toggle a button into a loading state (shows spinner, disables it).
  function btnLoading(btn, loading, labelWhenDone) {
    if (typeof btn === "string") btn = document.getElementById(btn);
    if (!btn) return;
    if (loading) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> ' + (btn.dataset.loadingLabel || "");
    } else {
      btn.disabled = false;
      btn.innerHTML = labelWhenDone || btn.dataset.originalHtml || btn.innerHTML;
      delete btn.dataset.originalHtml;
    }
  }

  window.UIKit = {
    tableSkeleton: tableSkeleton,
    listSkeleton: listSkeleton,
    emptyState: emptyState,
    countUp: countUp,
    btnLoading: btnLoading
  };
})();
