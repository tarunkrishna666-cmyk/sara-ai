# sarA Phase 1 Launch Audit

Date: June 7, 2026

## Decision

**FIX BEFORE LAUNCH**

Verified score: **68 / 90 (75.6%)**

- Verified pass: 68
- Failed: 2
- Not yet verified on a live/device environment: 20

The implementation is substantially complete, but the 95% launch threshold has
not been demonstrated.

## Critical Blockers

1. The local `tarunkrishn666@gmail.com` record is active and has the
   `super_admin` role, but `password_set` is false. Set a private
   `SUPER_ADMIN_PASSWORD` and run `python scripts/bootstrap_super_admin.py`
   before testing the real admin login.
2. Live API/web servers were not running during the final check. Existing API
   logs contain prior `503`, `504`, and streaming `404` responses, so the
   "No API errors" item does not pass yet.

## Fixed During Audit

- Rate limiting now uses authenticated session identity instead of trusting a
  request-body `userId`.
- Admin and super-admin sessions now bypass user rate limits.
- Account lookup and registration now receive anonymous abuse protection.
- Streaming request replay no longer hangs SSE responses.
- Public registration can no longer claim pre-created admin or super-admin
  accounts.
- New admins receive a temporary password set by the super admin.
- The super-admin bootstrap script now runs from the documented command and can
  securely set `SUPER_ADMIN_PASSWORD`.
- Frontend `npm run typecheck` now generates Next route types first.
- Added regression coverage for password hashing, duplicate emails, sessions,
  logout, RBAC, route protection, identity spoofing, admin bypass, all admin
  data endpoints, chat persistence, streaming, and structured `429` responses.

## Verified Areas

- Unified login, account detection, registration, existing-user login, logout,
  and session persistence.
- Scrypt password hashing, duplicate prevention, default user role, and SQLite
  persistence.
- `user`, `admin`, and `super_admin` RBAC with `401`/`403` API protection.
- Admin dashboard sections and corresponding protected API endpoints.
- Chat creation, history, rename, delete, context, message persistence, and SSE
  streaming contract.
- AI chat/code/debug routing and fallback behavior using test providers.
- Database tables, user isolation, and persistent usage tracking.
- User limits, admin bypass, abuse protection, and structured `429` responses.
- Manifest, service worker, offline page, 18 PWA icons, and responsive CSS.
- Frontend production build and TypeScript checks.

## Not Yet Verified

- Live Groq, OpenRouter, and Ollama connectivity.
- Mobile, tablet, and desktop visual/browser behavior.
- Android, iPhone, and Windows PWA installation.
- Offline behavior in an installed production PWA.
- Chat-under-1-second, smooth live streaming, UI-under-2-seconds, and browser
  console cleanliness.
- Ten-account live test and final device matrix.

## Verification Commands

```powershell
cd apps/api
python -m unittest discover -s tests -v

cd ../web
npm run typecheck
npm run build
```

Final automated result:

- Backend: 17 tests passed.
- Frontend: typecheck passed.
- Frontend: production build passed.
