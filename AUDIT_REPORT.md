# sarA Codebase Audit Report

Date: June 7, 2026

## 1. Removed Features

The repository was audited for Warm AI and document/file conversion features.
No implemented conversion pages, API handlers, UI components, settings panels,
admin panels, or conversion database tables existed.

Removed remaining conversion-related scaffolding:

- AI PPT generator route protection reference.
- PDF to PPT route protection reference.
- PDF to Word route protection reference.
- Image to PDF route protection reference.
- Generic generate-route protection intended for conversion tools.
- File-conversion daily quota configuration.
- File-conversion rate-limit category.
- File-conversion documentation and quota table entry.
- Stale generated TypeScript build metadata.

A clean source-only audit found zero remaining targeted Warm AI or conversion
references.

## 2. Modified Files

- `apps/api/app/rate_limit.py`
  - Removed conversion endpoint classifications, quotas, and route references.
  - Restricted protected application routes to authentication, chat, streaming
    chat, and future `/api/ai/*` endpoints.
- `apps/api/.env.example`
  - Removed the file-conversion quota environment variable.
- `apps/api/RATE_LIMITING.md`
  - Removed conversion protection and quota documentation.
- `apps/web/tsconfig.tsbuildinfo`
  - Removed stale generated build metadata.
- `AUDIT_REPORT.md`
  - Added this audit and architecture report.

## 3. Remaining sarA Architecture

### Backend

- FastAPI application.
- User login and per-user accounts.
- Conversation creation, rename, deletion, history, and messages.
- Non-streaming and SSE streaming AI chat.
- AI intent routing for normal chat, coding, debugging, and complex reasoning.
- Groq, OpenRouter, and Ollama providers with fallback routing.
- Response caching.
- IP and user rate limiting.
- Persistent usage tracking and blocked-request auditing.
- Admin usage dashboard API.

### Backend Routes

- `GET /health`
- `GET /api/status`
- `GET /api/admin/usage`
- `POST /api/auth/login`
- `GET /api/users/{user_id}/conversations`
- `POST /api/users/{user_id}/conversations`
- `PATCH /api/conversations/{conversation_id}`
- `DELETE /api/conversations/{conversation_id}`
- `GET /api/conversations/{conversation_id}/messages`
- `POST /api/chat`
- `POST /api/chat/stream`

### Database Tables

- `users`
- `conversations`
- `messages`
- `chat_history`
- `usage_tracking`
- `rate_limit_events`

### Frontend

- Next.js 15, TypeScript, and Tailwind CSS.
- Responsive mobile, tablet, laptop, desktop, and large-screen experience.
- Chat, dashboard, memory, history, and settings views.
- Streaming responses, markdown, code blocks, syntax highlighting, and copy
  controls.
- Conversation search, rename, and deletion.
- Light, dark, and system themes.
- AI provider and database status.
- Admin-facing usage data support through the protected backend endpoint.

### PWA

- Installable web app manifest.
- Standard and maskable icons.
- Service worker and versioned caches.
- Offline UI shell and device-cached conversations.
- Install prompt and iOS installation guidance.
- Background sync and push-notification scaffolding.

sarA now focuses only on AI chat, coding, debugging, memory, history, accounts,
administration, AI provider routing, PWA installation, and responsive native-like
experiences.
