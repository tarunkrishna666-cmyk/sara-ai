# sarA Phase 1 Final Release Audit

Date: June 7, 2026

## Recommendation

**NO-GO for Monday beta as currently configured.**

Updated checklist score: **84 / 90**

This is a major improvement from **68 / 90**, but it does not meet the requested
**85+ / 90** target and still has cloud-provider blockers.

## Critical Blockers

1. `GROQ_API_KEY` is not configured, so live Groq tests cannot pass.
2. `OPENROUTER_API_KEY` is not configured, so live OpenRouter and live coding
   provider tests cannot pass.
3. Physical Android Chrome and iPhone Safari install tests were not performed.
   Browser-sized simulations passed, but real device install remains unverified.
4. Firefox is not installed on this machine, so Firefox testing is blocked.
5. Local Ollama fallback works, but the final live stream took about **14.9s**.
   That fails the "chat starts under 1 second" performance target for local-only
   operation.

## Fixed During Final Audit

- Configured and verified `SUPER_ADMIN_PASSWORD`; the verified password is in
  the local clipboard, not stored in the repo.
- Added API startup bootstrap support for `SUPER_ADMIN_PASSWORD`.
- Added Render persistent disk configuration for SQLite data.
- Added `SUPER_ADMIN_PASSWORD` to Render as a private env var.
- Fixed local production CORS for `localhost:3002` and `127.0.0.1:3002`.
- Fixed service-worker security by preventing authenticated API response caching.
- Fixed mobile auth-card width overflow.
- Fixed mobile PWA install-modal width overflow.
- Fixed offline PWA logo rendering by bypassing Next image optimization for
  local static logos.
- Added a live release audit harness:
  `apps/api/scripts/release_audit.py`.
- Added a CDP screenshot helper:
  `scripts/cdp_screenshot.mjs`.

## Verified Passes

- API health and database status.
- Super-admin login.
- Admin dashboard APIs:
  dashboard, users, conversations, brains, rate limits, analytics, system
  health, logs, and settings.
- Unauthenticated admin protection: `401`.
- Regular user admin denial: `403`.
- Duplicate email prevention: `409`.
- Cross-user data isolation: `403`.
- Session persistence and logout token revocation.
- Anonymous rate limiting with `429`.
- Ten simultaneous registrations: all `201`.
- Chat history persistence.
- Live Ollama fallback streaming.
- Backend regression suite: **18 tests passed**.
- Frontend typecheck and production build passed.
- Chrome desktop and Edge desktop visual checks passed.
- Android-size, iPhone-size, and tablet responsive simulations passed.
- PWA manifest, service worker, icons, install prompt, and offline shell passed.
- Post-fix API/frontend logs had no `400`, `5xx`, tracebacks, or frontend
  stderr errors in the final check window.

## Live API Harness Result

`apps/release-api-audit.json`

- Passed: **15 / 17**
- Failed:
  - Groq live configuration: not configured.
  - OpenRouter live configuration: not configured.

## Remaining Bugs

No reproducible local code bugs remain from the tested matrix.

The remaining failures are configuration/environment/device blockers:

- Missing Groq key.
- Missing OpenRouter key.
- Firefox unavailable.
- Physical Android/iPhone/Windows install checks not completed.
- Local Ollama response is too slow for the 1-second target.

## Go Criteria

Move to **GO** when all of these are true:

- Add valid `GROQ_API_KEY` and rerun `release_audit.py`.
- Add valid `OPENROUTER_API_KEY` and rerun `release_audit.py`.
- Install Firefox or test on a machine with Firefox.
- Run real Android Chrome and iPhone Safari PWA install tests.
- Confirm first-token performance under the beta target with Groq/OpenRouter
  enabled.

## Commands Used

```powershell
cd apps/api
python -m unittest discover -s tests -v
$env:SUPER_ADMIN_PASSWORD = Get-Clipboard
python scripts/release_audit.py

cd ../web
npm run typecheck
npm run build
npm run start -- -p 3002
```
