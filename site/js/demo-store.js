// ============================================================
//  DEMO STORE  —  fully offline in-browser mock "backend".
//  Active only when DEMO_MODE = true (see firebase-config.js).
//
//  DATA MODEL
//   users        {uid}   -> { name, role: 'teacher'|'admin' }
//   classes      {id}    -> { name, category }
//   assignments  {id}    -> { classId, session:'morning'|'afternoon', teacherId }
//   students     {id}    -> { name, classId }
//   attendance   {date__classId__session} ->
//        { date, classId, session, teacherId,
//          records: { studentId: { status:'present'|'absent', reason:''|'sick'|'leave'|'other' } },
//          summary: { total, present, absent },
//          markedBy, markedAt, late }
//
//  Attendance STATUS is only Present/Absent. "On Leave" is a REASON.
// ============================================================

const DB_KEY = "jamia_demo_db_v2";
const SESSION_KEY = "jamia_demo_session";
const TODAY = (window.JAMIA_TODAY || new Date().toISOString().slice(0, 10));

export const SESSIONS = { morning: "صبح", afternoon: "دوپہر" };
export const REASONS = { sick: "بیمار", leave: "رخصت پر", other: "دیگر" };

// ---- Teachers (id -> Urdu name).  email = <id>@jamia.test , password = jamia123 ----
const TEACHERS = {
  abdullah:      "شیخ الحدیث مولانا عبد اللہ صاحب",
  zubair:        "مفتی زبیر صاحب",
  sabir:         "مفتی صابر صاحب",
  ghaffar:       "مفتی عبد الغفار صاحب",
  salman:        "مفتی سلمان صاحب",
  israr:         "مفتی اسرار صاحب",
  farooq:        "مولانا فاروق صاحب",
  mudassar:      "مفتی مدثر صاحب",
  usama:         "مفتی اسامہ صاحب",
  "usama-purkar":"مولانا اسامہ پورکر صاحب",
  bilal:         "مولانا بلال صاحب",
  rizwan:        "مولانا رضوان صاحب",
  sabit:         "مولانا ثابت صاحب",
  shabbir:       "مولانا شبیر صاحب",
  adil:          "مفتی عادل صاحب",
  asadullah:     "مفتی اسد اللہ صاحب",
  ammar:         "مولانا عمار صاحب",
  yameen:        "مولانا یامین صاحب",
  asjad:         "مفتی اسجد صاحب",
  safwan:        "مولانا صفوان صاحب",
  manzoor:       "مولانا منظور صاحب",
  ilyas:         "مفتی الیاس صاحب",
  anees:         "مولانا انیس صاحب",
  muaz:          "مولانا معاذ صاحب",
  rabian:        "مولانا ربیعان صاحب",
  atiq:          "مولانا عتیق صاحب"
};

// ---- Classes / groups (id -> {name, category}) ----
const CLASSES = {
  "daurah-hadith":        { name: "دورہ حدیث",                  category: "درسِ نظامی" },
  "arabic-sixth":         { name: "عربی ششم",                   category: "درسِ نظامی" },
  "arabic-fifth":         { name: "عربی پنجم",                  category: "درسِ نظامی" },
  "arabic-fourth-shafi":  { name: "عربی چہارم (شافعی)",         category: "درسِ نظامی" },
  "arabic-fourth-hanafi": { name: "عربی چہارم (حنفی)",          category: "درسِ نظامی" },
  "special-second-shafi": { name: "خصوصی دوم (شافعی)",          category: "درسِ نظامی" },
  "special-second-hanafi":{ name: "خصوصی دوم (حنفی)",           category: "درسِ نظامی" },
  "special-first":        { name: "خصوصی اول",                  category: "درسِ نظامی" },
  "arabic-first":         { name: "عربی اول",                   category: "درسِ نظامی" },
  "hifz-alif":            { name: "حفظ الف",                    category: "حفظ" },
  "hifz-ba":              { name: "حفظ ب",                      category: "حفظ" },
  "hifz-jeem":            { name: "حفظ ج",                      category: "حفظ" }
};

// Teacher-named groups (Madrasah + School students). Same teacher morning & afternoon.
const GROUP_TEACHERS = ["shabbir","adil","asadullah","ammar","yameen","asjad",
  "safwan","manzoor","ilyas","anees","muaz","rabian","atiq"];
GROUP_TEACHERS.forEach(t => {
  CLASSES["grp-" + t] = { name: TEACHERS[t] + " — طلبہ", category: "مدرسہ + اسکول" };
});

// ---- Assignments: [classId, session, teacherId] ----
const RAW_ASSIGN = [
  ["daurah-hadith", "morning", "abdullah"],   ["daurah-hadith", "afternoon", "zubair"],
  ["arabic-sixth", "morning", "sabir"],        ["arabic-sixth", "afternoon", "ghaffar"],
  ["arabic-fifth", "morning", "salman"],       ["arabic-fifth", "afternoon", "israr"],
  ["arabic-fourth-shafi", "morning", "israr"], ["arabic-fourth-shafi", "afternoon", "sabir"],
  ["arabic-fourth-hanafi", "morning", "ghaffar"], ["arabic-fourth-hanafi", "afternoon", "farooq"],
  ["special-second-shafi", "morning", "mudassar"],
  ["special-second-hanafi", "morning", "farooq"], ["special-second-hanafi", "afternoon", "usama"],
  ["special-first", "morning", "zubair"],      ["special-first", "afternoon", "mudassar"],
  ["arabic-first", "morning", "usama-purkar"], ["arabic-first", "afternoon", "usama"],
  ["hifz-alif", "morning", "bilal"],           ["hifz-alif", "afternoon", "bilal"],
  ["hifz-ba", "morning", "rizwan"],            ["hifz-ba", "afternoon", "rizwan"],
  ["hifz-jeem", "morning", "sabit"],           ["hifz-jeem", "afternoon", "sabit"]
];
// teacher-named groups: both sessions, same teacher
GROUP_TEACHERS.forEach(t => {
  RAW_ASSIGN.push(["grp-" + t, "morning", t], ["grp-" + t, "afternoon", t]);
});

// ---- Sample students (real list to be supplied later) ----
function mkStudents(classId, names) {
  const out = {};
  names.forEach((name, i) => { out[`${classId}-${i + 1}`] = { name, classId }; });
  return out;
}
const SAMPLE_STUDENTS = {
  ...mkStudents("arabic-sixth", ["محمد احمد","عبد اللہ","محمد یوسف","عادل خان","متقان علی","سعد فاروق","محمد حارث","فینان احمد"]),
  ...mkStudents("arabic-fifth", ["زبیر عالم","انس شیخ","ابراہیم خان","یعقوب ملک","سلیمان قریشی","داؤد انصاری"]),
  ...mkStudents("arabic-fourth-shafi", ["زید انصاری","بلال شیخ","عمار خان","طلحہ قریشی","ہارون ملک"]),
  ...mkStudents("daurah-hadith", ["ابوبکر","عمر فاروق","عثمان غنی","علی حیدر"]),
  ...mkStudents("hifz-ba", ["معاذ بن جبل","ابی بن کعب","زید بن ثابت","سعد بن معاذ","انس بن مالک"]),
  ...mkStudents("grp-shabbir", ["اسامہ","حمزہ","عکاشہ","خالد"])
};

function buildSeed() {
  const users = { uadmin: { name: "حضرت مولانا اسحاق گھارے صاحب", role: "admin" } };
  const accounts = { "admin@jamia.test": { password: "admin123", uid: "uadmin" } };
  Object.entries(TEACHERS).forEach(([id, name]) => {
    const uid = "u_" + id;
    users[uid] = { name, role: "teacher" };
    accounts[`${id}@jamia.test`] = { password: "jamia123", uid };
  });

  const assignments = {};
  RAW_ASSIGN.forEach(([classId, session, tId], i) => {
    assignments[`a${i}`] = { classId, session, teacherId: "u_" + tId };
  });

  // Pre-seed a little of TODAY's attendance so the admin dashboard is meaningful.
  const attendance = {};
  const seedAtt = (classId, session, teacherId, absentMap) => {
    const recs = {};
    Object.entries(SAMPLE_STUDENTS).forEach(([sid, s]) => {
      if (s.classId === classId) {
        recs[sid] = absentMap[sid]
          ? { status: "absent", reason: absentMap[sid] }
          : { status: "present", reason: "" };
      }
    });
    const total = Object.keys(recs).length;
    const absent = Object.values(recs).filter(r => r.status === "absent").length;
    attendance[`${TODAY}__${classId}__${session}`] = {
      date: TODAY, classId, session, teacherId,
      records: recs,
      summary: { total, present: total - absent, absent },
      markedBy: teacherId, markedAt: new Date().toISOString(), late: false
    };
  };
  seedAtt("arabic-sixth", "morning", "u_sabir", { "arabic-sixth-3": "sick", "arabic-sixth-5": "leave" });
  seedAtt("daurah-hadith", "morning", "u_abdullah", { "daurah-hadith-2": "other" });

  return { accounts, users, classes: CLASSES, assignments, students: SAMPLE_STUDENTS, attendance };
}

function load() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) { const s = buildSeed(); localStorage.setItem(DB_KEY, JSON.stringify(s)); return s; }
  return JSON.parse(raw);
}
function save(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
export function resetDemo() { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); }

// ---- Auth ----
export function demoLogin(email, password) {
  const db = load();
  const acct = db.accounts[String(email).trim().toLowerCase()];
  if (!acct || acct.password !== password) {
    const err = new Error("invalid"); err.code = "auth/invalid-credential"; throw err;
  }
  localStorage.setItem(SESSION_KEY, acct.uid);
  return { uid: acct.uid, email, ...db.users[acct.uid] };
}
export function demoCurrentUser() {
  const uid = localStorage.getItem(SESSION_KEY);
  if (!uid) return null;
  const u = load().users[uid];
  return u ? { uid, ...u } : null;
}
export function demoLogout() { localStorage.removeItem(SESSION_KEY); }

// ---- Reads ----
export function demoGetUserProfile(uid) {
  const u = load().users[uid]; return u ? { id: uid, ...u } : null;
}
export function demoGetClass(id) {
  const c = load().classes[id]; return c ? { id, ...c } : null;
}
export function demoGetAllClasses() {
  const db = load();
  return Object.entries(db.classes).map(([id, c]) => ({ id, ...c }));
}
export function demoGetAllAssignments() {
  const db = load();
  return Object.entries(db.assignments).map(([id, a]) => ({
    id, ...a,
    className: db.classes[a.classId] ? db.classes[a.classId].name : a.classId,
    teacherName: db.users[a.teacherId] ? db.users[a.teacherId].name : a.teacherId
  }));
}
export function demoGetAssignmentsForTeacher(teacherId) {
  return demoGetAllAssignments().filter(a => a.teacherId === teacherId);
}
export function demoGetAssignment(classId, session) {
  return demoGetAllAssignments().find(a => a.classId === classId && a.session === session) || null;
}
export function demoCreateAssignment(classId, session, teacherId) {
  const db = load();
  // Enforce one teacher per class+session: reuse/replace an existing row.
  let existingId = Object.keys(db.assignments).find(
    id => db.assignments[id].classId === classId && db.assignments[id].session === session
  );
  const id = existingId || (classId + "__" + session);
  db.assignments[id] = { classId, session, teacherId };
  save(db);
  return { id, classId, session, teacherId };
}
export function demoRemoveAssignment(assignmentId) {
  const db = load();
  if (db.assignments[assignmentId]) { delete db.assignments[assignmentId]; save(db); return true; }
  return false;
}
export function demoGetStudentsByClass(classId) {
  const db = load();
  return Object.entries(db.students)
    .filter(([, s]) => s.classId === classId)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => a.name.localeCompare(b.name, "ur"));
}
export function demoCountAllStudents() { return Object.keys(load().students).length; }

export function demoSearchStudents(qStr) {
  const db = load();
  const q = String(qStr || "").trim();
  return Object.entries(db.students)
    .filter(([, s]) => !q || s.name.includes(q))
    .map(([id, s]) => ({
      id, ...s,
      className: db.classes[s.classId] ? db.classes[s.classId].name : s.classId
    }));
}

// ---- Attendance ----
export function demoSaveAttendance({ date, classId, session, records, markedBy }) {
  const db = load();
  const absent = Object.values(records).filter(r => r.status === "absent").length;
  const total = Object.keys(records).length;
  const payload = {
    date, classId, session, teacherId: markedBy || null, records,
    summary: { total, present: total - absent, absent },
    markedBy: markedBy || null,
    markedAt: new Date().toISOString(),
    late: date < TODAY
  };
  db.attendance[`${date}__${classId}__${session}`] = payload;
  save(db);
  return payload;
}
export function demoGetAttendance(date, classId, session) {
  const a = load().attendance[`${date}__${classId}__${session}`];
  return a ? { id: `${date}__${classId}__${session}`, ...a } : null;
}
export function demoGetAttendanceByDate(date) {
  const db = load();
  return Object.values(db.attendance).filter(a => a.date === date);
}
export function demoGetAllAttendance() {
  return Object.values(load().attendance);
}

// Today's pending responsibilities (no attendance doc yet), optionally past-deadline only.
export function demoGetPending(date, onlyPastDeadline = true) {
  const db = load();
  const now = new Date();
  const past = (session) => {
    if (date !== TODAY) return true; // past dates are always "due"
    const h = now.getHours(), m = now.getMinutes();
    if (session === "morning") return h > 8 || (h === 8 && m >= 30);
    return h > 15 || (h === 15 && m >= 30);
  };
  return demoGetAllAssignments().filter(a => {
    const done = db.attendance[`${date}__${a.classId}__${a.session}`];
    if (done) return false;
    return onlyPastDeadline ? past(a.session) : true;
  });
}

// Absent students for a date (with class + session + reason).
export function demoGetAbsentByDate(date) {
  const db = load();
  const out = [];
  demoGetAttendanceByDate(date).forEach(a => {
    Object.entries(a.records || {}).forEach(([sid, r]) => {
      if (r.status === "absent") {
        const s = db.students[sid];
        out.push({
          studentId: sid,
          name: s ? s.name : sid,
          className: db.classes[a.classId] ? db.classes[a.classId].name : a.classId,
          session: a.session,
          reason: r.reason || "other"
        });
      }
    });
  });
  return out;
}

// One student's full history within [start,end] (inclusive).
export function demoGetStudentHistory(studentId, start, end) {
  const db = load();
  const byDate = {};
  Object.values(db.attendance).forEach(a => {
    if (!a.records[studentId]) return;
    if (start && a.date < start) return;
    if (end && a.date > end) return;
    byDate[a.date] = byDate[a.date] || { date: a.date, morning: null, afternoon: null };
    byDate[a.date][a.session] = a.records[studentId];
  });
  const rows = Object.values(byDate).sort((x, y) => x.date.localeCompare(y.date));
  const totals = { present: 0, absent: 0, sick: 0, leave: 0, other: 0, sessions: 0 };
  rows.forEach(r => {
    ["morning", "afternoon"].forEach(s => {
      const rec = r[s];
      if (!rec) return;
      totals.sessions++;
      if (rec.status === "present") totals.present++;
      else { totals.absent++; totals[rec.reason || "other"]++; }
    });
  });
  totals.percentage = totals.sessions ? Math.round((totals.present / totals.sessions) * 100) : 0;
  return { rows, totals };
}

// Monthly report: per-student percentage for a given YYYY-MM (optionally one class).
export function demoGetMonthlyReport(month, classId = null) {
  const db = load();
  const students = Object.entries(db.students)
    .filter(([, s]) => !classId || s.classId === classId)
    .map(([id, s]) => ({ id, ...s }));
  return students.map(s => {
    const h = demoGetStudentHistory(s.id, month + "-01", month + "-31");
    return {
      id: s.id, name: s.name,
      className: db.classes[s.classId] ? db.classes[s.classId].name : s.classId,
      present: h.totals.present, absent: h.totals.absent,
      sessions: h.totals.sessions, percentage: h.totals.percentage
    };
  });
}


// ---- Student Management (Add / Remove) ----
export function demoAddStudent(classId, name) {
  const db = load();
  // Generate unique ID
  const existing = Object.keys(db.students).filter(k => k.startsWith(classId + "-"));
  const maxNum = existing.reduce((max, k) => {
    const num = parseInt(k.split("-").pop(), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  const newId = `${classId}-${maxNum + 1}`;
  db.students[newId] = { name, classId };
  save(db);
  return { id: newId, name, classId };
}

export function demoRemoveStudent(studentId) {
  const db = load();
  if (db.students[studentId]) {
    delete db.students[studentId];
    // Also remove from any attendance records
    Object.keys(db.attendance).forEach(key => {
      if (db.attendance[key].records && db.attendance[key].records[studentId]) {
        delete db.attendance[key].records[studentId];
        // Update summary
        const recs = db.attendance[key].records;
        const total = Object.keys(recs).length;
        const absent = Object.values(recs).filter(r => r.status === "absent").length;
        db.attendance[key].summary = { total, present: total - absent, absent };
      }
    });
    save(db);
    return true;
  }
  return false;
}


// ---- Account Management (Create / Delete) ----
export function demoCreateAccount(email, password, name, role) {
  const db = load();
  email = email.trim().toLowerCase();
  if (db.accounts[email]) {
    const err = new Error("Account already exists"); err.code = "auth/email-already-in-use"; throw err;
  }
  // Generate uid
  const uid = "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  db.accounts[email] = { password, uid };
  db.users[uid] = { name, role: role || "teacher" };
  save(db);
  return { uid, email, name, role: role || "teacher" };
}

export function demoDeleteAccount(email) {
  const db = load();
  email = email.trim().toLowerCase();
  const acct = db.accounts[email];
  if (!acct) return false;
  delete db.accounts[email];
  delete db.users[acct.uid];
  // Remove assignments for this user
  Object.keys(db.assignments).forEach(k => {
    if (db.assignments[k].teacherId === acct.uid) delete db.assignments[k];
  });
  save(db);
  return true;
}

export function demoGetAllAccounts() {
  const db = load();
  return Object.entries(db.accounts).map(([email, acct]) => ({
    email,
    uid: acct.uid,
    name: db.users[acct.uid] ? db.users[acct.uid].name : "—",
    role: db.users[acct.uid] ? db.users[acct.uid].role : "teacher"
  }));
}

export function demoChangePassword(email, newPassword) {
  const db = load();
  email = email.trim().toLowerCase();
  if (!db.accounts[email]) return false;
  db.accounts[email].password = newPassword;
  save(db);
  return true;
}
