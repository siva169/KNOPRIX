# Deploying Knoprix on Render, Vercel, and Supabase

The beta architecture is:

```text
Vercel
    |
Render FastAPI
    |
Supabase PostgreSQL + private Supabase Storage bucket
```

Render's local filesystem is ephemeral, so production must use Supabase
PostgreSQL for application data and Supabase Storage for uploaded documents.
Never commit database URLs, S3 keys, JWT secrets, or a `.env` file.

## 1. Confirm Supabase resources

Create or verify:

- A Supabase PostgreSQL project.
- A private Storage bucket named `knoprix-documents`.
- The `service_role` API secret from **Project Settings → API**.

The backend uses Supabase's **native Storage REST API** (`/storage/v1/object/...`)
with the project URL:

```text
https://<project-ref>.supabase.co
```

The `service_role` secret bypasses Storage RLS and must remain server-only.
Do not place it in Vercel or frontend code.

## 2. Create the Render service

In Render:

1. Choose **New → Blueprint** and connect the Knoprix repository.
2. Use `knoprix-final-project/render.yaml` if the repository contains the
   project as a subdirectory, or set the service root to
   `knoprix-final-project/backend`.
3. Confirm the service runs:

```text
Build: pip install -r requirements.txt
Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

In **Render → Environment**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL URL with `sslmode=require` |
| `OBJECT_STORAGE_BUCKET` | `knoprix-documents` |
| `OBJECT_STORAGE_ENDPOINT` | Supabase project URL (`https://<ref>.supabase.co`) |
| `OBJECT_STORAGE_API_KEY` | Supabase `service_role` secret |
| `CORS_ORIGINS` | `https://knoprix.vercel.app` (no trailing slash) |

Render generates `JWT_SECRET` and `JWT_REFRESH_SECRET` from the blueprint.
Never paste secret values into `render.yaml` or Git.
`ENABLE_DEMO_SEED` is explicitly disabled in the blueprint. Do not enable
local demo seeding against hosted databases or real user data.

## 3. Deploy the Vercel frontend

In Vercel:

1. Import the Knoprix repository.
2. Set the root directory to `knoprix-final-project/frontend`.
3. Use:

```text
Build command: npm run build
Output directory: dist
```

Add this frontend environment variable:

```text
VITE_API_URL=https://<render-service>.onrender.com
```

### Firebase email/password authentication

In Firebase project `knoprix-a647`:

1. Enable **Email/Password** under **Authentication → Sign-in method**.
2. Add `knoprix.vercel.app` under **Authentication → Settings → Authorized domains**.
3. In Render, set `FIREBASE_PROJECT_ID=knoprix-a647`.
4. In Vercel, set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` from the Firebase
   web app configuration, then redeploy the frontend.

The web app configuration is public client configuration; do not add a
Firebase service-account key to the frontend. The backend verifies Firebase
ID tokens against Google's signing keys and requires a verified email.
Existing Knoprix users are linked by verified email without changing their
user ID or project records.

If the production Vercel domain changes, update Render's `CORS_ORIGINS` to the
new exact origin (without a trailing slash) and redeploy the API.

## 4. Verification checklist

- `GET /api/health` returns HTTP 200 from Render.
- Register and log in with a new account.
- Upload a PDF and a PPTX.
- Restart the Render service and confirm the documents remain listed.
- Open the PDF and PPTX readers.
- Delete a document and confirm it disappears from both the database and
  `knoprix-documents`.
- Confirm the browser has no CORS or authentication errors.
- Confirm no Supabase secret appears in Vercel environment variables or
  frontend bundles.

## Rollback

Rollback by redeploying a known-good local Git commit in Render. Do not delete
the Supabase project, database, or Storage bucket during an application
rollback; those contain user data and require a separate migration decision.
