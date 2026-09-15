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
- Supabase Storage S3 credentials generated under **Storage → Settings → S3
  Connection**.

Use the project-region value shown by Supabase. For the current Tokyo project,
that is `ap-northeast-1`. The S3 endpoint uses this shape:

```text
https://<project-ref>.storage.supabase.co/storage/v1/s3
```

S3 credentials bypass Storage RLS and must remain server-only. Do not place
them in Vercel or frontend code.

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
| `OBJECT_STORAGE_ENDPOINT` | Supabase S3 endpoint |
| `OBJECT_STORAGE_ACCESS_KEY` | Supabase S3 Access Key ID |
| `OBJECT_STORAGE_SECRET_KEY` | Supabase S3 Secret Access Key |
| `OBJECT_STORAGE_REGION` | `ap-northeast-1` |
| `CORS_ORIGINS` | Final Vercel origin, without a trailing slash |

Render generates `JWT_SECRET` and `JWT_REFRESH_SECRET` from the blueprint.
Never paste secret values into `render.yaml` or Git.

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

After Vercel provides the final domain, update Render's `CORS_ORIGINS` to that
exact origin and redeploy the API.

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
