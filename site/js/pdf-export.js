/*
 * pdf-export.js
 * -------------------------------------------------------------
 * Reliable "Print / Save as PDF" that works on phones as well as
 * desktops.
 *
 * Why this file exists:
 *   The pages used to call window.print() directly from an inline
 *   onclick handler. On many mobile browsers (especially in-app
 *   webviews and some Android Chrome builds) that call is either
 *   blocked or silently does nothing, so the PDF "would not open"
 *   on the phone.
 *
 * Strategy:
 *   1. Lazy-load html2pdf.js (html2canvas + jsPDF) from a CDN the
 *      first time the user taps the button. This produces a REAL
 *      downloadable .pdf file – the most reliable option on phones.
 *      The DOM is rasterised as-is, so the bundled Urdu / Nastaliq
 *      font renders correctly and RTL layout is preserved.
 *   2. If the library cannot be loaded (offline, blocked CDN), fall
 *      back to the native window.print() so desktop users are never
 *      worse off than before.
 *
 * Usage:
 *   <script src="js/pdf-export.js"></script>
 *   <button onclick="JamiaPDF.export()">Print / PDF</button>
 *
 *   Optionally pass a filename and/or a specific element id:
 *   JamiaPDF.export({ filename: 'attendance.pdf', targetId: 'content' });
 */
(function () {
  "use strict";

  var HTML2PDF_SRC =
    "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js";

  var loaderPromise = null;

  function loadHtml2Pdf() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (loaderPromise) return loaderPromise;

    loaderPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = HTML2PDF_SRC;
      s.async = true;
      s.onload = function () {
        if (window.html2pdf) resolve(window.html2pdf);
        else reject(new Error("html2pdf loaded but global missing"));
      };
      s.onerror = function () {
        reject(new Error("Failed to load html2pdf.js"));
      };
      document.head.appendChild(s);
    });
    return loaderPromise;
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () {
      t.classList.remove("show");
    }, 2600);
  }

  // Choose the best element to turn into a PDF: the caller-supplied
  // target, else the results container, else the main content area.
  function pickTarget(targetId) {
    if (targetId) {
      var el = document.getElementById(targetId);
      if (el) return el;
    }
    return (
      document.getElementById("content") ||
      document.querySelector(".main") ||
      document.body
    );
  }

  function buildFilename(custom) {
    if (custom) return custom;
    var title = (document.title || "report").split("|")[0].trim();
    // Try to append a date shown on the page, if any.
    var d = document.getElementById("viewDate");
    var stamp = d && d.value ? d.value : new Date().toISOString().slice(0, 10);
    return (title || "report") + " - " + stamp + ".pdf";
  }

  function exportPdf(opts) {
    opts = opts || {};
    var target = pickTarget(opts.targetId);
    var filename = buildFilename(opts.filename);

    toast("PDF تیار ہو رہا ہے...");

    loadHtml2Pdf()
      .then(function (html2pdf) {
        // Temporarily hide anything marked .no-print inside the target
        // so the exported PDF only contains the report itself.
        var hidden = [];
        var nps = target.querySelectorAll(".no-print");
        for (var i = 0; i < nps.length; i++) {
          hidden.push([nps[i], nps[i].style.display]);
          nps[i].style.display = "none";
        }

        var options = {
          margin: [8, 8, 8, 8],
          filename: filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollX: 0,
            scrollY: 0,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: ".card" },
        };

        return html2pdf()
          .set(options)
          .from(target)
          .save()
          .then(function () {
            // Restore hidden elements.
            for (var j = 0; j < hidden.length; j++) {
              hidden[j][0].style.display = hidden[j][1];
            }
          });
      })
      .catch(function (err) {
        // Could not build a PDF (offline / CDN blocked). Fall back to
        // the browser's native print dialog so nothing is lost.
        console.warn("PDF export failed, falling back to print():", err);
        try {
          window.print();
        } catch (e) {
          toast("PDF نہیں بن سکا۔ براہِ کرم دوبارہ کوشش کریں۔");
        }
      });
  }

  window.JamiaPDF = { export: exportPdf };
})();
