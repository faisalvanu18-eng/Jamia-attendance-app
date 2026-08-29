// ============================================================
//  API STORE — talks to the PostgreSQL-backed REST API.
//  Active when API_MODE = true (see firebase-config.js).
//
//  Mirrors the function names used by the demo store so the
//  rest of the app can call the same helpers regardless of mode.
//
//  Auth: on login we store a JWT + user profile in localStorage
//  and send the token as `Authorization: Bearer <token>` on
//  every request.
// ============================================================

const TOKEN_KEY = "jamia_api_token";
const USER_KEY = "jamia_api_user";
const TODAY = (window.JAMIA_TODAY || new Date().toISOString().slice(0, 10));

export const SESSIONS = { morning: "صبح", afternoon: "دوپہر" };
export const REASONS = { sick: "بیمار", leave: "رخصت پر", other: "دیگر" };

// API base: same origin by default. Can be overridden with a global
// window.API_BASE (useful if the frontend is hosted separately).
function apiBase() {
  return (typeof window !== "undefined" && window.API_BASE) || "";
}

function getToken() { return localStorage.getItem(TOKEN_KEY); }

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(apiBase() + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    // Token expired / invalid / signed with an old secret.
    // Clear the stale session and send the user back to login cleanly,
    // so navigating between pages never leaves a half-broken screen.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Don't redirect for the login call itself (that surfaces "wrong password").
    if (path !== "/api/login" && typeof location !== "undefined") {
      const onLogin = /(^|\/)index\.html$/.test(location.pathname) || location.pathname === "/";
      if (!onLogin) location.replace("index.html");
    }
  }
  if (!res.ok) {
    let detail = "", body = {};
    try { body = await res.json(); detail = body.error || ""; } catch {}
    const err = new Error(body.message || detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = detail;
    err.reason = body.reason;
    err.serverMessage = body.message;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- Auth ----
export async function apiLogin(email, password) {
  const data = await api("/api/login", { method: "POST", body: { email, password } });
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}
export function apiCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !getToken()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
// Verify the stored token against the server (/api/me). Returns the fresh
// user profile if the token is valid, or null if it is missing/stale.
// On a 401 the api() helper already clears the session, so a null result
// means the caller should treat the user as logged out.
export async function apiVerifySession() {
  if (!getToken()) return null;
  try {
    const me = await api("/api/me");           // 401 -> clears session + throws
    const user = { uid: me.uid, email: me.email, name: me.name, role: me.role };
    localStorage.setItem(USER_KEY, JSON.stringify(user)); // refresh cache
    return user;
  } catch (err) {
    // Distinguish a genuine auth failure (401) from a transient network/server
    // problem. On a 401 the api() helper already cleared the token, so the user
    // really is logged out -> return null. But if the backend is merely
    // unreachable (fetch threw, no err.status) or returned a 5xx, we must NOT
    // treat that as "logged out": doing so causes an index<->dashboard reload
    // loop while the server is down. In that case fall back to the cached user.
    if (err && err.status === 401) return null;
    const cached = apiCurrentUser();
    if (cached) return cached;
    return null;
  }
}
export function apiLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ---- Users / profile ----
export async function getUserProfile(uid) {
  // The token already identifies the user; /api/me returns the profile.
  const u = apiCurrentUser();
  if (u && u.uid === uid) return { id: u.uid, ...u };
  try { const me = await api("/api/me"); return { id: me.uid, ...me }; } catch { return null; }
}

// ---- Classes ----
export async function getClass(classId) {
  return api("/api/classes/" + encodeURIComponent(classId));
}
export async function getAllClasses() {
  return api("/api/classes");
}

// ---- Assignments ----
export async function getAllAssignments() {
  return api("/api/assignments");
}
export async function getAssignmentsForTeacher(teacherId) {
  return api("/api/assignments?teacherId=" + encodeURIComponent(teacherId));
}
export async function getAssignment(classId, session) {
  const all = await getAllAssignments();
  return all.find((a) => a.classId === classId && a.session === session) || null;
}
export async function createAssignment(classId, session, teacherId) {
  return api("/api/assignments", { method: "POST", body: { classId, session, teacherId } });
}
export async function removeAssignment(assignmentId) {
  await api("/api/assignments/" + encodeURIComponent(assignmentId), { method: "DELETE" });
  return true;
}

// ---- Students ----
export async function getStudentsByClass(classId, batch) {
  let path = "/api/students?classId=" + encodeURIComponent(classId);
  if (batch) path += "&batch=" + encodeURIComponent(batch);
  const rows = await api(path);
  return rows.sort((a, b) => (a.roll || 0) - (b.roll || 0) || (a.name || "").localeCompare(b.name || "", "ur"));
}
export async function countAllStudents() {
  const r = await api("/api/students/count");
  return r.count;
}
export async function searchStudents(qStr, batch) {
  const q = String(qStr || "").trim();
  let path = "/api/students?q=" + encodeURIComponent(q);
  if (batch) path += "&batch=" + encodeURIComponent(batch);
  return api(path);
}
export async function getBatches(classId) {
  let path = "/api/batches";
  if (classId) path += "?classId=" + encodeURIComponent(classId);
  return api(path);
}
export async function addStudent(classId, name, batch) {
  return api("/api/students", { method: "POST", body: { classId, name, batch: batch || null } });
}
export async function editStudent(studentId, { name, classId, batch } = {}) {
  return api("/api/students/" + encodeURIComponent(studentId), {
    method: "PUT", body: { name, classId, batch }
  });
}
export async function removeStudent(studentId) {
  await api("/api/students/" + encodeURIComponent(studentId), { method: "DELETE" });
  return true;
}

// ---- Holidays (class-wise; multi-class + date range on create) ----
export async function getHolidays({ date, classId } = {}) {
  const qs = [];
  if (date) qs.push("date=" + encodeURIComponent(date));
  if (classId) qs.push("classId=" + encodeURIComponent(classId));
  return api("/api/holidays" + (qs.length ? "?" + qs.join("&") : ""));
}
// payload: { classIds:[...], fromDate, toDate, session, note }
//   classIds omitted/empty  -> all classes
//   toDate omitted          -> single day (fromDate)
export async function addHoliday({ classIds, classId, fromDate, toDate, date, session, note }) {
  return api("/api/holidays", {
    method: "POST",
    body: {
      classIds: Array.isArray(classIds) ? classIds : undefined,
      classId: classId || null,
      fromDate: fromDate || date || null,
      toDate: toDate || fromDate || date || null,
      session,
      note: note || null
    }
  });
}
export async function editHoliday(id, patch) {
  return api("/api/holidays/" + encodeURIComponent(id), { method: "PUT", body: patch });
}
export async function removeHoliday(id) {
  await api("/api/holidays/" + encodeURIComponent(id), { method: "DELETE" });
  return true;
}

// ---- Holiday status (for teacher attendance page) ----
export async function getHolidayStatus(date, classId) {
  const qs = ["date=" + encodeURIComponent(date)];
  if (classId) qs.push("classId=" + encodeURIComponent(classId));
  return api("/api/holiday-status?" + qs.join("&"));
}

// ---- Attendance ----
export function attendanceId(date, classId, session) { return `${date}__${classId}__${session}`; }

export async function saveAttendance({ date, classId, session, records, markedBy }) {
  return api("/api/attendance", {
    method: "POST",
    body: { date, classId, session, records, markedBy }
  });
}
export async function getAttendance(date, classId, session) {
  const qs = `?date=${encodeURIComponent(date)}&classId=${encodeURIComponent(classId)}&session=${encodeURIComponent(session)}`;
  return api("/api/attendance" + qs);
}
export async function getAttendanceByDate(date) {
  return api("/api/attendance?date=" + encodeURIComponent(date));
}
async function _allAttendance() {
  return api("/api/attendance");
}

// ---- Admin analytics (computed client-side from the API data) ----
export async function getPending(date, onlyPastDeadline = true) {
  const [assigns, dayDocs] = await Promise.all([getAllAssignments(), getAttendanceByDate(date)]);
  const done = new Set(dayDocs.map((a) => `${a.classId}__${a.session}`));
  const now = new Date();
  const past = (session) => {
    if (date !== TODAY) return true;
    const h = now.getHours(), m = now.getMinutes();
    return session === "morning" ? (h > 8 || (h === 8 && m >= 30)) : (h > 15 || (h === 15 && m >= 30));
  };
  return assigns.filter((a) => !done.has(`${a.classId}__${a.session}`) && (!onlyPastDeadline || past(a.session)));
}

export async function getAbsentByDate(date) {
  const [dayDocs, classes] = await Promise.all([getAttendanceByDate(date), getAllClasses()]);
  const cmap = Object.fromEntries(classes.map((c) => [c.id, c.name]));
  const out = [];
  for (const a of dayDocs) {
    const students = await getStudentsByClass(a.classId);
    const smap = Object.fromEntries(students.map((s) => [s.id, s.name]));
    Object.entries(a.records || {}).forEach(([sid, r]) => {
      if (r.status === "absent")
        out.push({ studentId: sid, name: smap[sid] || sid, className: cmap[a.classId] || a.classId, session: a.session, reason: r.reason || "other" });
    });
  }
  return out;
}

export async function getStudentHistory(studentId, start, end) {
  const all = await _allAttendance();
  const byDate = {};
  all.forEach((a) => {
    if (!a.records || !a.records[studentId]) return;
    if (start && a.date < start) return;
    if (end && a.date > end) return;
    byDate[a.date] = byDate[a.date] || { date: a.date, morning: null, afternoon: null };
    byDate[a.date][a.session] = a.records[studentId];
  });
  const rows = Object.values(byDate).sort((x, y) => x.date.localeCompare(y.date));
  const totals = { present: 0, absent: 0, sick: 0, leave: 0, other: 0, sessions: 0 };
  rows.forEach((r) => ["morning", "afternoon"].forEach((s) => {
    const rec = r[s]; if (!rec) return;
    totals.sessions++;
    if (rec.status === "present") totals.present++;
    else { totals.absent++; totals[rec.reason || "other"]++; }
  }));
  totals.percentage = totals.sessions ? Math.round((totals.present / totals.sessions) * 100) : 0;
  return { rows, totals };
}

export async function getMonthlyReport(month, classId = null) {
  const studs = (await searchStudents("")).filter((s) => !classId || s.classId === classId);
  const all = await _allAttendance();
  // group attendance by student for efficiency
  const out = [];
  for (const s of studs) {
    const totals = { present: 0, absent: 0, sessions: 0 };
    all.forEach((a) => {
      if (a.date < month + "-01" || a.date > month + "-31") return;
      const rec = a.records && a.records[s.id];
      if (!rec) return;
      totals.sessions++;
      if (rec.status === "present") totals.present++;
      else totals.absent++;
    });
    const percentage = totals.sessions ? Math.round((totals.present / totals.sessions) * 100) : 0;
    out.push({ id: s.id, name: s.name, className: s.className, present: totals.present, absent: totals.absent, sessions: totals.sessions, percentage });
  }
  return out;
}

// ---- Account management (admin) ----
export async function createAccount(email, password, name, role) {
  return api("/api/accounts", { method: "POST", body: { email, password, name, role } });
}
export async function deleteAccount(email) {
  await api("/api/accounts/" + encodeURIComponent(email), { method: "DELETE" });
  return true;
}
export async function getAllAccounts() {
  return api("/api/accounts");
}
export async function changePassword(email, newPassword) {
  const r = await api("/api/accounts/password", { method: "POST", body: { email, newPassword } });
  return r.ok;
}

// ---- Reset all data (admin) ----
export async function resetAllData(password, confirmPassword) {
  return api("/api/reset", { method: "POST", body: { password, confirmPassword } });
}
