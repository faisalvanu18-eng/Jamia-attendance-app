// ============================================================
//  Jamia Islamiya Kokan — Attendance API server
//  ------------------------------------------------------------
//  - Serves the static site in /site
//  - Exposes a REST API backed by PostgreSQL
//  - Auth: email/password -> JWT (bcrypt-hashed passwords)
//
//  Run:  npm run setup   (create schema + seed data, once)
//        npm start
// ============================================================
require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { pool, query } = require("./db/pool");
const { seedDatabase } = require("./db/seed-data");
const holidayLogic = require("./db/holidays");

const app = express();
const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
if (IS_PRODUCTION && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be set to a strong secret (at least 32 characters) in production.");
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || "local-development-secret-change-me";
const SITE_DIR = path.join(__dirname, "site");

const allowedOrigins = String(process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "").split(",").map(v => v.trim()).filter(Boolean);
if (allowedOrigins.length) {
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: false
  }));
}
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (IS_PRODUCTION) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(express.json({ limit: "1mb" }));

// ---------- helpers ----------
function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, name: user.name },
    EFFECTIVE_JWT_SECRET,
    { expiresIn: "12h" }
  );
}

// Authentication middleware: verifies the Bearer token.
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no_token" });
  try {
    req.user = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

// Require a specific role (e.g. admin-only endpoints).
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

// Wrap async handlers so thrown errors become 500s instead of crashing.
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("[api]", err);
    const payload = { error: "server_error", message: "Something went wrong. Please try again." };
    if (!IS_PRODUCTION) payload.detail = err.message;
    res.status(500).json(payload);
  });

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";
const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
const attendanceId = (date, classId, session) => `${date}__${classId}__${session}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if (!DATE_RE.test(String(value || ""))) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function isPlainObject(value) { return value && typeof value === "object" && !Array.isArray(value); }

// Recompute summary from records.
function summarize(records) {
  const total = Object.keys(records).length;
  const absent = Object.values(records).filter((r) => r.status === "absent").length;
  return { total, present: total - absent, absent };
}

// ============================================================
//  AUTH
// ============================================================
app.post("/api/login", wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  res.json({
    token: signToken(user),
    user: { uid: user.id, email: user.email, name: user.name, role: user.role }
  });
}));

// Return the current user's profile (from the token).
app.get("/api/me", auth, wrap(async (req, res) => {
  const { rows } = await query("SELECT id, email, name, role FROM users WHERE id = $1", [req.user.uid]);
  const u = rows[0];
  if (!u) return res.status(404).json({ error: "not_found" });
  res.json({ uid: u.id, email: u.email, name: u.name, role: u.role });
}));

// ============================================================
//  CLASSES
// ============================================================
app.get("/api/classes", auth, wrap(async (req, res) => {
  const { rows } = await query("SELECT id, name, category FROM classes ORDER BY name");
  res.json(rows);
}));

app.get("/api/classes/:id", auth, wrap(async (req, res) => {
  const { rows } = await query("SELECT id, name, category FROM classes WHERE id = $1", [req.params.id]);
  res.json(rows[0] || null);
}));

// ============================================================
//  ASSIGNMENTS (teacher <-> class + session)
// ============================================================
app.get("/api/assignments", auth, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.class_id AS "classId", a.session, a.teacher_id AS "teacherId",
            c.name AS "className", u.name AS "teacherName"
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       JOIN users u   ON u.id = a.teacher_id
      ORDER BY c.name`
  );
  const teacherId = req.query.teacherId;
  res.json(teacherId ? rows.filter((a) => a.teacherId === teacherId) : rows);
}));

// Assign a class+session to a teacher (admin only).
// Because (class_id, session) is unique, assigning an already-taken
// class+session reassigns it to the new teacher.
app.post("/api/assignments", auth, requireRole("admin"), wrap(async (req, res) => {
  const { classId, session, teacherId } = req.body;
  if (!classId || !session || !teacherId) {
    return res.status(400).json({ error: "missing_fields" });
  }
  if (session !== "morning" && session !== "afternoon") {
    return res.status(400).json({ error: "bad_session" });
  }
  // Validate the class and teacher exist.
  const c = await query("SELECT 1 FROM classes WHERE id = $1", [classId]);
  if (!c.rowCount) return res.status(404).json({ error: "class_not_found" });
  const t = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'teacher'", [teacherId]);
  if (!t.rowCount) return res.status(404).json({ error: "teacher_not_found" });

  // Stable id per class+session so reassigning updates the same row.
  const id = `${classId}__${session}`;
  await query(
    `INSERT INTO assignments (id, class_id, session, teacher_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (class_id, session) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
    [id, classId, session, teacherId]
  );
  res.status(201).json({ id, classId, session, teacherId });
}));

// Remove an assignment (admin only).
app.delete("/api/assignments/:id", auth, requireRole("admin"), wrap(async (req, res) => {
  await query("DELETE FROM assignments WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
//  STUDENTS
//  Reads: any authenticated user (teachers see their class lists).
//  Writes (create/edit/delete): ADMIN ONLY.
// ============================================================
app.get("/api/students", auth, wrap(async (req, res) => {
  const { classId, q, batch } = req.query;
  if (classId) {
    const params = [classId];
    let sql = 'SELECT id, name, class_id AS "classId", roll, batch FROM students WHERE class_id = $1';
    if (batch !== undefined && batch !== "") { params.push(batch); sql += " AND batch = $2"; }
    sql += " ORDER BY roll, name";
    const { rows } = await query(sql, params);
    return res.json(rows);
  }
  // search / all (with class name)
  const { rows } = await query(
    `SELECT s.id, s.name, s.class_id AS "classId", s.roll, s.batch, c.name AS "className"
       FROM students s JOIN classes c ON c.id = s.class_id
      ORDER BY c.name, s.roll, s.name`
  );
  const term = String(q || "").trim();
  let out = term ? rows.filter((s) => (s.name || "").includes(term)) : rows;
  if (batch !== undefined && batch !== "") out = out.filter((s) => (s.batch || "") === batch);
  res.json(out);
}));

app.get("/api/students/count", auth, wrap(async (req, res) => {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM students");
  res.json({ count: rows[0].n });
}));

// List distinct batches (optionally within a class) for filter dropdowns.
app.get("/api/batches", auth, wrap(async (req, res) => {
  const { classId } = req.query;
  const params = [];
  let sql = "SELECT DISTINCT batch FROM students WHERE batch IS NOT NULL AND batch <> ''";
  if (classId) { params.push(classId); sql += " AND class_id = $1"; }
  sql += " ORDER BY batch";
  const { rows } = await query(sql, params);
  res.json(rows.map((r) => r.batch));
}));

app.post("/api/students", auth, requireRole("admin"), wrap(async (req, res) => {
  const { classId, name } = req.body;
  const batch = req.body.batch ? String(req.body.batch).trim() : null;
  if (!classId || !name) return res.status(400).json({ error: "missing_fields" });
  const c = await query("SELECT 1 FROM classes WHERE id = $1", [classId]);
  if (!c.rowCount) return res.status(404).json({ error: "class_not_found" });
  const { rows: mx } = await query(
    "SELECT COALESCE(MAX(roll), 0) AS m FROM students WHERE class_id = $1",
    [classId]
  );
  const roll = mx[0].m + 1;
  const id = `${classId}-${roll}-${Date.now().toString(36)}`;
  await query(
    "INSERT INTO students (id, name, class_id, roll, batch) VALUES ($1,$2,$3,$4,$5)",
    [id, name, classId, roll, batch]
  );
  res.status(201).json({ id, name, classId, roll, batch });
}));

// Edit a student (name, class, batch). Admin only.
app.put("/api/students/:id", auth, requireRole("admin"), wrap(async (req, res) => {
  const { id } = req.params;
  const existing = await query('SELECT id, name, class_id AS "classId", roll, batch FROM students WHERE id = $1', [id]);
  if (!existing.rowCount) return res.status(404).json({ error: "not_found" });
  const cur = existing.rows[0];
  const name = req.body.name != null ? String(req.body.name).trim() : cur.name;
  const classId = req.body.classId || cur.classId;
  const batch = req.body.batch !== undefined ? (req.body.batch ? String(req.body.batch).trim() : null) : cur.batch;
  if (!name) return res.status(400).json({ error: "missing_fields" });
  const c = await query("SELECT 1 FROM classes WHERE id = $1", [classId]);
  if (!c.rowCount) return res.status(404).json({ error: "class_not_found" });
  await query(
    "UPDATE students SET name = $1, class_id = $2, batch = $3 WHERE id = $4",
    [name, classId, batch, id]
  );
  res.json({ id, name, classId, roll: cur.roll, batch });
}));

app.delete("/api/students/:id", auth, requireRole("admin"), wrap(async (req, res) => {
  await query("DELETE FROM students WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
//  ATTENDANCE
// ============================================================
app.get("/api/attendance", auth, wrap(async (req, res) => {
  const { date, classId, session } = req.query;
  if (date && classId && session) {
    const { rows } = await query("SELECT * FROM attendance WHERE id = $1", [
      attendanceId(date, classId, session)
    ]);
    return res.json(rows[0] ? shapeAttendance(rows[0]) : null);
  }
  if (date) {
    const { rows } = await query("SELECT * FROM attendance WHERE date = $1", [date]);
    return res.json(rows.map(shapeAttendance));
  }
  const { rows } = await query("SELECT * FROM attendance");
  res.json(rows.map(shapeAttendance));
}));

app.post("/api/attendance", auth, wrap(async (req, res) => {
  const { date, classId, session, records } = req.body;
  if (!date || !classId || !session || !isPlainObject(records)) {
    return res.status(400).json({ error: "missing_fields", message: "Required attendance data is missing." });
  }
  if (!validDate(date)) return res.status(400).json({ error: "bad_date", message: "Invalid date." });
  if (session !== "morning" && session !== "afternoon") {
    return res.status(400).json({ error: "bad_session", message: "Invalid session." });
  }

  const cls = await query("SELECT 1 FROM classes WHERE id = $1", [classId]);
  if (!cls.rowCount) return res.status(404).json({ error: "class_not_found" });

  // Teachers may only write attendance for their own assigned class/session.
  if (req.user.role !== "admin") {
    const assignment = await query(
      "SELECT 1 FROM assignments WHERE class_id = $1 AND session = $2 AND teacher_id = $3",
      [classId, session, req.user.uid]
    );
    if (!assignment.rowCount) return res.status(403).json({ error: "assignment_required", message: "You are not assigned to this class/session." });
  }

  const classLevel = await holidayLogic.resolveSession(query, { date, classId, session });
  if (classLevel.holiday) {
    const msg = classLevel.reason === "friday"
      ? "Attendance cannot be marked because Friday is a holiday."
      : "Attendance cannot be marked because this session is a holiday.";
    return res.status(409).json({ error: "holiday_blocked", reason: classLevel.reason, message: msg });
  }

  // Validate every submitted student belongs to this class and every status is valid.
  const studentIds = Object.keys(records);
  const validStudents = await query("SELECT id FROM students WHERE class_id = $1", [classId]);
  const allowed = new Set(validStudents.rows.map(r => r.id));
  for (const [studentId, record] of Object.entries(records)) {
    if (!allowed.has(studentId) || !isPlainObject(record) || !["present", "absent"].includes(record.status)) {
      return res.status(400).json({ error: "invalid_records", message: "Attendance contains invalid student data." });
    }
    if (record.status === "absent" && record.reason && !["sick", "leave", "other"].includes(record.reason)) {
      return res.status(400).json({ error: "invalid_reason", message: "Attendance contains an invalid absence reason." });
    }
  }
  if (!studentIds.length) return res.status(400).json({ error: "empty_records", message: "No students were submitted." });

  const summary = summarize(records);
  const id = attendanceId(date, classId, session);
  const late = date < TODAY();
  const marker = req.user.uid;
  await query(
    `INSERT INTO attendance (id, date, class_id, session, teacher_id, records, summary, marked_by, marked_at, late)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9)
     ON CONFLICT (id) DO UPDATE SET
       records = EXCLUDED.records, summary = EXCLUDED.summary, teacher_id = EXCLUDED.teacher_id,
       marked_by = EXCLUDED.marked_by, marked_at = now(), late = EXCLUDED.late`,
    [id, date, classId, session, marker, records, summary, marker, late]
  );
  res.json({ id, date, classId, session, records, summary, markedBy: marker, late });
}));

function shapeAttendance(row) {
  return {
    id: row.id,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
    classId: row.class_id,
    session: row.session,
    teacherId: row.teacher_id,
    records: row.records || {},
    summary: row.summary || {},
    markedBy: row.marked_by,
    markedAt: row.marked_at,
    late: row.late
  };
}

// ============================================================
//  ACCOUNT MANAGEMENT (admin only)
// ============================================================
app.get("/api/accounts", auth, requireRole("admin"), wrap(async (req, res) => {
  const { rows } = await query("SELECT id AS uid, email, name, role FROM users ORDER BY name");
  res.json(rows);
}));

app.post("/api/accounts", auth, requireRole("admin"), wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const { password, name, role } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "missing_fields" });
  const exists = await query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (exists.rowCount) return res.status(409).json({ error: "email_exists" });
  const id = "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const hash = bcrypt.hashSync(password, 10);
  await query(
    "INSERT INTO users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,$5)",
    [id, email, hash, name, role === "admin" ? "admin" : "teacher"]
  );
  res.status(201).json({ uid: id, email, name, role: role || "teacher" });
}));

app.delete("/api/accounts/:email", auth, requireRole("admin"), wrap(async (req, res) => {
  const email = String(req.params.email || "").trim().toLowerCase();
  await query("DELETE FROM users WHERE email = $1", [email]);
  res.json({ ok: true });
}));

app.post("/api/accounts/password", auth, requireRole("admin"), wrap(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const { newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ error: "missing_fields" });
  const hash = bcrypt.hashSync(newPassword, 10);
  const r = await query("UPDATE users SET password_hash = $1 WHERE email = $2", [hash, email]);
  res.json({ ok: r.rowCount > 0 });
}));

// ============================================================
//  RESET ALL DATA (admin only)
//  Wipes all attendance + students, then restores the base data
//  (teachers, classes, assignments, sample students) to a fresh
//  seeded state. Requires the admin to re-enter their password.
// ============================================================
app.post("/api/reset", auth, requireRole("admin"), wrap(async (req, res) => {
  const { password, confirmPassword } = req.body;
  if (!password || !confirmPassword) {
    return res.status(400).json({ error: "missing_password" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "password_mismatch" });
  }

  // Re-verify the CURRENT admin's password.
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.uid]);
  const me = rows[0];
  if (!me || !bcrypt.compareSync(password, me.password_hash)) {
    return res.status(401).json({ error: "wrong_password" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Clear everything. TRUNCATE ... CASCADE also clears dependent rows.
    await client.query("TRUNCATE attendance, assignments, students, holidays, classes, users CASCADE");
    // Restore the base seed (admin, teachers, classes, assignments, sample students).
    const stats = await seedDatabase(client);
    await client.query("COMMIT");
    res.json({ ok: true, restored: stats });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================
//  HOLIDAYS  (reads: any authed user; writes: admin only)
//  Holidays are CLASS-WISE only. Creation supports MULTIPLE classes
//  and a DATE RANGE (fromDate..toDate) in one request.
// ============================================================
app.get("/api/holidays", auth, wrap(async (req, res) => {
  const { date, classId } = req.query;
  const params = [];
  const where = [];
  if (date) { params.push(date); where.push(`date = $${params.length}`); }
  if (classId) { params.push(classId); where.push(`class_id = $${params.length}`); }
  const sql =
    `SELECT h.id, h.date, h.class_id AS "classId", h.session, h.note,
            c.name AS "className"
       FROM holidays h LEFT JOIN classes c ON c.id = h.class_id` +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY h.date DESC, c.name";
  const { rows } = await query(sql, params);
  res.json(rows.map((h) => ({
    ...h,
    date: h.date instanceof Date ? h.date.toISOString().slice(0, 10) : h.date
  })));
}));

// List each date between two YYYY-MM-DD strings (inclusive).
function datesInRange(fromDate, toDate) {
  const out = [];
  const start = new Date(fromDate + "T00:00:00Z");
  const end = new Date((toDate || fromDate) + "T00:00:00Z");
  if (isNaN(start) || isNaN(end) || end < start) return out;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

app.post("/api/holidays", auth, requireRole("admin"), wrap(async (req, res) => {
  const { session } = req.body;
  const note = req.body.note ? String(req.body.note).trim() : null;
  // Accept multiple classes (classIds[]) or a single classId; null/empty = all classes.
  let classIds = req.body.classIds;
  if (!Array.isArray(classIds) || !classIds.length) {
    classIds = [req.body.classId || null];
  }
  // Date range: fromDate..toDate, or a single date.
  const fromDate = req.body.fromDate || req.body.date;
  const toDate = req.body.toDate || req.body.fromDate || req.body.date;
  if (!fromDate || !session) return res.status(400).json({ error: "missing_fields" });
  if (!["morning", "afternoon", "full"].includes(session)) return res.status(400).json({ error: "bad_session" });

  const dates = datesInRange(fromDate, toDate);
  if (!dates.length) return res.status(400).json({ error: "bad_date_range" });

  // Validate any explicit classes.
  for (const cid of classIds) {
    if (cid) {
      const c = await query("SELECT 1 FROM classes WHERE id = $1", [cid]);
      if (!c.rowCount) return res.status(404).json({ error: "class_not_found", classId: cid });
    }
  }

  const created = [];
  for (const cid of classIds) {
    for (const d of dates) {
      const id = "hol_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      await query(
        "INSERT INTO holidays (id, date, class_id, session, note) VALUES ($1,$2,$3,$4,$5)",
        [id, d, cid, session, note]
      );
      created.push({ id, date: d, classId: cid, session, note });
    }
  }
  res.status(201).json({ created: created.length, holidays: created });
}));

app.put("/api/holidays/:id", auth, requireRole("admin"), wrap(async (req, res) => {
  const { id } = req.params;
  const ex = await query('SELECT id, date, class_id AS "classId", session, note FROM holidays WHERE id = $1', [id]);
  if (!ex.rowCount) return res.status(404).json({ error: "not_found" });
  const cur = ex.rows[0];
  const date = req.body.date || (cur.date instanceof Date ? cur.date.toISOString().slice(0, 10) : cur.date);
  const session = req.body.session || cur.session;
  const classId = req.body.classId !== undefined ? (req.body.classId || null) : cur.classId;
  const note = req.body.note !== undefined ? (req.body.note ? String(req.body.note).trim() : null) : cur.note;
  if (!["morning", "afternoon", "full"].includes(session)) return res.status(400).json({ error: "bad_session" });
  if (classId) {
    const c = await query("SELECT 1 FROM classes WHERE id = $1", [classId]);
    if (!c.rowCount) return res.status(404).json({ error: "class_not_found" });
  }
  await query(
    "UPDATE holidays SET date = $1, class_id = $2, session = $3, note = $4 WHERE id = $5",
    [date, classId, session, note, id]
  );
  res.json({ id, date, classId, session, note });
}));

app.delete("/api/holidays/:id", auth, requireRole("admin"), wrap(async (req, res) => {
  await query("DELETE FROM holidays WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
//  HOLIDAY STATUS  (any authed user — used by teacher pages)
//  ?date=YYYY-MM-DD&classId=..
//  -> { date, isFriday, morning:{holiday,reason}, afternoon:{...}, fullDay }
// ============================================================
app.get("/api/holiday-status", auth, wrap(async (req, res) => {
  const { date } = req.query;
  const classId = req.query.classId || null;
  if (!date) return res.status(400).json({ error: "missing_date" });
  const day = await holidayLogic.resolveDay(query, { date, classId });
  res.json(day);
}));

// ---------- health check ----------
// LIVENESS: must NOT depend on the database. Render's health check only needs
// to confirm the web process is up and serving HTTP. If this touched the DB and
// the DB was briefly slow/unreachable at boot, the health check would hang and
// the deploy would "Time Out" even though the server is running fine.
app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// READINESS: a deeper check that also verifies the database is reachable.
// Use this for diagnostics, not as the Render health check path.
app.get("/api/health/db", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch (err) {
    console.error("[health] db check failed:", err.message);
    res.status(503).json({ ok: false, db: "down", message: err.message });
  }
});

// ============================================================
//  STATIC SITE
// ============================================================
app.use(express.static(SITE_DIR, { extensions: ["html"] }));

// Fallback to index.html for unknown non-API GET routes.
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
  res.sendFile(path.join(SITE_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Jamia attendance API + site listening on port ${PORT}`);
});
