// ============================================================
//  Holiday logic — single source of truth for whether a given
//  (date, class, session) is a holiday.
//
//  Rules (in priority order):
//   1. Friday is ALWAYS a full-day HOLIDAY (both sessions). There is
//      no override — attendance can never be marked on a Friday.
//   2. Explicit holidays table rows block a session:
//        - class_id NULL  => all classes
//        - class_id set   => that class
//        - session 'full' => blocks both morning & afternoon
//
//  Holidays are CLASS-WISE only (no batch scope).
//  A "session" passed in is always 'morning' or 'afternoon'.
// ============================================================

// Is the given YYYY-MM-DD a Friday? (UTC-safe: parse as date only)
function isFriday(dateStr) {
  // getUTCDay: 0=Sun ... 5=Fri
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCDay() === 5;
}

// Fetch explicit holiday rows that could apply to this date+class+session.
async function matchingHolidays(query, { date, classId, session }) {
  const { rows } = await query(
    `SELECT id, date, class_id AS "classId", session, note
       FROM holidays
      WHERE date = $1
        AND (class_id IS NULL OR class_id = $2)
        AND (session = 'full' OR session = $3)`,
    [date, classId || null, session]
  );
  return rows;
}

// Resolve holiday status for a single session.
// Returns { holiday: bool, reason: 'friday'|'explicit'|null, session, source }
async function resolveSession(query, { date, classId = null, session }) {
  // 1) Friday is always a full-day holiday (no override).
  if (isFriday(date)) {
    return { holiday: true, reason: "friday", session, source: "friday_default" };
  }

  // 2) Explicit holidays.
  const hits = await matchingHolidays(query, { date, classId, session });
  if (hits.length) {
    return { holiday: true, reason: "explicit", session, source: hits[0] };
  }

  return { holiday: false, reason: null, session };
}

// Convenience: resolve both sessions at once for a date+class.
async function resolveDay(query, { date, classId = null }) {
  const [morning, afternoon] = await Promise.all([
    resolveSession(query, { date, classId, session: "morning" }),
    resolveSession(query, { date, classId, session: "afternoon" })
  ]);
  return {
    date,
    classId,
    isFriday: isFriday(date),
    morning,
    afternoon,
    fullDay: morning.holiday && afternoon.holiday
  };
}

module.exports = { isFriday, matchingHolidays, resolveSession, resolveDay };
