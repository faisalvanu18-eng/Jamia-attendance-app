# جامعہ اسلامیہ کوکن — Attendance System

A web-based student attendance system for Jamia Islamiya Kokan.

It can run in **three modes**:

| Mode        | Where data lives                    | Use it for |
|-------------|-------------------------------------|------------|
| **API_MODE** (default) | **Online PostgreSQL** via a Node/Express API | **Real, shared, deployable use** ✅ |
| DEMO_MODE   | Browser `localStorage` (one device only) | Quick offline preview |
| Firebase    | Cloud Firestore                     | Original Firebase setup |

The mode is chosen in **`site/js/firebase-config.js`** (`API_MODE` / `DEMO_MODE`).
Keep `site/js/app-config.js` in sync (it mirrors the flags for non-module scripts).

---

# Part A — Online PostgreSQL backend (recommended)

Here the browser talks to a small **Express API** (`server.js`) which stores
everything in **PostgreSQL**. This is what you deploy online so all teachers and
the principal share the same central data.

```
Browser (site/)  ──►  Express API (server.js)  ──►  PostgreSQL
                       /api/login, /api/classes,
                       /api/students, /api/attendance …
```

## A1. What you need
- [Node.js](https://nodejs.org) 18+ (you have Node installed).
- A PostgreSQL database. Any of these free hosts work:
  - **Neon** <https://neon.tech>  (easiest, serverless)
  - **Supabase** <https://supabase.com>
  - **Render PostgreSQL** <https://render.com>
- For local testing you can also install Postgres on your own machine.

## A2. Configure
1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your Postgres connection string.
   - Hosted (Neon/Supabase/Render): looks like
     `postgres://user:pass@host/dbname?sslmode=require` — leave `PGSSL` empty.
   - Local Postgres without SSL: set `PGSSL=disable`.
3. Set `JWT_SECRET` to a long random string. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

## A3. Install, create tables, seed data
```bash
npm install
npm run setup     # runs the schema migration, then seeds teachers/classes/students
```
`npm run setup` = `npm run migrate` (create tables) + `npm run seed` (load data).
The seed is **idempotent** — safe to re-run.

## A4. Run locally
```bash
npm start
```
Open <http://localhost:5050>. The Node server serves the website **and** the API.

**Login accounts (created by the seed):**
- Initial admin credentials come from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` when `npm run seed` is executed.
- In production, set these values in the hosting provider and do not use demo credentials.

> Change these passwords after first login (admin → منظمِ اکاؤنٹس / Manage Accounts).

## A5. Deploy online

### Option 1 — Render (recommended for this Node + PostgreSQL architecture)
1. Push this folder to a GitHub repo.
2. On <https://render.com> → **New + → Blueprint** → pick the repo.
   Render reads `render.yaml`, creates a **web service + PostgreSQL database**, and wires `DATABASE_URL` + a generated `JWT_SECRET` automatically. For a real production system, do **not** use Render's Free Postgres: Render currently states that Free Postgres expires after 30 days and has no backups.
3. After the first deploy, open the web service **Shell** and run once:
   ```bash
   npm run setup
   ```
4. Your app is live at the Render URL. Data is saved in the managed Postgres.

### Option 2 — Railway / Fly / any Node host
1. Create a PostgreSQL database on the host (or use Neon/Supabase).
2. Set env vars on the service: `DATABASE_URL`, `JWT_SECRET`
   (and `PGSSL=disable` only if your DB has no SSL).
3. Build command: `npm install` — Start command: `npm start`.
4. Run `npm run setup` once (host shell or locally against the same `DATABASE_URL`).

### Hosting the frontend separately (optional)
`server.js` already serves `site/`, so you normally don't need to. If you host the
static site on a different domain, set a global before the modules load:
```html
<script>window.API_BASE = "https://your-api-host.example.com";</script>
```
CORS is already enabled on the API.

## Data model (PostgreSQL)

| Table         | Key                            | Columns |
|---------------|--------------------------------|---------|
| `users`       | `id`                           | `email`, `password_hash`, `name`, `role` (`teacher`\|`admin`) |
| `classes`     | `id` (e.g. `arabic-sixth`)     | `name`, `category` |
| `assignments` | `id`                           | `class_id`, `session` (`morning`\|`afternoon`), `teacher_id` |
| `students`    | `id` (e.g. `arabic-sixth-1`)   | `name`, `class_id`, `roll` |
| `attendance`  | `{date}__{classId}__{session}` | `date`, `class_id`, `session`, `teacher_id`, `records` (JSONB `{studentId:{status,reason}}`), `summary` (JSONB), `marked_by`, `marked_at`, `late` |

Students not marked absent/leave are recorded as **present** automatically.

## REST API (all under `/api`, JWT via `Authorization: Bearer <token>`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/login` | `{email,password}` → `{token,user}` |
| GET  | `/api/me` | current user profile |
| GET  | `/api/classes` · `/api/classes/:id` | |
| GET  | `/api/assignments?teacherId=` | |
| GET  | `/api/students?classId=` · `?q=` · `/count` | |
| POST | `/api/students` | `{classId,name}` (admin UI) |
| DELETE | `/api/students/:id` | |
| GET  | `/api/attendance?date=&classId=&session=` · `?date=` · (all) | |
| POST | `/api/attendance` | upsert `{date,classId,session,records}` |
| GET/POST/DELETE | `/api/accounts` (+`/password`) | admin only |
| GET  | `/api/health` | DB connectivity check |

## Project structure (backend + site)
```
.
├─ package.json          # Node deps + scripts (start / migrate / seed / setup)
├─ server.js             # Express API + serves the site
├─ .env.example          # copy to .env
├─ render.yaml           # Render blueprint (web service + Postgres)
├─ db/
│  ├─ schema.sql         # PostgreSQL tables
│  ├─ pool.js            # pg connection (DATABASE_URL + SSL)
│  ├─ migrate.js         # `npm run migrate`
│  └─ seed.js            # `npm run seed`
└─ site/                 # the website
   └─ js/
      ├─ firebase-config.js # API_MODE / DEMO_MODE switch
      ├─ app-config.js      # same flags for classic scripts
      ├─ api-store.js       # REST client (API_MODE)
      ├─ data.js            # picks backend per mode
      └─ auth.js            # login / logout / guard
```

> Note: `site/seed.html` is the **Firebase-only** one-time seeder from Part B and
> does nothing in API_MODE. Use `npm run seed` instead.

---

# Part B — Firebase (original setup)

The original Firebase (Hosting + Authentication + Cloud Firestore) instructions are
kept below for reference. To use them, set `API_MODE = false` and `DEMO_MODE = false`
in `site/js/firebase-config.js` (and `API_MODE: false` in `site/js/app-config.js`).

---

## 1. What you need (one-time)

1. A Google account.
2. [Node.js](can ) installed (for the Firebase CLI).
3. Install the Firebase CLI:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

## 2. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project**
   (suggested name: `jamia-kokan-attendance`).
2. In the project, open **Build → Authentication → Get started**, and enable
   **Email/Password**.
3. Open **Build → Firestore Database → Create database** → *Production mode*.
4. Open **Project settings (gear) → Your apps → Web app (</>)** and register an app.
   Copy the `firebaseConfig` values.

## 3. Add your config to the app

Edit **`site/js/firebase-config.js`** and paste your real values:
```js
export const firebaseConfig = {
  apiKey: "…",
  authDomain: "jamia-kokan-attendance.firebaseapp.com",
  projectId: "jamia-kokan-attendance",
  storageBucket: "jamia-kokan-attendance.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
export const USE_EMULATOR = false;
```

Also set your project id in **`.firebaserc`** if you used a different name.

> These config values are **not secrets** — they are meant to ship in the browser.
> Your data is protected by `firestore.rules`.

## 4. Create login accounts + the first admin

1. In the Firebase console → **Authentication → Users → Add user**.
   Create at least one user, e.g. `admin@jamia.test` with a password.
2. In **Firestore → Start collection** create a collection **`users`**.
   Add a **document whose ID = that user's UID** (copy the UID from the Authentication
   users list). Fields:
   ```
   name    (string)  "مولانا اسحاق گھارے صاحب"
   role    (string)  "admin"
   ```
3. For each teacher: create an Auth user, then a `users/{uid}` doc:
   ```
   name     (string)  "مفتی صابر صاحب"
   role     (string)  "teacher"
   classIds (array)   ["arabi-shashm", "arabi-chaharm"]   // optional
   ```
   If `classIds` is empty/omitted, the teacher sees all classes.

## 5. Add sample classes & students (optional, quick test)

1. Deploy or run locally (below), sign in as the **admin**.
2. Open **`/seed.html`** and click the button. It creates 3 sample classes and their
   students so you can test immediately. Run it **once**, then ignore/delete the page.

You can also add classes/students manually in Firestore:
- `classes/{id}` → `{ name, sessions: ["صبح","دوپہر"], teacherId }`
- `students/{id}` → `{ name, classId, roll }`

---

## 6. Test locally with the Emulator (no internet data cost)

```bash
# from the project root (this folder)
firebase emulators:start
```
- Set `USE_EMULATOR = true` in `site/js/firebase-config.js` first.
- Open the Hosting URL it prints (usually <http://localhost:5000>).
- Emulator UI: <http://localhost:4000> — create test users under the Auth tab.
- Set `USE_EMULATOR = false` again before deploying to the real project.

## 7. Deploy to Google (Firebase Hosting)

```bash
# deploy security rules + indexes + the website
firebase deploy
```
Or deploy parts individually:
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only hosting
```
After it finishes, your site is live at:
```
https://<your-project-id>.web.app
```

---

## Project structure

```
.
├─ firebase.json            # Hosting + Firestore + Emulator config
├─ .firebaserc              # Default project id
├─ firestore.rules          # Security rules (role-based)
├─ firestore.indexes.json   # Composite indexes
└─ site/                    # The website (Hosting "public" folder)
   ├─ index.html            # Login
   ├─ dashboard.html        # Teacher dashboard
   ├─ mark-attendance.html  # Mark attendance (+ absence reason)
   ├─ attendance-saved.html # Save confirmation + summary
   ├─ attendance-by-date.html
   ├─ admin-dashboard.html  # Principal dashboard (live totals)
   ├─ attendance-detail.html# Detailed list + CSV/print
   ├─ seed.html             # One-time sample data
   ├─ assets/logo.svg
   ├─ css/style.css
   └─ js/
      ├─ firebase-config.js # <-- paste your keys here
      ├─ firebase-init.js
      ├─ auth.js            # login / logout / route guard
      └─ data.js            # Firestore read/write helpers
```

## Data model (Firestore)

| Collection   | Doc ID                         | Fields |
|--------------|--------------------------------|--------|
| `users`      | Auth UID                       | `name`, `role` (`teacher`\|`admin`), `classIds[]` |
| `classes`    | e.g. `arabi-shashm`            | `name`, `sessions[]`, `teacherId` |
| `students`   | e.g. `arabi-shashm-1`          | `name`, `classId`, `roll` |
| `attendance` | `{date}__{classId}__{session}` | `date`, `classId`, `session`, `records{studentId:{status,reason}}`, `summary{total,present,absent,leave}`, `markedBy`, `markedAt` |

Students not marked absent/leave are recorded as **present** automatically.

## Security notes

- Only signed-in staff can read data; only `admin` can create/edit users, classes,
  and students. Teachers (any signed-in user) can record attendance.
- The web API key in `firebase-config.js` is public by design and safe to deploy.
- Review `firestore.rules` before going live; tighten attendance writes to a
  teacher's assigned classes if you want stricter control.

## Docker (local production-like environment)

The repository now includes `Dockerfile`, `docker-compose.yml`, and `.dockerignore`.
For local testing:

```bash
docker compose up --build
```

Open `http://localhost:5050`. The compose setup creates PostgreSQL, applies the schema,
seeds the configured admin account, and starts the Node server. Change the example
admin password before using this outside a disposable local environment.
