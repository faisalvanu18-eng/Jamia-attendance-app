// ============================================================
//  Shared seed data + seeding logic.
//  Used by:
//    - db/seed.js         (CLI: npm run seed)
//    - server.js          (admin "reset all data" endpoint)
//
//  The seed creates ONLY:
//    - the configured admin account
//    - the class / group definitions
//  It does NOT create any sample teacher accounts, assignments or
//  students. The admin creates real teacher accounts, assigns them
//  to classes, and adds students from the admin pages.
// ============================================================
const bcrypt = require("bcryptjs");

// ---- Classes / groups ----
const CLASSES = {
  "daurah-hadith":         { name: "دورہ حدیث",           category: "درسِ نظامی" },
  "arabic-sixth":          { name: "عربی ششم",            category: "درسِ نظامی" },
  "arabic-fifth":          { name: "عربی پنجم",           category: "درسِ نظامی" },
  "arabic-fourth-shafi":   { name: "عربی چہارم (شافعی)",  category: "درسِ نظامی" },
  "arabic-fourth-hanafi":  { name: "عربی چہارم (حنفی)",   category: "درسِ نظامی" },
  "special-second-shafi":  { name: "خصوصی دوم (شافعی)",   category: "درسِ نظامی" },
  "special-second-hanafi": { name: "خصوصی دوم (حنفی)",    category: "درسِ نظامی" },
  "special-first":         { name: "خصوصی اول",           category: "درسِ نظامی" },
  "arabic-first":          { name: "عربی اول",            category: "درسِ نظامی" },
  "hifz-alif":             { name: "حفظ الف",             category: "حفظ" },
  "hifz-ba":               { name: "حفظ ب",               category: "حفظ" },
  "hifz-jeem":             { name: "حفظ ج",               category: "حفظ" }
};

// ------------------------------------------------------------
//  seedDatabase(client)
//  Upserts ONLY the admin account and the class definitions.
//  Runs inside the caller's transaction if given a client; the
//  caller manages BEGIN/COMMIT.
// ------------------------------------------------------------
async function seedDatabase(client) {
  const q = (text, params) => client.query(text, params);

  // Admin credentials are configurable. Production must not fall back to a known password.
  const adminEmail = String(process.env.SEED_ADMIN_EMAIL || (process.env.NODE_ENV === "production" ? "" : "admin@jamia.test")).trim().toLowerCase();
  const adminPassword = String(process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "admin123"));
  const adminName = String(process.env.SEED_ADMIN_NAME || "حضرت مولانا اسحاق گھارے صاحب").trim();
  if (!adminEmail || !adminPassword || adminPassword.length < 10) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (10+ characters) are required when seeding production.");
  }
  const adminHash = bcrypt.hashSync(adminPassword, 12);
  await q(
    `INSERT INTO users (id, email, password_hash, name, role)
     VALUES ('uadmin', $1, $2, $3, 'admin')
     ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, password_hash=EXCLUDED.password_hash, name=EXCLUDED.name, role=EXCLUDED.role`,
    [adminEmail, adminHash, adminName]
  );

  // Classes
  for (const [id, c] of Object.entries(CLASSES)) {
    await q(
      `INSERT INTO classes (id, name, category) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category`,
      [id, c.name, c.category]
    );
  }

  return {
    teachers: 0,
    classes: Object.keys(CLASSES).length,
    assignments: 0,
    students: 0
  };
}

module.exports = { CLASSES, seedDatabase };
