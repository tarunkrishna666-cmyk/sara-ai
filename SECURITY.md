# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in sarA, please **do not** open a public GitHub issue.

Instead, please email your findings to: **[your-security-email@example.com]**

**Include in your report**:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

We will respond within 48 hours and work with you to resolve the issue.

## Security Measures

sarA includes several security features:

### Authentication & Authorization
- Password hashing using scrypt
- Session-based authentication with HTTP-only cookies
- Role-based access control (user, admin, super_admin)
- Token revocation on logout

### Rate Limiting
- IP-based rate limiting
- User-based rate limiting
- Per-endpoint quotas
- Audit logging of rate limit events

### Data Protection
- User isolation in all queries
- CORS configuration for allowed origins
- SQLite database with proper indexing
- Environment variable configuration for secrets

### Input Validation
- Pydantic schema validation
- Request size limits
- SQL parameter binding (no SQL injection)
- Type checking in TypeScript frontend

## Dependencies

We keep dependencies up to date and regularly review them for security issues.

**Key dependencies**:
- **FastAPI** — Latest stable version
- **Next.js** — Latest stable version
- **Pydantic** — Data validation
- **SQLite** — Database

Run `pip audit` and `npm audit` to check for known vulnerabilities:

```bash
# Backend
cd apps/api
pip audit

# Frontend
cd apps/web
npm audit
```

## Best Practices

When using sarA:

1. **Never commit `.env` files** — Use `.env.example` with placeholders
2. **Use strong passwords** — Minimum 8 characters for `SUPER_ADMIN_PASSWORD`
3. **Secure API keys** — Keep `GROQ_API_KEY`, `OPENROUTER_API_KEY` private
4. **Use HTTPS in production** — Required for cookie security and PWA
5. **Set secure admin credentials** — Change defaults before deployment
6. **Review rate limiting settings** — Adjust based on your use case
7. **Monitor audit logs** — Check `/api/admin/logs` regularly
8. **Keep software updated** — Update dependencies regularly

## Compliance

- **User data isolation** — Per-user encryption and access control
- **Audit logging** — All admin actions logged
- **Rate limiting** — Prevents abuse and DoS attacks
- **Error handling** — No sensitive info in error messages

## Disclosure Timeline

For security vulnerabilities:

1. **Day 0**: Vulnerability reported
2. **Within 48 hours**: Initial response
3. **Within 7 days**: Fix developed and tested
4. **Within 14 days**: Patch released
5. **Public disclosure**: After patch is available

## Known Limitations

- SQLite is suitable for small to medium deployments; use PostgreSQL for production at scale
- Rate limiting is IP-based; behind proxies may require `TRUST_PROXY_HEADERS`
- PWA offline support is limited to cached conversations

## Questions?

For security-related questions (non-vulnerability):
- Open a GitHub Discussion
- Email [your-email@example.com]

Thank you for helping keep sarA secure!