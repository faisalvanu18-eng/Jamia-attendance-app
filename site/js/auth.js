// Authentication helpers: login, logout, route guarding and shared UI.
import { auth } from "./firebase-init.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getUserProfile } from "./data.js";
import { DEMO_MODE, API_MODE } from "./firebase-config.js";
import { demoLogin, demoCurrentUser, demoLogout } from "./demo-store.js";
import { apiLogin, apiCurrentUser, apiLogout, apiVerifySession } from "./api-store.js";

export function currentUser() {
  if (API_MODE) {
    if (!apiCurrentUser()) return Promise.resolve(null);
    return apiVerifySession();
  }
  if (DEMO_MODE) return Promise.resolve(demoCurrentUser());
  return new Promise((resolve) => {
    let settled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (settled) return;
      settled = true;
      unsub();
      if (!user) return resolve(null);
      const profile = await getUserProfile(user.uid);
      resolve({ uid: user.uid, email: user.email, ...(profile || {}) });
    });
  });
}

export async function requireAuth(requiredRole = null) {
  const user = await currentUser();
  if (!user) {
    location.href = "index.html";
    return null;
  }
  if (requiredRole && user.role !== requiredRole) {
    location.href = user.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
    return null;
  }
  return user;
}

export async function login(email, password, remember = true) {
  if (API_MODE) return apiLogin(email, password);
  if (DEMO_MODE) return demoLogin(email, password);
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getUserProfile(cred.user.uid);
  return { uid: cred.user.uid, email: cred.user.email, ...(profile || {}) };
}

export async function logout() {
  // Use location.replace (not href) so the authenticated page is removed from
  // browser history. This prevents the "press Back after logout reopens the
  // protected page / logout popup" problem for both teachers and admins.
  if (API_MODE) { apiLogout(); location.replace("index.html"); return; }
  if (DEMO_MODE) { demoLogout(); location.replace("index.html"); return; }
  await signOut(auth);
  location.replace("index.html");
}

function ensureLogoutModal() {
  if (document.getElementById("logoutConfirmModal")) return;
  const el = document.createElement("div");
  el.id = "logoutConfirmModal";
  el.className = "modal-overlay logout-modal-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "logoutConfirmTitle");
  el.innerHTML = `
    <div class="modal logout-modal" tabindex="-1">
      <button class="modal-close" type="button" data-logout-cancel aria-label="بند کریں">×</button>
      <div class="logout-modal-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/></svg>
      </div>
      <h3 id="logoutConfirmTitle">لاگ آؤٹ</h3>
      <p>کیا آپ واقعی لاگ آؤٹ کرنا چاہتے ہیں؟</p>
      <div class="logout-modal-actions">
        <button class="btn btn-outline" type="button" data-logout-cancel>منسوخ کریں</button>
        <button class="btn btn-red" type="button" data-logout-confirm>لاگ آؤٹ</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  let previousFocus = null;
  const close = () => {
    el.classList.remove("show");
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  };
  const open = (source) => {
    previousFocus = source || document.activeElement;
    el.classList.add("show");
    const modal = el.querySelector(".logout-modal");
    setTimeout(() => modal.focus(), 0);
  };
  el.querySelectorAll("[data-logout-cancel]").forEach(b => b.addEventListener("click", close));
  el.querySelector("[data-logout-confirm]").addEventListener("click", async () => {
    const b = el.querySelector("[data-logout-confirm]");
    b.disabled = true;
    // Hide the modal before navigating so a bfcache restore of this page can
    // never show the logout popup again.
    el.classList.remove("show");
    await logout();
  });
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  document.addEventListener("keydown", (e) => {
    if (!el.classList.contains("show")) return;
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const focusable = [...el.querySelectorAll("button")].filter(x => !x.disabled);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  el._open = open;
}

function normalizeIcons() {
  const icons = {
    "🏠":"home","👤":"user","👥":"users","🌿":"calendar","📅":"calendar","📋":"clipboard","🔍":"search","📊":"chart","⚠":"warning","🚪":"logout","✎":"edit","🗑":"trash","👁":"eye","🔔":"bell","💾":"save","🔄":"refresh","🖨":"print","🔐":"lock","🔒":"lock","☀":"sun","🌞":"sun","✚":"plus","➕":"plus"
  };
  const paths = {
    home:'M3 10.5 12 3l9 7.5V21H3zM9 21v-6h6v6', user:'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', calendar:'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16', clipboard:'M6 4h12v17H6zM9 4V2h6v2M9 9h6M9 13h6M9 17h4', search:'m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4', chart:'M4 19V5M4 19h16M8 16v-5M12 16V7M16 16v-9', warning:'M12 3 22 21H2zM12 9v4M12 17h.01', logout:'M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6', edit:'m4 20 4-1 10-10a2.1 2.1 0 0 0-3-3L5 16z', trash:'M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3', eye:'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', save:'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7', refresh:'M20 11a8 8 0 1 0 1 4M20 4v7h-7', print:'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z', lock:'M6 10V7a6 6 0 0 1 12 0v3M5 10h14v11H5z', sun:'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', plus:'M12 5v14M5 12h14'
  };
  const makeSvg = key => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[key] || paths.users}"/></svg>`;
  document.querySelectorAll(".ic,.lic,.field-icon,.r-ic").forEach(el => {
    if (el.dataset.iconDone) return;
    const raw = (el.textContent || "").trim();
    const key = icons[raw] || (el.classList.contains("field-icon") ? (raw.includes("🔒") ? "lock" : "user") : null);
    if (!key) return;
    el.innerHTML = makeSvg(key);
    el.dataset.iconDone = "1";
  });
}

export function bindLogout() {
  ensureLogoutModal();
  normalizeIcons();
  document.querySelectorAll("#logoutBtn, #logoutBtn2, .logout-link").forEach(el => {
    if (el.dataset.logoutBound) return;
    el.dataset.logoutBound = "1";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("logoutConfirmModal")._open(el);
    });
  });

  const toggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  if (toggle && sidebar && !toggle.dataset.menuBound) {
    toggle.dataset.menuBound = "1";
    let backdrop = document.querySelector(".sidebar-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "sidebar-backdrop";
      sidebar.parentNode.insertBefore(backdrop, sidebar.nextSibling);
    }
    const close = () => sidebar.classList.remove("open");
    toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
    backdrop.addEventListener("click", close);
    sidebar.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
  }
}
