-- ============================================================
--  Jamia Islamiya Kokan — Attendance System
--  PostgreSQL schema
--
--  Data model (mirrors the original localStorage / Firestore model):
--    users        -> teacher / admin accounts (with hashed password)
--    classes      -> class / group definitions
--    assignments  -> which teacher marks which class + session
--    students     -> students belonging to a class
--    attendance   -> one row per (date, class, session); the per-student
--                    marks are stored as JSONB in `records`.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'teacher'
                  CHECK (role IN ('teacher', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session     TEXT NOT NULL CHECK (session IN ('morning', 'afternoon')),
  teacher_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (class_id, session)
);

CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  roll       INTEGER,
  batch      TEXT,                              -- optional batch/section within a class
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Ensure batch exists when upgrading an older database.
ALTER TABLE students ADD COLUMN IF NOT EXISTS batch TEXT;

CREATE TABLE IF NOT EXISTS attendance (
  id          TEXT PRIMARY KEY,                 -- {date}__{classId}__{session}
  date        DATE NOT NULL,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session     TEXT NOT NULL CHECK (session IN ('morning', 'afternoon')),
  teacher_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  records     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { studentId: { status, reason } }
  summary     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { total, present, absent }
  marked_by   TEXT,
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  late        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_students_class     ON students   (class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date    ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_attendance_class   ON attendance (class_id);

-- ============================================================
--  HOLIDAYS
--  A holiday blocks attendance for a given date + session.
--  Scope (CLASS-WISE only, no batch):
--    class_id NULL  -> applies to ALL classes that day
--    class_id set   -> applies to that class only
--  session: 'morning' | 'afternoon' | 'full' (full = both sessions)
--  There is NO time-of-day field and NO batch scope by design.
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
  id         TEXT PRIMARY KEY,                  -- generated
  date       DATE NOT NULL,
  class_id   TEXT REFERENCES classes(id) ON DELETE CASCADE,  -- NULL = all classes
  session    TEXT NOT NULL CHECK (session IN ('morning', 'afternoon', 'full')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Drop the legacy batch column if upgrading an older database
-- (holidays are now class-wise only).
ALTER TABLE holidays DROP COLUMN IF EXISTS batch;
CREATE INDEX IF NOT EXISTS idx_holidays_date  ON holidays (date);
CREATE INDEX IF NOT EXISTS idx_holidays_class ON holidays (class_id);

-- ============================================================
--  FRIDAY IS ALWAYS A FULL-DAY HOLIDAY.
--  There is no override mechanism: attendance can never be marked
--  on a Friday. The old friday_overrides table is removed.
-- ============================================================
DROP TABLE IF EXISTS friday_overrides;
