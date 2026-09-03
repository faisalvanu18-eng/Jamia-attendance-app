// ============================================================
//  db/import-students.js
//  ------------------------------------------------------------
//  Bulk-imports the class-wise student lists supplied by the
//  madrasah. Mirrors what the website's "add student" screen does
//  (auto roll numbers per class), but for hundreds of students at
//  once.
//
//  What it does, inside ONE transaction:
//    1. Upserts every class/group used below (the 12 original
//       classes are already seeded; the teacher-wise Hifz groups
//       are NEW and are created here, because the app has no
//       "create class" screen — classes live only in seed data).
//    2. For each class, inserts its students. It is IDEMPOTENT:
//       a student whose (class_id, name) already exists is skipped,
//       so running the script twice never creates duplicates.
//       Roll numbers continue from the current maximum in each class.
//
//  Usage (locally with a .env, or in the Render "Shell" tab):
//      npm run import-students
//
//  Safe to re-run. Only ADDS missing classes/students; it never
//  deletes or overwrites existing attendance or students.
// ============================================================
require("dotenv").config();
const { pool } = require("./pool");

// ------------------------------------------------------------
//  Classes. `id` must be stable (used as the FK for students and
//  for attendance). `category` matches the existing convention:
//  "درسِ نظامی" for the academic classes, "حفظ" for Hifz groups.
// ------------------------------------------------------------
const CLASSES = [
  // --- Existing academic classes (already seeded; upsert keeps them intact) ---
  { id: "daurah-hadith",         name: "دورہ حدیث",            category: "درسِ نظامی" },
  { id: "arabic-sixth",          name: "عربی ششم",             category: "درسِ نظامی" },
  { id: "arabic-fifth",          name: "عربی پنجم",            category: "درسِ نظامی" },
  { id: "arabic-fourth-shafi",   name: "عربی چہارم (شافعی)",   category: "درسِ نظامی" },
  { id: "arabic-fourth-hanafi",  name: "عربی چہارم (حنفی)",    category: "درسِ نظامی" },
  { id: "special-second-shafi",  name: "خصوصی دوم (شافعی)",    category: "درسِ نظامی" },
  { id: "special-second-hanafi", name: "خصوصی دوم (حنفی)",     category: "درسِ نظامی" },
  { id: "special-first",         name: "خصوصی اول",            category: "درسِ نظامی" },
  { id: "arabic-first",          name: "عربی اول",             category: "درسِ نظامی" },

  // --- Hifz groups (teacher-wise). First three are the original seeded ones. ---
  { id: "hifz-alif",     name: "حفظ الف (مولانا بلال صاحب)",  category: "حفظ" },
  { id: "hifz-ba",       name: "حفظ ب (مولانا رضوان صاحب)",   category: "حفظ" },
  { id: "hifz-jeem",     name: "حفظ ج (مولانا ثابت صاحب)",    category: "حفظ" },
  // --- New Hifz teacher groups ---
  { id: "hifz-manzoor",  name: "حفظ (مولانا منظور صاحب)",     category: "حفظ" },
  { id: "hifz-ilyas",    name: "حفظ (مفتی الیاس صاحب)",       category: "حفظ" },
  { id: "hifz-safwan",   name: "حفظ (مولانا صفوان صاحب)",     category: "حفظ" },
  { id: "hifz-muaz",     name: "حفظ (مولانا معاذ صاحب)",      category: "حفظ" },
  { id: "hifz-adil",     name: "حفظ (مفتی عادل صاحب)",        category: "حفظ" },
  { id: "hifz-shabbir",  name: "حفظ (مولانا شبیر صاحب)",      category: "حفظ" },
  { id: "hifz-asadullah",name: "حفظ (مفتی اسد اللہ صاحب)",    category: "حفظ" },
  { id: "hifz-rabian",   name: "حفظ (مولانا ربیعان صاحب)",    category: "حفظ" },
  { id: "hifz-ateeq",    name: "حفظ (مولانا عتیق صاحب)",      category: "حفظ" },
  { id: "hifz-asjad",    name: "حفظ (مولانا اسجد صاحب)",      category: "حفظ" },
  { id: "hifz-yameen",   name: "حفظ (مولانا یامین صاحب)",     category: "حفظ" },
  { id: "hifz-anees",    name: "حفظ (مولانا انیس صاحب)",      category: "حفظ" },
  { id: "hifz-ammar",    name: "حفظ (مولانا عمار صاحب)",      category: "حفظ" },
];

// ------------------------------------------------------------
//  Students per class. Order is preserved as roll order.
// ------------------------------------------------------------
const STUDENTS = {
  "daurah-hadith": [
    "عبدالرحمن پٹیل", "صلاح الدین ملا", "عبداللہ پردیسی", "دانش چلوان", "فرزان جولے",
    "سعد شیخ", "عمیر ونو", "ابوقتادہ صدیقی", "محمودحسن قاضی", "ایوب مجاور",
  ],
  "arabic-sixth": [
    "اسجد امبیرکر", "ارقم شیخ", "سلمان قریشی", "مظہر پٹیل", "محمد قریشی",
    "حسین بوٹ", "دانیال گڑکری", "اسامہ جلگاؤنکر", "حنظلہ بلبلے", "حنظلہ گھراڈے",
    "محمد احسانے", "زید بیوناک", "محمد زید پٹیل", "ایان مکاشی", "مصعب بغدادی",
  ],
  "arabic-fifth": [
    "عبد الرحمٰن پردیشی", "عبد الحنان گھارے", "عبداللّٰہ صدیقی", "ابوبکر خان", "ابوذر ملانی",
    "عفان سید", "عفان شیخ", "آفرید ڈانگے", "احمد دروگے", "فواد کورئے",
    "حماد جھٹام", "غفران موسانی", "حمزہ شیخ", "حسان مہاڈکر", "حسان سین",
    "خباب ہرنیکر", "لقمان پاوسکر", "محمد طہ نظیر", "مسیح اللہ السولکر", "مفیض الاسلام تمبولی",
    "محمد کونڈیکر", "محمد صحیح بولے", "معز الاسلام تمبولی", "صفوان میمن", "صائم شیخ",
  ],
  "arabic-fourth-shafi": [
    "اسد حکیم", "داؤد کھیڑیکر", "ابراہیم ابجی", "عرباض جاگیردار", "مہران کھیرٹکر",
    "محمد واگھو", "مجتبٰی لوکھنڈے", "ریان سرکھوت", "سفیان یشویکر", "طہ مجگاؤنکر",
    "اویس کرکرے", "زید راہٹویلکر",
  ],
  "arabic-fourth-hanafi": [
    "عبد العلیم بودلے", "عبد الرؤف شیخ", "جنید دیسائی",
  ],
  "special-second-shafi": [
    "سعد آرائی", "عبداللّٰہ راہٹول", "انس گزگے", "انس خطیب", "ارقم بروڈ",
    "حنظلہ مجگاؤنکر", "کاشف پیویکر", "شیخ عمر مقادم", "یوسف دیشمکھ", "زہیر انتولے",
  ],
  "special-second-hanafi": [
    "عبدالرحمن صدیقی", "عبدالرحمن پٹویکر", "ابصار خانہ پورے", "محمد سعد ملا", "معاذ پیرزادے",
    "ریحان انصاری", "ریحان شیخ", "عبیداللہ مرزا", "عمر فاروق خانہ پورے", "ذیشان مجاور",
    "زیفان نداف",
  ],
  "special-first": [
    "عبدالاحد فنسوپکر", "عبداللّٰہ خان", "ابصار ملاجی", "ابوذر آتش باز", "عفان انعامدار",
    "آرمیاں پاوسکر", "حماد بیلگام", "حنظلہ شیخ", "حذیفہ شیخ", "ابراہیم ملاحی",
    "جاذب چاؤس", "کیف ملانی", "محمد ایان امین الدین", "محمد ثاقب پٹویکر", "محمد عزیر دیسائی",
    "معاذ پٹیل", "معاذ قادری", "معاویہ دیشمکھ", "محمد پٹیل", "محمد شیخ",
    "نعمت اللہ پٹیل", "سعد میمن", "ثوبان ٹھاکور", "شیفان گڑکری", "عبیداللہ شیخ",
    "عثمان خان", "سمیر خان", "عنایت اللہ صدیقی",
  ],
  "arabic-first": [
    "عبدالصمد شیخ", "عادین تمکے", "عبداللّٰہ رکھانگے", "عفان شیخ", "احنف ساٹھے",
    "حماد وسگرے", "انعام اللّٰہ خان", "محمد ہانی سید", "محمد نیوریکر", "محمد ہوڑیکر",
    "مجاہد جوگیلکر", "صدیم کاسکر", "صادق پنہالکر", "ساجد باغوان", "سلمان پوترک",
  ],
  "hifz-alif": [
    "عبدالقیوم کھوت", "احمد بیا", "اریب کندالم", "ایان کھیرٹکر", "حمدان انصاری",
    "حمزہ آرکر", "حمزہ ساکھرکر", "ابراہیم شنگڑے", "ماحی جھٹام", "مہران کھوت",
    "محمد جولے", "محمد دھنشے", "طلحہ انعامدار", "عمر مجاور", "عمیر میرکر",
    "احمد صوبیدار",
  ],
  "hifz-ba": [
    "عبدالمتین کونچالی", "عبدالرحمن اشرف علی", "عبد الراشد باغوان", "عبداللّٰہ دیشمکھ", "احمد سرکھوت",
    "عرفان پوترک", "ایان پٹھان", "فرزان کارونکر", "عماد بٹے", "محمد حسين میڑیکر",
    "محمد کیف پٹیل", "محمد دنوارے", "محمد شیخ", "قیس شرگاؤنکر", "صفوان بوٹ",
    "سیف اللّٰہ پوشیلکر", "ساجد الاسلام میاں", "زید راجپورکر",
  ],
  "hifz-jeem": [
    "ابو طلحہ سالڈولکر", "ابوذر جلگاؤنکر", "ارہان عیدروس", "بلال سین", "فوزان ملاجی",
    "حارث شیخ", "حذیفہ میڑیکر", "خالد پاٹھنکر", "ریان سین", "صفوان میمن",
    "عثمان وسگرے", "یوسف خطیب", "ذیشان چوگلے", "ذیشان مانڈلیکر", "سجاد صوبیدار",
    "عثمان قادری",
  ],
  "hifz-manzoor": [
    "عبدالرحيم حسين", "عبدالحنان شرگاؤنکر", "عابد پکالی", "عزمان پانگرکر", "ہمشاد شیخ",
    "جاسم شیخ", "محمد کیف انتولی", "محمد طلحہ لامبے", "محمد شیخ", "محمد ساکھر",
    "مکرم مہاپلے", "ریان چافیکر", "صفوان شاہ", "سیف باغوان", "سعد شیخ",
    "علی حسینی", "ریحان انصاری",
  ],
  "hifz-ilyas": [
    "ایان جسنائیک", "عبداللّٰہ شاہ بندر", "عدنان درویش", "عفان صندلکر", "اکرم شیخ",
    "امان اللہ پرکار", "اسد انصاری", "حنظلہ احسن", "محمد کارباری", "معز کیپی",
    "راحد شیخ", "رمیز راہٹویلکر", "شرجیل ساٹھے", "سراقہ جلگاؤنکر", "عبید انصاری",
    "ارسلان گردی",
  ],
  "hifz-safwan": [
    "عبدالحنان انصاری", "عبدالصمد سین", "عبدالستار کربیلکر", "احمد شیخ", "اکمل خان",
    "علی ماندرے", "ارقم سردار", "افراز بارگیر", "اسماعيل چوگلے", "مظہر انصاری",
    "مدثر بھاکشے", "محمد بیڈیکر", "محمد ابجی", "سیف خان", "شایان اکئے",
    "عبیداللہ دیشمکھ", "عمیر بروڈ",
  ],
  "hifz-muaz": [
    "عبدالعزیز ہوڑیکر", "عبداللّٰہ سید", "ارقم شیخ", "اسعد بروڈ", "حماد دبیر",
    "حنظلہ مہاڈکر", "محمد عمر مقری", "محمد بروڈ", "محمد دیشمکھ", "محمد میمن",
    "سعد باغوان", "عزیر تانبے", "یحییٰ انعامدار", "یوسف شیوکر", "زید تانڈیل",
  ],
  "hifz-adil": [
    "عبداللّٰہ گھارے", "عبدالرحمن خان", "عبداللّٰہ پٹیل", "عبداللّٰہ پٹیل", "علی لسنے",
    "امین پٹھان", "عمار کورئے", "اسجد ملا", "حذیفہ دلوی", "خالد شیخ",
    "محمد فہیم شاہ", "مسعود علی", "معاذ شیخ", "اویس پٹیل", "سعد فلاری",
    "طاہر ڈیگی",
  ],
  "hifz-shabbir": [
    "عبدالرحمن شاہ", "عبدالرحمن پٹیل", "عبداللہ سین", "ابو طلحہ شیخ", "امان بوٹ",
    "فرقان اسٹیکر", "حمدان پنجری", "حسان خان", "اضافہ جلگاؤنکر", "حذیفہ باغبان",
    "حذیفہ بروڈکر", "محمد کانیکر", "محمد پیشیمام", "شمام خان", "عبیدالرحمن علی",
    "یحییٰ شنگڑے", "ظاہر بھاٹکر", "ابرار پنجری",
  ],
  "hifz-asadullah": [
    "عبد المعز ملا", "عبد الرحمٰن صدیقی", "ابو ہریرہ پکالی", "ابو طلحہ ہنڈیکر", "عاقب السولکر",
    "اسد جمادار", "ایان صدیق", "فرید ملاجی", "فیروز فٹکورے", "حمید الڈے",
    "ابراہیم ساکھرکر", "محمد درزی", "محمد لوکھنڈے", "ریان کارباری", "وقاص نیوریکر",
    "یعقوب چیویلکر", "یاسین خان",
  ],
  "hifz-rabian": [
    "عبد الہادی ملانی", "عاصم منڈیکر", "عبد اللہ خاندیشی", "حماد بھاکشے", "حماد شیخ",
    "حنظلہ جلال", "حنظلہ تھوکن", "حذیفہ دیویکر", "سعد شیخ", "سیماب خطیب",
    "حذیفہ شیخ", "حذیفہ شیخ",
  ],
  "hifz-ateeq": [
    "عبد الہادی پربالکر", "عبد الہادی شیخ ناگ", "احمد پلوکر", "احمد پرکار", "احمد زاری",
    "ارمان کاروینکر", "ایان کڑویکر", "فاروق منڈل", "ابراہیم ہرزک", "اکرام مجگاؤنکر",
    "عماد عطار", "محمد جنید چکالی", "محمد رافع الڈے", "معوذ صندلکر", "محمد کرڈیکر",
    "نوفل پالیکر", "تمیم زاری", "عمر جولے",
  ],
  "hifz-asjad": [
    "ادیان چارفارے", "عفان نیوریکر", "عفان پٹیل", "بلال چپلونکر", "فائق کرکرے",
    "عفان خان", "منان خربے", "محمد گوڈمے", "محمد کارباری", "محمد مقدم",
    "محمد شیخ حسن", "ثوبان ملا", "زین چورگئے", "زین شیخ", "شاہد بودلے",
  ],
  "hifz-yameen": [
    "عبدالرحمٰن شیخ", "عبداللہ دیشمکھ", "علی حجو", "عمار ملانی", "انس کنڈلک",
    "عرفات فرفرے", "ارحم مانڈلیکر", "عرفان اشتیکر", "ماہی جمادار", "محمد حسوارے",
    "محمد مروڈکر", "محمد پیٹکر", "مصطفیٰ خان", "نواب گانگریکر", "سمیعاللہ دادیل",
    "تمیم خان", "عمر لوکھنڈے",
  ],
  "hifz-anees": [
    "عبد الملک خطیب", "آھل شیخ", "ابوبکر بانگی", "احمد دروے", "ایان برمارے",
    "ایان تیٹولکر", "ایان چپلونکر", "فیصل کھوت", "ہادی پلوکر", "حسن جلگاؤنکر",
    "محمد فاباد عالم", "محمد احمد", "محمد اکئے", "ثاقب دستے", "نوح شنگرے",
    "رافع جولے", "صادق ناڈکر", "ساحر چکٹے", "یوسف چیویلکر", "امیر کربیلکر",
  ],
  "hifz-ammar": [
    "عبدالصمد خطیب", "آدم سروے", "عبداللہ بالی", "عبد اللہ اُلڈے", "احمد جھانجو",
    "ابراہیم دیشمکھ", "ابراہیم مُلّا", "معاذ عطار", "معاذ مُلّا", "معوذ کونچالی",
    "معز صندلکر", "مجاہد راہٹویلکر", "ریان پلوکر", "سعید صدیقی", "صلاح ہرزک",
    "تمیم شیرڈیکر", "یاسر مانڈلیکر", "ذوالقرنین ورونکر", "سعد باغوان",
  ],
};

async function main() {
  const client = await pool.connect();
  let classesAdded = 0;
  let studentsAdded = 0;
  let studentsSkipped = 0;

  try {
    await client.query("BEGIN");

    // 1) Upsert all classes.
    for (const c of CLASSES) {
      const r = await client.query(
        `INSERT INTO classes (id, name, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category`,
        [c.id, c.name, c.category]
      );
      if (r.rowCount) classesAdded++;
    }

    // 2) Insert students per class (idempotent by class_id + name).
    for (const [classId, names] of Object.entries(STUDENTS)) {
      // Current highest roll in this class, so we append cleanly.
      const { rows: mx } = await client.query(
        "SELECT COALESCE(MAX(roll), 0) AS m FROM students WHERE class_id = $1",
        [classId]
      );
      let roll = mx[0].m;

      for (const rawName of names) {
        const name = String(rawName).replace(/\u200b/g, "").trim(); // strip zero-width chars
        if (!name) continue;

        // Skip if a student with this exact name already exists in the class.
        const dup = await client.query(
          "SELECT 1 FROM students WHERE class_id = $1 AND name = $2 LIMIT 1",
          [classId, name]
        );
        if (dup.rowCount) { studentsSkipped++; continue; }

        roll += 1;
        const id = `${classId}-${roll}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
        await client.query(
          "INSERT INTO students (id, name, class_id, roll, batch) VALUES ($1,$2,$3,$4,$5)",
          [id, name, classId, roll, null]
        );
        studentsAdded++;
      }
    }

    await client.query("COMMIT");
    console.log(
      `[import] done. classes upserted: ${classesAdded}, ` +
      `students added: ${studentsAdded}, skipped (already existed): ${studentsSkipped}.`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main.CLASSES = CLASSES;
main.STUDENTS = STUDENTS;

// Only run automatically when executed directly (node db/import-students.js),
// not when required by a test/counter.
if (require.main === module) {
  main().catch((err) => {
    console.error("[import] failed:", err.message);
    process.exit(1);
  });
}

module.exports = { CLASSES, STUDENTS, main };
