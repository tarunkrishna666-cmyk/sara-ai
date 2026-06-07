# Authentication Testing

Run the API and web app, then verify the unified flow at `http://localhost:3001`.

## User registration

1. Enter a new email and select **Continue**.
2. Confirm the **Create account** screen shows the same email.
3. Create a password with at least 8 characters.
4. Confirm the app redirects to `/chat`.

## Returning user

1. Log out and enter the same email.
2. Confirm the **Welcome back** password screen appears.
3. Sign in and confirm the app redirects to `/chat`.

## Super admin

1. Set `SUPER_ADMIN_PASSWORD` in the API environment and run
   `python scripts/bootstrap_super_admin.py`.
2. Enter `tarunkrishn666@gmail.com` and the configured password.
3. Confirm successful authentication redirects to `/admin`.
4. Confirm the dashboard contains Dashboard, Users, Conversations, AI Brains,
   Rate Limits, Analytics, System Health, Logs, and Settings.

## Route protection

1. While logged out, open `/admin` and confirm it redirects to `/`.
2. While logged in as a regular user, open `/admin` and confirm it redirects to `/chat`.
3. Request `/api/admin/dashboard` without an admin session and confirm it returns `401`
   or `403`.
4. Try to request another user's conversation data and confirm it returns `403`.

## Automated checks

```powershell
cd apps/api
python -m unittest discover -s tests -v

cd ../web
npm run typecheck
npm run build
```
