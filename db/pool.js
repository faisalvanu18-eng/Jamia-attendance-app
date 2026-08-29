// PostgreSQL connection pool.
//
// Reads DATABASE_URL from the environment (works with Neon, Supabase, Render,
// Railway, Heroku, etc.). Hosted providers require SSL; local Postgres usually
// does not. We enable SSL automatically unless PGSSL=disable is set.
require("dotenv").config();
const { Pool, types } = require("pg");

// ------------------------------------------------------------
//  Timezone-safe DATE handling.
//  By default node-postgres parses a `DATE` column into a JS Date at
//  LOCAL midnight. Converting that back with toISOString() (UTC) shifts
//  the day backwards in any positive-UTC timezone (e.g. IST +5:30),
//  causing an off-by-one day. We register a custom parser for the DATE
//  type (OID 1082) so dates are returned as plain "YYYY-MM-DD" strings,
//  exactly as stored — no timezone conversion anywhere.
// ------------------------------------------------------------
types.setTypeParser(1082, (val) => val); // 1082 = DATE

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "\n[db] DATABASE_URL is not set.\n" +
    "     Copy .env.example to .env and set DATABASE_URL to your Postgres URL.\n"
  );
}

// Enable SSL for hosted databases. Most cloud providers use self-signed certs,
// so we relax rejectUnauthorized. Set PGSSL=disable for a plain local server.
const useSSL = process.env.PGSSL !== "disable";

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000
});

pool.on("error", (err) => {
  console.error("[db] Unexpected idle client error:", err.message);
});

// Small helper so callers can do `const { rows } = await query(sql, params)`.
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
