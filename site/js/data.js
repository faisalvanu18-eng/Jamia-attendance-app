// Data-access helpers. Branches between three backends:
//   API_MODE   -> online PostgreSQL REST API (see api-store.js)  [recommended]
//   DEMO_MODE  -> in-browser localStorage mock (see demo-store.js)
//   otherwise  -> Firebase / Firestore
import { db } from "./firebase-init.js";
import {
  collection, doc, getDoc, getDocs, setDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { DEMO_MODE, API_MODE } from "./firebase-config.js";
import * as demo from "./demo-store.js";
import * as apiStore from "./api-store.js";

export const SESSIONS = demo.SESSIONS;   // { morning:'صبح', afternoon:'دوپہر' }
export const REASONS = demo.REASONS;     // { sick:'بیمار', leave:'رخصت پر', other:'دیگر' }
const TODAY = (window.JAMIA_TODAY || new Date().toISOString().slice(0, 10));

// ---------- Users ----------
export async function getUserProfile(uid) {
  if (API_MODE) return apiStore.getUserProfile(uid);
  if (DEMO_MODE) return demo.demoGetUserProfile(uid);
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

// ---------- Classes ----------
export async function getClass(classId) {
  if (API_MODE) return apiStore.getClass(classId);
  if (DEMO_MODE) return demo.demoGetClass(classId);
  const s = await getDoc(doc(db, "classes", classId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function getAllClasses() {
  if (API_MODE) return apiStore.getAllClasses();
  if (DEMO_MODE) return demo.demoGetAllClasses();
  const s = await getDocs(collection(db, "classes"));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------- Assignments (teacher <-> class+session) ----------
async function _rawAssignments() {
  const s = await getDocs(collection(db, "assignments"));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getAllAssignments() {
  if (API_MODE) return apiStore.getAllAssignments();
  if (DEMO_MODE) return demo.demoGetAllAssignments();
  const [assigns, classes, users] = await Promise.all([
    _rawAssignments(), getAllClasses(),
    getDocs(collection(db, "users")).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
  ]);
  const cmap = Object.fromEntries(classes.map(c => [c.id, c.name]));
  const umap = Object.fromEntries(users.map(u => [u.id, u.name]));
  return assigns.map(a => ({ ...a, className: cmap[a.classId] || a.classId, teacherName: umap[a.teacherId] || a.teacherId }));
}
export async function getAssignmentsForTeacher(teacherId) {
  if (API_MODE) return apiStore.getAssignmentsForTeacher(teacherId);
  if (DEMO_MODE) return demo.demoGetAssignmentsForTeacher(teacherId);
  return (await getAllAssignments()).filter(a => a.teacherId === teacherId);
}
export async function getAssignment(classId, session) {
  if (API_MODE) return apiStore.getAssignment(classId, session);
  if (DEMO_MODE) return demo.demoGetAssignment(classId, session);
  return (await getAllAssignments()).find(a => a.classId === classId && a.session === session) || null;
}
export async function createAssignment(classId, session, teacherId) {
  if (API_MODE) return apiStore.createAssignment(classId, session, teacherId);
  if (DEMO_MODE) return demo.demoCreateAssignment(classId, session, teacherId);
  throw new Error("Assignment management requires the PostgreSQL backend (API_MODE).");
}
export async function removeAssignment(assignmentId) {
  if (API_MODE) return apiStore.removeAssignment(assignmentId);
  if (DEMO_MODE) return demo.demoRemoveAssignment(assignmentId);
  throw new Error("Assignment management requires the PostgreSQL backend (API_MODE).");
}

// ---------- Students ----------
export async function getStudentsByClass(classId, batch) {
  if (API_MODE) return apiStore.getStudentsByClass(classId, batch);
  if (DEMO_MODE) return demo.demoGetStudentsByClass(classId);
  const s = await getDocs(query(collection(db, "students"), where("classId", "==", classId)));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, "ur"));
}
export async function countAllStudents() {
  if (API_MODE) return apiStore.countAllStudents();
  if (DEMO_MODE) return demo.demoCountAllStudents();
  const s = await getDocs(collection(db, "students"));
  return s.size;
}
export async function searchStudents(qStr, batch) {
  if (API_MODE) return apiStore.searchStudents(qStr, batch);
  if (DEMO_MODE) return demo.demoSearchStudents(qStr);
  const [studs, classes] = await Promise.all([
    getDocs(collection(db, "students")).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    getAllClasses()
  ]);
  const cmap = Object.fromEntries(classes.map(c => [c.id, c.name]));
  const q = String(qStr || "").trim();
  return studs.filter(s => !q || (s.name || "").includes(q))
    .map(s => ({ ...s, className: cmap[s.classId] || s.classId }));
}
export async function getBatches(classId) {
  if (API_MODE) return apiStore.getBatches(classId);
  return [];
}

// ---------- Attendance ----------
export function attendanceId(date, classId, session) { return `${date}__${classId}__${session}`; }

export async function saveAttendance({ date, classId, session, records, markedBy }) {
  if (API_MODE) return apiStore.saveAttendance({ date, classId, session, records, markedBy });
  if (DEMO_MODE) return demo.demoSaveAttendance({ date, classId, session, records, markedBy });
  const absent = Object.values(records).filter(r => r.status === "absent").length;
  const total = Object.keys(records).length;
  const payload = {
    date, classId, session, teacherId: markedBy || null, records,
    summary: { total, present: total - absent, absent },
    markedBy: markedBy || null, markedAt: new Date().toISOString(), late: date < TODAY
  };
  await setDoc(doc(db, "attendance", attendanceId(date, classId, session)), payload);
  return payload;
}
export async function getAttendance(date, classId, session) {
  if (API_MODE) return apiStore.getAttendance(date, classId, session);
  if (DEMO_MODE) return demo.demoGetAttendance(date, classId, session);
  const s = await getDoc(doc(db, "attendance", attendanceId(date, classId, session)));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function getAttendanceByDate(date) {
  if (API_MODE) return apiStore.getAttendanceByDate(date);
  if (DEMO_MODE) return demo.demoGetAttendanceByDate(date);
  const s = await getDocs(query(collection(db, "attendance"), where("date", "==", date)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function _allAttendance() {
  if (DEMO_MODE) return demo.demoGetAllAttendance();
  const s = await getDocs(collection(db, "attendance"));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------- Admin analytics ----------
export async function getPending(date, onlyPastDeadline = true) {
  if (API_MODE) return apiStore.getPending(date, onlyPastDeadline);
  if (DEMO_MODE) return demo.demoGetPending(date, onlyPastDeadline);
  const [assigns, dayDocs] = await Promise.all([getAllAssignments(), getAttendanceByDate(date)]);
  const done = new Set(dayDocs.map(a => `${a.classId}__${a.session}`));
  const now = new Date();
  const past = (session) => {
    if (date !== TODAY) return true;
    const h = now.getHours(), m = now.getMinutes();
    return session === "morning" ? (h > 8 || (h === 8 && m >= 30)) : (h > 15 || (h === 15 && m >= 30));
  };
  return assigns.filter(a => !done.has(`${a.classId}__${a.session}`) && (!onlyPastDeadline || past(a.session)));
}

export async function getAbsentByDate(date) {
  if (API_MODE) return apiStore.getAbsentByDate(date);
  if (DEMO_MODE) return demo.demoGetAbsentByDate(date);
  const [dayDocs, classes] = await Promise.all([getAttendanceByDate(date), getAllClasses()]);
  const cmap = Object.fromEntries(classes.map(c => [c.id, c.name]));
  const out = [];
  for (const a of dayDocs) {
    const students = await getStudentsByClass(a.classId);
    const smap = Object.fromEntries(students.map(s => [s.id, s.name]));
    Object.entries(a.records || {}).forEach(([sid, r]) => {
      if (r.status === "absent")
        out.push({ studentId: sid, name: smap[sid] || sid, className: cmap[a.classId] || a.classId, session: a.session, reason: r.reason || "other" });
    });
  }
  return out;
}

export async function getStudentHistory(studentId, start, end) {
  if (API_MODE) return apiStore.getStudentHistory(studentId, start, end);
  if (DEMO_MODE) return demo.demoGetStudentHistory(studentId, start, end);
  const all = await _allAttendance();
  const byDate = {};
  all.forEach(a => {
    if (!a.records || !a.records[studentId]) return;
    if (start && a.date < start) return;
    if (end && a.date > end) return;
    byDate[a.date] = byDate[a.date] || { date: a.date, morning: null, afternoon: null };
    byDate[a.date][a.session] = a.records[studentId];
  });
  const rows = Object.values(byDate).sort((x, y) => x.date.localeCompare(y.date));
  const totals = { present: 0, absent: 0, sick: 0, leave: 0, other: 0, sessions: 0 };
  rows.forEach(r => ["morning", "afternoon"].forEach(s => {
    const rec = r[s]; if (!rec) return;
    totals.sessions++;
    if (rec.status === "present") totals.present++;
    else { totals.absent++; totals[rec.reason || "other"]++; }
  }));
  totals.percentage = totals.sessions ? Math.round((totals.present / totals.sessions) * 100) : 0;
  return { rows, totals };
}

export async function getMonthlyReport(month, classId = null) {
  if (API_MODE) return apiStore.getMonthlyReport(month, classId);
  if (DEMO_MODE) return demo.demoGetMonthlyReport(month, classId);
  const studs = (await searchStudents("")).filter(s => !classId || s.classId === classId);
  const out = [];
  for (const s of studs) {
    const h = await getStudentHistory(s.id, month + "-01", month + "-31");
    out.push({ id: s.id, name: s.name, className: s.className, present: h.totals.present, absent: h.totals.absent, sessions: h.totals.sessions, percentage: h.totals.percentage });
  }
  return out;
}

// ---------- Student Management (Add / Remove) ----------
export async function addStudent(classId, name) {
  if (API_MODE) return apiStore.addStudent(classId, name);
  if (DEMO_MODE) return demo.demoAddStudent(classId, name);
  const students = await getStudentsByClass(classId);
  const maxRoll = students.reduce((max, s) => Math.max(max, s.roll || 0), 0);
  const newId = `${classId}-${maxRoll + 1}`;
  await setDoc(doc(db, "students", newId), { name, classId, roll: maxRoll + 1 });
  return { id: newId, name, classId, roll: maxRoll + 1 };
}

export async function removeStudent(studentId) {
  if (API_MODE) return apiStore.removeStudent(studentId);
  if (DEMO_MODE) return demo.demoRemoveStudent(studentId);
  const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  await deleteDoc(doc(db, "students", studentId));
  return true;
}

export async function editStudent(studentId, patch) {
  if (API_MODE) return apiStore.editStudent(studentId, patch);
  throw new Error("Student editing requires the PostgreSQL backend (API_MODE).");
}

// ---------- Holidays (class-wise; admin management + teacher status checks) ----------
export async function getHolidays(filter = {}) {
  if (API_MODE) return apiStore.getHolidays(filter);
  return [];
}
export async function addHoliday(payload) {
  if (API_MODE) return apiStore.addHoliday(payload);
  throw new Error("Holiday management requires the PostgreSQL backend (API_MODE).");
}
export async function editHoliday(id, patch) {
  if (API_MODE) return apiStore.editHoliday(id, patch);
  throw new Error("Holiday management requires the PostgreSQL backend (API_MODE).");
}
export async function removeHoliday(id) {
  if (API_MODE) return apiStore.removeHoliday(id);
  throw new Error("Holiday management requires the PostgreSQL backend (API_MODE).");
}
export async function getHolidayStatus(date, classId) {
  if (API_MODE) return apiStore.getHolidayStatus(date, classId);
  // Non-API fallback: Friday is always a full-day holiday.
  const isFri = new Date(date + "T00:00:00Z").getUTCDay() === 5;
  const s = { holiday: isFri, reason: isFri ? "friday" : null };
  return { date, classId, isFriday: isFri, morning: { ...s }, afternoon: { ...s }, fullDay: isFri };
}

// ---------- Account Management ----------
export async function createAccount(email, password, name, role) {
  if (API_MODE) return apiStore.createAccount(email, password, name, role);
  if (DEMO_MODE) return demo.demoCreateAccount(email, password, name, role);
  throw new Error("Account creation requires Firebase Admin SDK or Console.");
}

export async function deleteAccount(email) {
  if (API_MODE) return apiStore.deleteAccount(email);
  if (DEMO_MODE) return demo.demoDeleteAccount(email);
  throw new Error("Account deletion requires Firebase Admin SDK or Console.");
}

export async function getAllAccounts() {
  if (API_MODE) return apiStore.getAllAccounts();
  if (DEMO_MODE) return demo.demoGetAllAccounts();
  const s = await getDocs(collection(db, "users"));
  return s.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function changePassword(email, newPassword) {
  if (API_MODE) return apiStore.changePassword(email, newPassword);
  if (DEMO_MODE) return demo.demoChangePassword(email, newPassword);
  throw new Error("Password change requires Firebase Admin SDK or Console.");
}

// ---------- Reset ALL data (admin) ----------
export async function resetAllData(password, confirmPassword) {
  if (API_MODE) return apiStore.resetAllData(password, confirmPassword);
  if (DEMO_MODE) {
    // Demo mode: clear the local DB and rebuild the seed on next load.
    demo.resetDemo();
    return { ok: true };
  }
  throw new Error("Reset requires the PostgreSQL backend (API_MODE).");
}
