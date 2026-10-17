# Knoprix — Final Project

Knoprix is a document study workspace built with FastAPI, React, and Vite.
Users can organize, read, search, highlight, and bookmark study documents.
Its search and bookmark features demonstrate Trie, Inverted Index, Hash Table,
and Doubly Linked List data structures.

## Supported documents

PDF, PPTX, DOCX, TXT, MD, PNG, JPG/JPEG, and static SVG. Standalone images
are stored as originals without OCR; legacy `.ppt` files are unsupported.
See [`docs/upload-support-matrix.md`](docs/upload-support-matrix.md) for
validation and resource limits.

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

On Windows, activate with `.venv\Scripts\activate` instead. The backend uses
local SQLite and disk storage unless `DATABASE_URL` and all three
`OBJECT_STORAGE_*` settings are configured. Add random local JWT secrets and
`FIREBASE_PROJECT_ID` to `backend/.env` to enable Firebase authentication.
The Firebase web-app values belong in `frontend/.env.local`; start from
`frontend/.env.example` and replace its placeholders.

### Configuration

Production requires `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`FIREBASE_PROJECT_ID`, `DATABASE_URL`, and `CORS_ORIGINS`. Persistent document
storage also requires `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ENDPOINT`, and
`OBJECT_STORAGE_API_KEY` together. The Supabase service key is backend-only.
Set `APP_ENV=production` so startup rejects default or weak JWT secrets. Legacy
password sessions use 15-minute access tokens and rotating, seven-day maximum
HttpOnly refresh cookies; a first-party API origin or same-site proxy is needed
for reliable cookie behavior when hosting frontend and API separately.
The frontend requires the `VITE_FIREBASE_*` values from its Firebase web app;
`VITE_API_URL` points to the deployed API.

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` requests to the local backend.
Use Node.js 22.13 or later to build the frontend (required by PDF.js).
Firebase email/password registration and sign-in do not require email
verification. For safety, linking an existing unlinked Knoprix account by
email still requires a verified Firebase email.

### Optional local demo fixtures

Demo seeding is disabled by default and is restricted to SQLite without
Firebase configured. To import files from `backend/uploads/` into a local demo
project, set `ENABLE_DEMO_SEED=true` and a private `DEMO_PASSWORD` in
`backend/.env`, then start the backend. Never enable this for a hosted
deployment; the hosted database may contain real user data.

## Current limitations

Document chat sends only retrieved passages from user-owned documents with an
active AI grant to the selected provider. Live generation requires a key for
that provider. Server-side provider keys can be configured in `backend/.env`
using the names in `backend/.env.example`; NVIDIA is browser-only BYOK and is
never configured or forwarded through the backend.

### NVIDIA NIM (browser-only BYOK; temporarily unavailable)

NVIDIA's chat endpoint currently omits the CORS permission needed by the
Knoprix web origin. The browser therefore blocks direct requests, so NVIDIA is
disabled in AI Wing and Document Chat until NVIDIA allows browser requests.
Knoprix does not proxy NVIDIA keys through its backend. Previously saved
NVIDIA keys remain in browser storage and are not used.

NVIDIA controls trial availability, terms, and request limits; Knoprix does not
promise that NVIDIA usage is always free. Provider keys are stored in browser
local storage, which browser extensions can read. Local adapter tests do not
prove a provider key or account can generate a live answer. Gemini keys must
be restricted to the Gemini API or use Google's authorization-key format.

## Verification

From the project directory:

```bash
backend/.venv/bin/python backend/qa_firebase_auth.py
backend/.venv/bin/python backend/qa_search_batch.py
backend/.venv/bin/python backend/qa_file_formats.py
backend/.venv/bin/python backend/qa_storage_rest.py
backend/.venv/bin/python backend/qa_backlog_rag.py
npm --prefix frontend run build
```

The storage QA uses a local fake HTTP server; the other commands do not access
deployed services.
Live API and browser QA scripts require a test account via
`KNOPRIX_QA_EMAIL` and `KNOPRIX_QA_PASSWORD`; keep those values in the shell
environment, not in source files.

## Deployment

The intended beta architecture is Vercel (frontend), Render (FastAPI), and
Supabase (PostgreSQL and private Storage). See [`docs/DEPLOY.md`](docs/DEPLOY.md)
for environment setup and the Firebase configuration steps. Keep database
URLs, JWT secrets, and the Supabase Storage service key server-side.
