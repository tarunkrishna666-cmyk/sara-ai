# sarA Rate Limiting

## Protected requests

All chat and future `/api/ai/*` endpoints are protected.
Login is also IP-limited to prevent bots from creating unlimited identities.

| Request class | Minute limit | Daily limit |
| --- | ---: | ---: |
| Normal chat | 20 per user | 100 per user |
| Coding/debugging chat | 10 per user | 30 per user |
| Other/future AI APIs | 20 per user | 100 per user |
| Anonymous IP | 10 per IP | 50 per IP/hour |

All protected traffic also has a high global IP ceiling of 120 requests/minute
and 1,000 requests/hour to reduce multi-account flooding.

The chat classifier uses the existing AI router, so `/api/chat` and
`/api/chat/stream` share the same `chat` or `ai_code` quota.

## Storage

- Minute/hour burst windows are held in memory for fast rejection.
- Daily and monthly usage is derived from SQLite `usage_tracking` rows.
- Blocked requests are stored in `rate_limit_events`.
- Daily increments use `BEGIN IMMEDIATE` for atomic quota enforcement.

For a multi-instance deployment, replace the in-memory sliding-window store with
Redis while retaining SQLite/Postgres usage reporting.

## Admin metrics

Sign in as an `admin` or `super_admin`, then request:

```http
GET /api/admin/usage
Authorization: Bearer your-session-token
```

The response includes total, daily, and monthly requests, blocked requests, top
users, and usage grouped by API class.

## 429 response

```json
{
  "error": "Rate limit exceeded",
  "message": "Please try again later.",
  "remaining_requests": 0,
  "reset_time": "2026-06-07T00:00:00+00:00"
}
```

Responses also include `Retry-After`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset`.

## Testing

```powershell
cd "D:\SARA chat boot\apps\api"
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

For manual testing, temporarily set `RATE_LIMIT_CHAT_PER_MINUTE=1`, restart the
API, log in, and send two normal chat requests within one minute. The second
request must return HTTP 429.
