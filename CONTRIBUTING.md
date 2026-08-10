# Contributing to sarA

Thank you for your interest in contributing to sarA! We appreciate your help in making this project better.

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive environment for all contributors.

## Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/your-username/chat-bot-ai-.git
cd chat-bot-ai-
git remote add upstream https://github.com/tarunkrishna666-cmyk/chat-bot-ai-.git
```

### 2. Set Up Development Environment

**Backend**:
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
```

**Frontend**:
```bash
cd apps/web
npm install
cp .env.example .env.local
```

### 3. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `feature/add-voice-support`
- `fix/streaming-timeout-issue`
- `docs/update-api-docs`

## Development Workflow

### Running Locally

**Terminal 1 - Backend**:
```bash
cd apps/api
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend**:
```bash
cd apps/web
npm run dev
```

Access at `http://localhost:3001`

### Testing

**Backend tests**:
```bash
cd apps/api
python -m unittest discover -s tests -v
```

**Frontend typecheck**:
```bash
cd apps/web
npm run typecheck
```

### Code Style

- **Python**: Follow PEP 8 conventions
- **JavaScript/TypeScript**: Follow existing patterns in the codebase
- **Commits**: Use clear, descriptive messages

Example:
```
git commit -m "Add voice input support to chat interface"
git commit -m "Fix: Prevent duplicate messages in streaming response"
git commit -m "Docs: Update API rate limiting documentation"
```

## Submitting Changes

### 1. Push Your Branch

```bash
git push origin feature/your-feature-name
```

### 2. Open a Pull Request

- Provide a clear title and description
- Link any related issues (e.g., "Closes #123")
- Explain what your changes do and why
- Include any testing information

### 3. Code Review

- A maintainer will review your PR
- Address any feedback or suggestions
- Once approved, your changes will be merged

## Reporting Issues

If you find a bug or have a suggestion, please open a GitHub issue with:

- **Title**: Clear, concise description
- **Description**: Detailed explanation of the issue
- **Steps to reproduce**: For bugs, step-by-step reproduction
- **Expected vs actual behavior**: What you expected vs what happened
- **Environment**: Python version, Node version, OS, etc.

## Security

If you discover a security vulnerability, please email [security-contact] instead of opening a public issue.

Please do not disclose the vulnerability publicly until it has been addressed.

## Project Structure

```
sarA/
├── apps/api/          # FastAPI backend
├── apps/web/          # Next.js frontend
├── README.md          # Main documentation
├── CONTRIBUTING.md    # This file
├── LICENSE            # MIT License
└── .gitignore         # Git ignore rules
```

## Documentation

If your change affects functionality, please update relevant documentation:

- `README.md` — Main project README
- `apps/api/RATE_LIMITING.md` — Rate limiting details
- `apps/web/PWA_TESTING.md` — PWA testing guide
- Inline code comments for complex logic

## Questions?

- Open a GitHub Discussion
- Check existing documentation
- Ask in the PR comments

Thank you for contributing!