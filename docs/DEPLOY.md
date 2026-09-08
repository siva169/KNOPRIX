# 🚀 Deploying Knoprix Mid Review (public demo)

The app is **full-stack**: a FastAPI backend (Python + SQLite + file uploads) and a
React frontend. For a public demo you need BOTH running:

| Piece | Host | Example URL |
|---|---|---|
| Backend (API) | PythonAnywhere (free, no GitHub) **or** Render | `https://yourname.pythonanywhere.com` |
| Frontend (UI) | Netlify (you already have an account) | `https://your-site.netlify.app` |

The frontend talks to the backend through an env var, `VITE_API_URL`. Everything
is already wired: `frontend/src/config.js`, CORS origins from `CORS_ORIGINS`,
and `backend/asgi.py` for ASGI servers.

---

## ✅ Path A — Backend on PythonAnywhere (RECOMMENDED)

Why: free forever, **always-on** (no cold start — important during a live demo),
persistent SQLite + uploads, and **no GitHub account needed** (drag-drop upload).

1. **Sign up** at https://www.pythonanywhere.com (free "Beginner" plan).
2. **Files tab** → `Browse` → `/home/<yourname>/` → `+ Create directory` → name it `knoprix`.
3. **Upload the backend** into `/home/<yourname>/knoprix/`:
   - In the **Files tab**, open the `knoprix` folder, then drag-drop (or use
     "Upload a file") the **contents** of `knoprix-v2-midreview/backend/` from
     your PC: the `app/` folder, `uploads/` folder, `asgi.py`, and
     `requirements.txt`. (The `.venv`, `*.db` files can be skipped.)
   - ⚠️ Drag the *contents* — you want `knoprix/app/config.py` to exist.
4. **Create the env file** — in the `knoprix` folder click `+ New file`, name it
   `.env`, and paste:
   ```env
   JWT_SECRET=change-this-to-a-long-random-string
   JWT_REFRESH_SECRET=change-this-to-another-long-random-string
   CORS_ORIGINS=https://your-site.netlify.app
   ```
   (Put your real Netlify URL in `CORS_ORIGINS`.)
5. **Consoles tab** → open a **Bash** console, then run:
   ```bash
   cd ~/knoprix
   python3.11 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
6. **Web tab** → `Add a new web app` → **Manual configuration** → Python 3.11 →
   (leave paths) → **Next** → **Next** → **Done**.
7. In the same Web tab:
   - **Virtualenv**: `/home/<yourname>/knoprix/venv`
   - **ASGI application file**: `/home/<yourname>/knoprix/asgi.py`, application name: `application`
8. Click **Reload**.
9. **Test:** open `https://<yourname>.pythonanywhere.com/api/health` → you should
   see `{"status":"ok",...}`. The demo account + MSA project + documents are
   auto-seeded from `uploads/` on first start (login `demo@knoprix.io` /
   `Password123!`).

---

## ✅ Path B — Backend on Render (you have GitHub)

⚠️ Free tier **sleeps after 15 min idle** → first request after a break takes
30–60 s. Warm it up a couple of minutes before presenting (or open the URL once
early in your session).

### Step B1 — push to GitHub

1. Create a repo at https://github.com/new — name it `knoprix-v2-midreview`
   (private is fine).
2. In a terminal on your PC, run (this replaces the URL with YOUR username):
   ```bash
   cd C:/Users/tvssp/Downloads/knoprix-v2-midreview
   git remote add origin https://github.com/YOUR-USERNAME/knoprix-v2-midreview.git
   git branch -M main
   git push -u origin main
   ```
   (If it asks for a password, use a GitHub Personal Access Token — GitHub →
   Settings → Developer settings → Tokens → generate one with `repo` scope.)

### Step B2 — Render (with the included blueprint = ~2 clicks)

A `render.yaml` blueprint is already in the repo. So:

1. https://render.com → sign up (free, no card for the free plan).
2. **New** → **Blueprint** → connect your GitHub repo → it auto-detects
   `render.yaml` → **Apply**.
3. Wait for the deploy (~5 min). URL will be like
   `https://knoprix-midreview-api.onrender.com`.
4. **Environment tab** → edit `CORS_ORIGINS` to your real Netlify URL
   (`https://your-site.netlify.app`) → **Save** → **Deploy** (redeploy).
5. Test: `https://knoprix-midreview-api.onrender.com/api/health` →
   `{"status":"ok",...}`. Demo data (MSA + 7 documents) auto-seeds from the
   committed `uploads/` folder.

(Manual alternative: **New** → **Web Service** → connect repo → Root Directory
`backend` → Build `pip install -r requirements.txt` → Start
`uvicorn app.main:app --host 0.0.0.0 --port $PORT` → add the env vars.)

### ⚠️ Step B3 — REQUIRED: add the persistent database (`DATABASE_URL`)

Render's free tier uses an **ephemeral disk** — it wipes the local SQLite file
on every restart, silently deleting user accounts and uploaded documents
(exactly the "invalid email or password" login bug).

**Fix:** the backend now uses a persistent **Postgres** database when the
`DATABASE_URL` env var is set (Neon free tier works great —
https://console.neon.tech → create a project → copy the connection string).

1. **Render** → your service → **Environment** tab.
2. Add a new variable:
   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
   (your exact string from the Neon dashboard — it contains the password, so
   keep it private.)
3. **Save** → **Deploy** (redeploy). On first boot the backend creates the
   tables and seeds the demo account + documents into Postgres.
4. Accounts and documents now **survive restarts**.

> If `DATABASE_URL` is not set, the backend falls back to local SQLite — fine
> for development, but on Render free that data will disappear on restart.

---

## ✅ Frontend on Netlify (fixes your 404)

The 404 happens because the deployed folder had no `index.html` at the root.
The build output lives in `knoprix-v2-midreview/frontend/dist/`.

**Option 1 — drag & drop (quickest):**
1. Build with your backend URL baked in — in a terminal:
   ```bash
   cd knoprix-v2-midreview/frontend
   VITE_API_URL=https://knoprix-midreview-api.onrender.com npm run build
   ```
   (Use your real Render URL.)
2. In Netlify → **Add new site** → **Deploy manually** → drag the **contents**
   of `frontend/dist/` (the `index.html` + `assets/` + `pdf.worker.min.js`) into
   the upload zone. **This also fixes the 404 you saw** — `index.html` now sits
   at the root.

**Option 2 — Git-based (auto-build):**
1. Connect the repo in Netlify (root `netlify.toml` handles build: base
   `frontend`, command `npm run build`, publish `dist`).
2. Set env var `VITE_API_URL = https://knoprix-midreview-api.onrender.com`
   (Netlify → Site configuration → Environment variables) → redeploy.

**Test the demo:** open the Netlify URL → log in with `demo@knoprix.io` /
`Password123!` → the MSA project + documents auto-load.

---

## 🔍 If something doesn't work

- **Login fails / files don't load** → backend URL or CORS is wrong. Check
  `CORS_ORIGINS` on the backend includes the exact Netlify URL, and that the
  frontend was built with the correct `VITE_API_URL`.
- **PDFs don't render** → open DevTools (F12) → Console: if you see
  `pdf.worker` errors, the worker file didn't upload — `pdf.worker.min.js` must
  sit next to `index.html` in the deploy.
- **Backend 500s** → open `https://<backend>/api/health`; check PA's "Web → Error
  log" tab or Render's logs.
