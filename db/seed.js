// ============================================================
//  Seed the Postgres database with teachers, classes,
//  assignments and sample students. Idempotent (upserts).
//
//  Usage: npm run seed   (run `npm run migrate` first)
// ============================================================
require("dotenv").config();
const { pool } = require("./pool");
const { seedDatabase } = require("./seed-data");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stats = await seedDatabase(client);
    await client.query("COMMIT");
    console.log(`[seed] done. ${stats.teachers} teachers, ${stats.classes} classes, ` +
      `${stats.assignments} assignments, ${stats.students} students.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err.message);
  process.exit(1);
});
