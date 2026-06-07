# sarA AI Assistant

Production-ready FastAPI + Next.js starter for a routed AI assistant with streaming,
per-user SQLite memory, response caching, cloud brains, and local fallback.

## AI Routing

sarA calls one model at a time:

| Intent | Primary model | Fallback |
| --- | --- | --- |
| Default chat | Groq `llama-3.1-8b-instant` | OpenRouter GPT OSS, then Ollama |
| Complex reasoning | Groq `llama-3.1-70b-versatile` | OpenRouter GPT OSS, then Ollama |
| Coding | OpenRouter `poolside/laguna-m.1:free` | Ollama |
| Debugging | OpenRouter `deepseek/deepseek-r1:free` | Ollama |

Routing is implemented in `apps/api/app/services/ai_router.py`. Provider clients are
kept alive and reused. Requests use only the last 10 messages, and repeated requests
with identical model/context are cached briefly in memory.

## Backend Setup

```powershell
cd apps/api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set at least one cloud key in `.env`:

```dotenv
GROQ_API_KEY=your_groq_key
OPENROUTER_API_KEY=your_openrouter_key
OLLAMA_BASE_URL=http://localhost:11434
```

For local fallback, install Ollama and pull a supported model:

```powershell
ollama pull qwen3
```

Run the API:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Before the first admin login, set a private `SUPER_ADMIN_PASSWORD` with at least
8 characters plus a private `ADMIN_API_KEY` with at least 32 characters. The API
validates `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and `ADMIN_API_KEY` on
startup, then bootstraps the configured super admin automatically. Privileged
accounts cannot be claimed through public registration.

The SQLite database is created at `apps/api/data/sara.db`. The standalone schema is
in `apps/api/schema.sql`; runtime migrations are idempotently applied by `app/db.py`.

## Frontend Setup

```powershell
cd apps/web
npm install
Copy-Item .env.example .env.local
npm run dev
```

The frontend uses `POST /api/chat/stream` and renders each SSE `token` event as it
arrives. It defaults to `http://localhost:8000` for the API.

The sarA workspace includes responsive Chat, Dashboard, Memory, History, and
Settings views. Conversation rename/delete controls and the brain status panel
use the user-scoped backend management endpoints.

## PWA

The frontend is installable as a Progressive Web App. It includes:

- A standalone manifest and standard/maskable icon sets.
- A versioned service worker with app-shell, runtime, and API caching.
- An offline screen, reconnect banner, install prompt, and iOS install guidance.
- Device-cached conversations and messages.
- Background sync and web-push notification scaffolding.

Use a production HTTPS build for installability and Lighthouse testing. See
`apps/web/PWA_TESTING.md` for the platform checklist.

For the current local setup, run the API on port `8001` to match
`apps/web/.env.local`:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

## API

Check whether an account exists, then register or sign in:

```http
POST /api/auth/account
Content-Type: application/json

{"email":"demo@example.com"}
```

```http
POST /api/auth/register
Content-Type: application/json

{"email":"demo@example.com","password":"your-password"}
```

Non-streaming request:

```http
POST /api/chat
Content-Type: application/json

{"userId":"USER_ID","message":"Hello sarA"}
```

Streaming request:

```http
POST /api/chat/stream
Accept: text/event-stream
Content-Type: application/json

{"userId":"USER_ID","message":"Debug this Python error"}
```

The stream emits `ready`, `token`, `final`, or `error` SSE events. Both endpoints
store every user message and successful assistant response with strict user
isolation.

## Tests

```powershell
cd apps/api
python -m unittest discover -s tests -v
```

## Rate Limiting

The API includes layered IP and user rate limiting, persistent daily/monthly
usage tracking, structured HTTP 429 responses, blocked-request auditing, and an
admin usage endpoint. See `apps/api/RATE_LIMITING.md`.
