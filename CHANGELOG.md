# Changelog

All notable changes to sarA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-06-07

### Added
- Initial release of sarA AI Assistant platform
- Intelligent multi-model routing (Groq, OpenRouter, Ollama)
- Real-time streaming chat with Server-Sent Events
- Per-user SQLite persistence with conversation history
- Response caching for improved performance
- Progressive Web App with offline support
- Admin dashboard with user management and analytics
- Multi-layer rate limiting (IP and user-based)
- Authentication with password hashing and session management
- Comprehensive API documentation
- Live demo at https://sara-ai-web-six.vercel.app

### Technical Stack
- **Backend**: FastAPI 0.115.6, Uvicorn, Python 3.9+
- **Frontend**: Next.js 15.0.4, React 19, TypeScript 5.7
- **Database**: SQLite with schema migrations
- **Deployment**: Vercel (frontend), Render (backend)

### Fixed
- CORS configuration for multiple deployment URLs
- Service worker caching of authenticated responses
- Mobile layout overflow issues (auth card, install modal)
- Offline PWA logo rendering with static assets
- Production security cookie settings

### Known Issues
- Groq and OpenRouter API keys not configured in demo
- Local Ollama fallback response time (~14.9s) exceeds 1-second target
- Firefox testing not completed
- Physical device PWA install testing (iOS/Android) pending

---

## Planned Features

### Voice Support
- [ ] Voice input transcription
- [ ] Text-to-speech output
- [ ] Voice command routing

### Vision Capabilities
- [ ] Image upload and analysis
- [ ] Document OCR
- [ ] Visual reasoning

### Knowledge Management
- [ ] Custom knowledge base upload
- [ ] Vector embeddings and RAG
- [ ] Knowledge organization

### Multi-Language
- [ ] Language detection
- [ ] Multi-language support
- [ ] Translation capabilities

### Team Features
- [ ] Multi-user workspaces
- [ ] Shared conversations
- [ ] Team invitations
- [ ] Role-based permissions

### Advanced Analytics
- [ ] Detailed usage dashboards
- [ ] Cost tracking per AI provider
- [ ] Model performance metrics
- [ ] User engagement analytics

### Developer Features
- [ ] Plugin system for custom workflows
- [ ] Webhook support
- [ ] Function calling for external APIs
- [ ] Structured output modes

### Mobile
- [ ] Native iOS app
- [ ] Native Android app
- [ ] Offline-first synchronization

---

## Version History

### [0.1.0] — June 7, 2026
- Initial public release

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on reporting bugs, suggesting features, and submitting pull requests.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.