# Deploying Knoprix on Oracle Always Free

The recommended always-on beta architecture is:

```text
Cloudflare Pages or Netlify
        |
Oracle Always Free VM (Docker + FastAPI)
        |                 \
Neon PostgreSQL       Cloudflare R2
```

The backend keeps SQLite and local uploads for local development. In
production, `DATABASE_URL` selects Neon and the `OBJECT_STORAGE_*` variables
select Cloudflare R2. Never store `.env`, database URLs, or R2 keys in Git.

## 1. Create the external resources

Create these manually in their dashboards:

- An Oracle Always Free Ubuntu VM with a public IP.
- A Neon PostgreSQL database and connection string.
- A private Cloudflare R2 bucket and an R2 API token limited to that bucket.
- A frontend site on Cloudflare Pages or Netlify.

Account creation, card verification, DNS changes, and billing changes are not
performed by this guide.

## 2. Prepare the VM

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git docker.io docker-compose-plugin nginx
sudo systemctl enable --now docker nginx
sudo usermod -aG docker "$USER"
```

Log out and back in once after adding the Docker group. Configure the Oracle
security list and Ubuntu firewall to allow TCP `22`, `80`, and `443`; keep
port `8000` private.

## 3. Deploy the API

Copy the repository to the VM, create the secret environment file from
`backend/.env.example`, and fill in real values:

```bash
git clone <private-knoprix-repository-url>
cd knoprix-final-project
cp backend/.env.example backend/.env
chmod 600 backend/.env
docker compose -f docker-compose.oracle.yml up -d --build
curl http://127.0.0.1:8000/api/health
```

The R2 endpoint has the form
`https://<account-id>.r2.cloudflarestorage.com`. The R2 token must have only
the required bucket read/write/delete permissions.

## 4. Put HTTPS in front

Point a DNS record such as `api.example.com` to the VM public IP, then run:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

Set `CORS_ORIGINS=https://your-frontend-domain.example` in `backend/.env` and
restart the API after the frontend domain is known:

```bash
docker compose -f docker-compose.oracle.yml up -d
```

## 5. Deploy the frontend

Build with the public API origin:

```bash
cd frontend
VITE_API_URL=https://api.example.com npm run build
```

Publish `frontend/dist` through Cloudflare Pages or Netlify and use the exact
published origin in `CORS_ORIGINS`.

## Verification checklist

- `GET https://api.example.com/api/health` returns HTTP 200.
- Register and log in with a new account.
- Upload a PDF and a PPTX.
- Restart the API container and confirm the documents remain listed.
- Open the PDF and PPTX readers.
- Delete a document and confirm it disappears from R2 and the database.
- Confirm the browser console has no CORS or authentication errors.

## Rollback

The API image is rebuilt from the checked-out Git commit. To roll back:

```bash
git log --oneline -5
git checkout <known-good-commit>
docker compose -f docker-compose.oracle.yml up -d --build
```

Do not delete the Neon database or R2 bucket during rollback. They contain
user data and require a separate, explicit data-migration decision.
