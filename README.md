# sarA — Intelligent AI Assistant Platform

**Production-ready full-stack AI assistant with intelligent model routing, real-time streaming, and Progressive Web App support.**

A complete end-to-end solution combining FastAPI (Python backend), Next.js (React frontend), and multi-model AI orchestration (Groq, OpenRouter, Ollama) for intelligent conversation systems with user persistence and rate limiting.

**[→ Live Demo](https://sara-ai-web-six.vercel.app)** · **[Quick Start](#-quick-start)** · **[API Docs](#api)** · **[Contributing](#-contributing)**

---

## ✨ Key Features

- **Intelligent Routing** — Automatically selects optimal AI model based on query intent (chat, reasoning, coding, debugging)
- **Multi-Model Support** — Groq, OpenRouter, Ollama with intelligent fallback chain
- **Real-Time Streaming** — Server-Sent Events for live token streaming responses
- **User Persistence** — Per-user SQLite database with conversation history and memory
- **Response Caching** — Smart caching for identical requests to reduce latency
- **Progressive Web App** — Installable app with offline support, background sync, push notifications
- **Admin Dashboard** — User management, usage analytics, system monitoring
- **Rate Limiting** — Multi-layer IP and user-based rate limiting with audit logs
- **Production Ready** — Authentication, authorization, error handling, structured logging

---

## 📐 Architecture

```
sarA (Monorepo)
├── apps/
│   ├── api/                    # FastAPI Backend
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── db.py
│   │   │   ├── schema.sql
│   │   │   ├── services/
│   │   │   │   └── ai_router.py
│   │   │   ├── routes/
│   │   │   ├── models/
│   │   │   └── utils/
│   │   ├── tests/
│   │   ├── requirements.txt
│   │   ├── .env.example
│   │   └── data/
│   │       └── sara.db
│   │
│   └── web/                    # Next.js Frontend
│       ├── app/
│       ├── components/
│       ├── public/
│       ├── package.json
│       └── .env.example
│
├── README.md
├── .gitignore
└── package.json
```

---

## 🧠 Intelligent Routing System

sarA automatically routes queries to the most suitable AI model based on detected intent:

| Intent | Primary Model | Fallback 1 | Fallback 2 |
|--------|---------------|-----------|----------|
| Default Chat | Groq `llama-3.1-8b-instant` | OpenRouter OSS | Ollama |
| Complex Reasoning | Groq `llama-3.1-70b-versatile` | OpenRouter OSS | Ollama |
| Coding | OpenRouter `poolside/laguna-m.1:free` | Ollama | — |
| Debugging | OpenRouter `deepseek/deepseek-r1:free` | Ollama | — |

**Implementation**: `apps/api/app/services/ai_router.py`

Detection uses keyword matching: Debug words → `{bug, fix, debug, traceback, exception, crash}`, Code words → `{code, build, function, python, javascript, react...}`, Complexity triggers → `{complex, reason, analyze, architecture, design a system...}`

Requests maintain the last 10 messages for context. Identical requests with the same model/context are cached briefly in memory for performance.

---

## 🚀 Quick Start

### Prerequisites
- **Python** 3.9+
- **Node.js** 18+
- **npm** or **yarn**
- (Optional) **Ollama** for local model support

### Backend Setup

```bash
cd apps/api

# Create virtual environment
python -m venv .venv

# Activate (macOS/Linux)
source .venv/bin/activate
# OR Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```

**Configure `.env`**:
```env
# AI Provider Keys (set at least one)
GROQ_API_KEY=your_groq_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
OLLAMA_BASE_URL=http://localhost:11434

# Admin Setup (required for first login)
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=secure_password_min_8_chars
ADMIN_API_KEY=secure_api_key_min_32_chars

# Optional
DATABASE_PATH=./data/sara.db
```

**Run the API**:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at `http://localhost:8000`

**API Documentation**: Visit `http://localhost:8000/docs` (Swagger UI)

### Frontend Setup

```bash
cd apps/web

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

**Configure `.env.local`**:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Run the development server**:
```bash
npm run dev
```

Frontend will be available at `http://localhost:3001`

---

## 📱 Progressive Web App

sarA is installable as a PWA with full offline support:

**Features**:
- 📦 Installable manifest and app metadata
- 📴 Service worker with app-shell, runtime, and API caching
- 🔄 Background sync for offline message queuing
- 🔔 Web push notifications scaffolding
- 📱 iOS install guidance and offline screen

**Test PWA locally** (requires HTTPS in production):
```bash
npm run build
npm start
# Open Chrome DevTools → Application → Service Workers
```

See `apps/web/PWA_TESTING.md` for platform-specific testing.

---

## 🔌 API Endpoints

### Authentication

**Check account existence**:
```http
POST /api/auth/account
Content-Type: application/json

{"email":"user@example.com"}
```

**Register new account**:
```http
POST /api/auth/register
Content-Type: application/json

{"email":"user@example.com","password":"secure_password"}
```

**Sign in**:
```http
POST /api/auth/login
Content-Type: application/json

{"email":"user@example.com","password":"secure_password"}
```

### Chat — Non-Streaming

```http
POST /api/chat
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "userId":"user_id",
  "message":"What is artificial intelligence?"
}
```

**Response**:
```json
{
  "reply":"AI is a field of computer science...",
  "conversation":{...},
  "messages":[...]
}
```

### Chat — Real-Time Streaming

```http
POST /api/chat/stream
Accept: text/event-stream
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "userId":"user_id",
  "message":"Debug this Python error"
}
```

**Stream Events**:
- `ready` — Stream initialized
- `token` — Token received (streaming content)
- `final` — Stream complete
- `error` — Error occurred

**Example stream response**:
```
event: ready
data: {"conversation":{...},"user_message":{...}}

event: token
data: {"content":"The error occurs because"}

event: token
data: {"content":" undefined is not a function."}

event: final
data: {"reply":"...","conversation":{...},"messages":[...]}
```

Both endpoints store messages with strict user isolation. Admin endpoints provide usage tracking and conversation management.

---

## ⚙️ Configuration

### Environment Variables Reference

**Backend (`apps/api/.env`)**:

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | No* | API key for Groq (fast small/medium models) |
| `OPENROUTER_API_KEY` | No* | API key for OpenRouter (diverse model access) |
| `OLLAMA_BASE_URL` | No | URL for local Ollama (default: http://localhost:11434) |
| `SUPER_ADMIN_EMAIL` | Yes | Email for admin account (bootstrapped on startup) |
| `SUPER_ADMIN_PASSWORD` | Yes | Password for admin (min 8 chars) |
| `ADMIN_API_KEY` | Yes | API key for admin operations (min 32 chars) |
| `DATABASE_PATH` | No | SQLite database location (default: `./data/sara.db`) |

*At least one AI provider must be configured

**Frontend (`apps/web/.env.local`)**:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API URL |

---

## 🧪 Testing

**Run backend tests**:
```bash
cd apps/api
python -m unittest discover -s tests -v
```

---

## 🛡️ Security & Rate Limiting

sarA includes enterprise-grade rate limiting:

- **IP-based limiting** — Prevents abuse from single IPs
- **User-based limiting** — Per-user request quotas
- **Daily/Monthly tracking** — Usage analytics and enforcement
- **Structured responses** — HTTP 429 with retry headers
- **Audit logging** — All rate limit events logged
- **Admin dashboard** — View usage patterns and blocked requests

Details: See `apps/api/RATE_LIMITING.md`

---

## 🗺️ Roadmap

- [ ] Voice input/output support
- [ ] Vision/image analysis capabilities
- [ ] Custom knowledge base upload
- [ ] Multi-language support
- [ ] Team/workspace collaboration
- [ ] Advanced analytics dashboard
- [ ] Plugin system for custom workflows
- [ ] Mobile native apps (iOS/Android)
- [ ] Embedding/RAG capabilities
- [ ] Function calling for external APIs

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Commit changes**: `git commit -m "Add clear description of changes"`
4. **Push to branch**: `git push origin feature/your-feature-name`
5. **Open a Pull Request** with description of changes

**Guidelines**:
- Write clear commit messages
- Test your changes before submitting
- Update documentation if needed
- Follow existing code style

For major changes, please open an issue first to discuss your proposal.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

This project is licensed under the MIT License — see [LICENSE](./LICENSE) file for details.

---

## 📞 Support & Questions

- **Issues**: [GitHub Issues](https://github.com/tarunkrishna666-cmyk/chat-bot-ai-/issues)
- **Discussions**: [GitHub Discussions](https://github.com/tarunkrishna666-cmyk/chat-bot-ai-/discussions)
- **Email**: [your-email@example.com]

---

## 🔗 Links

- **Live Demo**: [sara-ai-web-six.vercel.app](https://sara-ai-web-six.vercel.app)
- **Author**: [@tarunkrishna666-cmyk](https://github.com/tarunkrishna666-cmyk)
- **GitHub**: [github.com/tarunkrishna666-cmyk/chat-bot-ai-](https://github.com/tarunkrishna666-cmyk/chat-bot-ai-)

---

**Built with ❤️ by Tarun Krishna**