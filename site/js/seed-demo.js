// Demo DB Seeder - works without ES modules (for file:// protocol)
// This creates the initial demo database in localStorage if it doesn't exist.
(function() {
  // Skip demo seeding entirely when using the online API backend.
  if (window.JAMIA_CONFIG && window.JAMIA_CONFIG.API_MODE) return;
  var DB_KEY = "jamia_demo_db_v2";
  if (localStorage.getItem(DB_KEY)) return; // Already exists

  var TEACHERS = {
    abdullah: "شیخ الحدیث مولانا عبد اللہ صاحب",
    zubair: "مفتی زبیر صاحب",
    sabir: "مفتی صابر صاحب",
    ghaffar: "مفتی عبد الغفار صاحب",
    salman: "مفتی سلمان صاحب",
    israr: "مفتی اسرار صاحب",
    farooq: "مولانا فاروق صاحب",
    mudassar: "مفتی مدثر صاحب",
    usama: "مفتی اسامہ صاحب",
    "usama-purkar": "مولانا اسامہ پورکر صاحب",
    bilal: "مولانا بلال صاحب",
    rizwan: "مولانا رضوان صاحب",
    sabit: "مولانا ثابت صاحب",
    shabbir: "مولانا شبیر صاحب",
    adil: "مفتی عادل صاحب",
    asadullah: "مفتی اسد اللہ صاحب",
    ammar: "مولانا عمار صاحب",
    yameen: "مولانا یامین صاحب",
    asjad: "مفتی اسجد صاحب",
    safwan: "مولانا صفوان صاحب",
    manzoor: "مولانا منظور صاحب",
    ilyas: "مفتی الیاس صاحب",
    anees: "مولانا انیس صاحب",
    muaz: "مولانا معاذ صاحب",
    rabian: "مولانا ربیعان صاحب",
    atiq: "مولانا عتیق صاحب"
  };

  var CLASSES = {
    "daurah-hadith": { name: "دورہ حدیث", category: "درسِ نظامی" },
    "arabic-sixth": { name: "عربی ششم", category: "درسِ نظامی" },
    "arabic-fifth": { name: "عربی پنجم", category: "درسِ نظامی" },
    "arabic-fourth-shafi": { name: "عربی چہارم (شافعی)", category: "درسِ نظامی" },
    "arabic-fourth-hanafi": { name: "عربی چہارم (حنفی)", category: "درسِ نظامی" },
    "special-second-shafi": { name: "خصوصی دوم (شافعی)", category: "درسِ نظامی" },
    "special-second-hanafi": { name: "خصوصی دوم (حنفی)", category: "درسِ نظامی" },
    "special-first": { name: "خصوصی اول", category: "درسِ نظامی" },
    "arabic-first": { name: "عربی اول", category: "درسِ نظامی" },
    "hifz-alif": { name: "حفظ الف", category: "حفظ" },
    "hifz-ba": { name: "حفظ ب", category: "حفظ" },
    "hifz-jeem": { name: "حفظ ج", category: "حفظ" }
  };

  var GROUP_TEACHERS = ["shabbir","adil","asadullah","ammar","yameen","asjad",
    "safwan","manzoor","ilyas","anees","muaz","rabian","atiq"];
  GROUP_TEACHERS.forEach(function(t) {
    CLASSES["grp-" + t] = { name: TEACHERS[t] + " — طلبہ", category: "مدرسہ + اسکول" };
  });

  var RAW_ASSIGN = [
    ["daurah-hadith","morning","abdullah"],["daurah-hadith","afternoon","zubair"],
    ["arabic-sixth","morning","sabir"],["arabic-sixth","afternoon","ghaffar"],
    ["arabic-fifth","morning","salman"],["arabic-fifth","afternoon","israr"],
    ["arabic-fourth-shafi","morning","israr"],["arabic-fourth-shafi","afternoon","sabir"],
    ["arabic-fourth-hanafi","morning","ghaffar"],["arabic-fourth-hanafi","afternoon","farooq"],
    ["special-second-shafi","morning","mudassar"],
    ["special-second-hanafi","morning","farooq"],["special-second-hanafi","afternoon","usama"],
    ["special-first","morning","zubair"],["special-first","afternoon","mudassar"],
    ["arabic-first","morning","usama-purkar"],["arabic-first","afternoon","usama"],
    ["hifz-alif","morning","bilal"],["hifz-alif","afternoon","bilal"],
    ["hifz-ba","morning","rizwan"],["hifz-ba","afternoon","rizwan"],
    ["hifz-jeem","morning","sabit"],["hifz-jeem","afternoon","sabit"]
  ];
  GROUP_TEACHERS.forEach(function(t) {
    RAW_ASSIGN.push(["grp-" + t, "morning", t], ["grp-" + t, "afternoon", t]);
  });

  // Build users & accounts
  var users = { uadmin: { name: "حضرت مولانا اسحاق گھارے صاحب", role: "admin" } };
  var accounts = { "admin@jamia.test": { password: "admin123", uid: "uadmin" } };
  Object.keys(TEACHERS).forEach(function(id) {
    var uid = "u_" + id;
    users[uid] = { name: TEACHERS[id], role: "teacher" };
    accounts[id + "@jamia.test"] = { password: "jamia123", uid: uid };
  });

  // Build assignments
  var assignments = {};
  RAW_ASSIGN.forEach(function(arr, i) {
    assignments["a" + i] = { classId: arr[0], session: arr[1], teacherId: "u_" + arr[2] };
  });

  // Sample students
  var students = {};
  function mkStudents(classId, names) {
    names.forEach(function(name, i) {
      students[classId + "-" + (i + 1)] = { name: name, classId: classId };
    });
  }
  mkStudents("arabic-sixth", ["محمد احمد","عبد اللہ","محمد یوسف","عادل خان","متقان علی","سعد فاروق","محمد حارث","فینان احمد"]);
  mkStudents("arabic-fifth", ["زبیر عالم","انس شیخ","ابراہیم خان","یعقوب ملک","سلیمان قریشی","داؤد انصاری"]);
  mkStudents("arabic-fourth-shafi", ["زید انصاری","بلال شیخ","عمار خان","طلحہ قریشی","ہارون ملک"]);
  mkStudents("daurah-hadith", ["ابوبکر","عمر فاروق","عثمان غنی","علی حیدر"]);
  mkStudents("hifz-ba", ["معاذ بن جبل","ابی بن کعب","زید بن ثابت","سعد بن معاذ","انس بن مالک"]);
  mkStudents("grp-shabbir", ["اسامہ","حمزہ","عکاشہ","خالد"]);

  // Seed some attendance for today
  var today = (window.JAMIA_TODAY || new Date().toISOString().slice(0, 10));
  var attendance = {};
  
  // arabic-sixth morning
  var recs1 = {};
  Object.keys(students).forEach(function(sid) {
    if (students[sid].classId === "arabic-sixth") {
      recs1[sid] = { status: "present", reason: "" };
    }
  });
  if (recs1["arabic-sixth-3"]) recs1["arabic-sixth-3"] = { status: "absent", reason: "sick" };
  if (recs1["arabic-sixth-5"]) recs1["arabic-sixth-5"] = { status: "absent", reason: "leave" };
  var total1 = Object.keys(recs1).length;
  var absent1 = Object.values(recs1).filter(function(r) { return r.status === "absent"; }).length;
  attendance[today + "__arabic-sixth__morning"] = {
    date: today, classId: "arabic-sixth", session: "morning", teacherId: "u_sabir",
    records: recs1, summary: { total: total1, present: total1 - absent1, absent: absent1 },
    markedBy: "u_sabir", markedAt: new Date().toISOString(), late: false
  };

  var db = { accounts: accounts, users: users, classes: CLASSES, assignments: assignments, students: students, attendance: attendance };
  localStorage.setItem(DB_KEY, JSON.stringify(db));
})();
