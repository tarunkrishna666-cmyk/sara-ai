import asyncio
import json
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from typing import Any

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import db
from .auth import authenticate_token
from .services.ai_router import route_message


@dataclass(frozen=True)
class Limit:
    endpoint: str
    per_minute: int | None
    per_day: int


class RateLimitConfig:
    enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    anonymous_per_minute = int(os.getenv("RATE_LIMIT_ANON_PER_MINUTE", "10"))
    anonymous_per_hour = int(os.getenv("RATE_LIMIT_ANON_PER_HOUR", "50"))
    ip_ceiling_per_minute = int(os.getenv("RATE_LIMIT_IP_CEILING_PER_MINUTE", "120"))
    ip_ceiling_per_hour = int(os.getenv("RATE_LIMIT_IP_CEILING_PER_HOUR", "1000"))
    chat_per_minute = int(os.getenv("RATE_LIMIT_CHAT_PER_MINUTE", "20"))
    chat_per_day = int(os.getenv("RATE_LIMIT_CHAT_PER_DAY", "100"))
    code_per_minute = int(os.getenv("RATE_LIMIT_CODE_PER_MINUTE", "10"))
    code_per_day = int(os.getenv("RATE_LIMIT_CODE_PER_DAY", "30"))
    max_request_bytes = int(os.getenv("RATE_LIMIT_MAX_REQUEST_BYTES", str(25 * 1024 * 1024)))


class SlidingWindow:
    def __init__(self) -> None:
        self._entries: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def consume(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int, datetime]:
        now = time.time()
        cutoff = now - window_seconds
        async with self._lock:
            entries = self._entries[key]
            while entries and entries[0] <= cutoff:
                entries.popleft()
            if len(entries) >= limit:
                reset_at = entries[0] + window_seconds
                return False, 0, datetime.fromtimestamp(reset_at, timezone.utc)
            entries.append(now)
            remaining = max(0, limit - len(entries))
            reset_at = entries[0] + window_seconds
            return True, remaining, datetime.fromtimestamp(reset_at, timezone.utc)


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.windows = SlidingWindow()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not RateLimitConfig.enabled:
            await self.app(scope, receive, send)
            return

        method = scope["method"].upper()
        path = scope["path"]
        if method == "OPTIONS" or not _is_protected(method, path):
            await self.app(scope, receive, send)
            return

        headers = _headers(scope)
        try:
            content_length = int(headers.get("content-length", "0") or "0")
        except ValueError:
            content_length = 0
        if content_length > RateLimitConfig.max_request_bytes:
            response = JSONResponse(
                status_code=413,
                content={"error": "Request too large", "message": "The request exceeds the allowed size."},
            )
            await response(scope, receive, send)
            return

        payload: dict[str, Any] = {}
        if path in {"/api/chat", "/api/chat/stream"}:
            body, receive = await _read_body(receive)
            if len(body) > RateLimitConfig.max_request_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={
                        "error": "Request too large",
                        "message": "The request exceeds the allowed size.",
                    },
                )
                await response(scope, receive, send)
                return
            payload = _json_body(body)
        user = _authenticated_user(scope)
        user_id = user["id"] if user else None
        client_ip = _client_ip(scope)
        limit = _request_limit(path, payload)

        if user and user["role"] in {"admin", "super_admin"}:
            await self.app(scope, receive, send)
            return

        blocked = await self._check_ip_ceiling(client_ip, path)
        if blocked:
            await blocked(scope, receive, send)
            return

        if not user_id:
            blocked = await self._check_anonymous(client_ip, path)
            if blocked:
                await blocked(scope, receive, send)
                return
        else:
            blocked = await self._check_user(user_id, client_ip, limit)
            if blocked:
                await blocked(scope, receive, send)
                return

        await self.app(scope, receive, send)

    async def _check_ip_ceiling(self, client_ip: str, path: str) -> JSONResponse | None:
        checks = (
            ("ip-ceiling-minute", RateLimitConfig.ip_ceiling_per_minute, 60),
            ("ip-ceiling-hour", RateLimitConfig.ip_ceiling_per_hour, 3600),
        )
        for label, maximum, seconds in checks:
            allowed, remaining, reset_at = await self.windows.consume(
                f"{label}:{client_ip}", maximum, seconds
            )
            if not allowed:
                _record_blocked_request(None, client_ip, path, label)
                return _rate_limit_response(reset_at)
        return None

    async def _check_anonymous(self, client_ip: str, path: str) -> JSONResponse | None:
        checks = (
            ("ip-minute", RateLimitConfig.anonymous_per_minute, 60),
            ("ip-hour", RateLimitConfig.anonymous_per_hour, 3600),
        )
        for label, maximum, seconds in checks:
            allowed, remaining, reset_at = await self.windows.consume(
                f"{label}:{client_ip}", maximum, seconds
            )
            if not allowed:
                _record_blocked_request(None, client_ip, path, label)
                return _rate_limit_response(reset_at)
        return None

    async def _check_user(
        self, user_id: str, client_ip: str, limit: Limit
    ) -> JSONResponse | None:
        if limit.per_minute:
            allowed, remaining, reset_at = await self.windows.consume(
                f"user-minute:{user_id}:{limit.endpoint}", limit.per_minute, 60
            )
            if not allowed:
                _record_blocked_request(user_id, client_ip, limit.endpoint, "user-minute")
                return _rate_limit_response(reset_at)

        allowed, remaining, reset_at = db.consume_daily_usage(
            user_id, limit.endpoint, limit.per_day
        )
        if not allowed:
            _record_blocked_request(user_id, client_ip, limit.endpoint, "user-day")
            return _rate_limit_response(reset_at)
        return None


def _is_protected(method: str, path: str) -> bool:
    if method != "POST":
        return False
    protected = {
        "/api/login",
        "/api/register",
        "/api/auth/account",
        "/api/auth/login",
        "/api/auth/register",
        "/api/chat",
        "/api/chat/stream",
    }
    return path in protected or path.startswith("/api/ai/")


def _request_limit(path: str, payload: dict[str, Any]) -> Limit:
    if path in {"/api/chat", "/api/chat/stream"}:
        message = payload.get("message", "")
        intent = route_message(message).intent if isinstance(message, str) else "chat"
        if intent in {"coding", "debugging"}:
            return Limit("ai_code", RateLimitConfig.code_per_minute, RateLimitConfig.code_per_day)
        return Limit("chat", RateLimitConfig.chat_per_minute, RateLimitConfig.chat_per_day)
    return Limit("ai_api", RateLimitConfig.chat_per_minute, RateLimitConfig.chat_per_day)


async def _read_body(receive: Receive) -> tuple[bytes, Receive]:
    original_receive = receive
    chunks: list[bytes] = []
    more_body = True
    while more_body:
        message = await receive()
        chunks.append(message.get("body", b""))
        more_body = message.get("more_body", False)
    body = b"".join(chunks)
    sent = False

    async def replay() -> Message:
        nonlocal sent
        if sent:
            return await original_receive()
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return body, replay


def _json_body(body: bytes) -> dict[str, Any]:
    try:
        value = json.loads(body)
        return value if isinstance(value, dict) else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def _headers(scope: Scope) -> dict[str, str]:
    return {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in scope.get("headers", [])
    }


def _authenticated_user(scope: Scope) -> dict[str, Any] | None:
    headers = _headers(scope)
    authorization = headers.get("authorization", "")
    token = authorization.removeprefix("Bearer ").strip() if authorization.startswith("Bearer ") else ""
    if not token:
        cookie = SimpleCookie()
        cookie.load(headers.get("cookie", ""))
        token = cookie["sara_session"].value if "sara_session" in cookie else ""
    return authenticate_token(token) if token else None


def _client_ip(scope: Scope) -> str:
    headers = _headers(scope)
    if os.getenv("TRUST_PROXY_HEADERS", "false").lower() == "true":
        forwarded = headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    client = scope.get("client")
    return client[0] if client else "unknown"


def _rate_limit_response(reset_at: datetime) -> JSONResponse:
    retry_after = max(1, int((reset_at - datetime.now(timezone.utc)).total_seconds()))
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "message": "Please try again later.",
            "remaining_requests": 0,
            "reset_time": reset_at.isoformat(),
        },
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": reset_at.isoformat(),
        },
    )


def _record_blocked_request(
    user_id: str | None, client_ip: str, endpoint: str, reason: str
) -> None:
    try:
        db.record_blocked_request(user_id, client_ip, endpoint, reason)
    except Exception:
        # Enforcement must not depend on audit-log availability.
        return
