# Admin Authentication Testing

sarA uses one login flow for all users. There is no separate admin login page.

## Required Environment

Copy `.env.example` to `.env` and set real secret values:

```dotenv
PORT=8001
SUPER_ADMIN_EMAIL=tarunkrishn666@gmail.com
SUPER_ADMIN_PASSWORD=<secure_password>
ADMIN_API_KEY=<secure_random_key_at_least_32_chars>
GROQ_API_KEY=
OPENROUTER_API_KEY=
```

The API refuses to start if `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, or
`ADMIN_API_KEY` is missing.

## Startup Bootstrap

Run the API:

```powershell
cd apps/api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

On startup the API creates or updates the configured super admin, assigns
`role = super_admin`, hashes the configured password with scrypt, and keeps the
account active.

## Manual Checks

1. Open the single login page in the web app.
2. Sign in as `tarunkrishn666@gmail.com`.
3. Confirm redirect to `/admin`.
4. Sign in as a regular user and confirm redirect to `/chat`.
5. Confirm regular users receive `403` from `/api/admin/dashboard`.
6. Confirm admin users can access dashboard, users, conversations, AI brains,
   analytics, logs, system health, and settings.
7. Confirm admin login/logout, user ban, user deletion, settings changes, and
   AI configuration changes appear in `/api/admin/logs`.

## Admin API Key

`ADMIN_API_KEY` is a server-to-server credential for `/api/admin/*` only:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8001/api/admin/dashboard `
  -Headers @{ "X-Admin-Api-Key" = "<ADMIN_API_KEY>" }
```

Do not expose this key in frontend browser code.

## Automated Checks

```powershell
cd apps/api
python -m unittest discover -s tests -v

cd ../web
npm run typecheck
npm run build
```
