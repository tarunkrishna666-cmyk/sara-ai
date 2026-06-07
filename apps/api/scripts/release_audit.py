"""Run live Phase 1 API release checks against a running sarA API."""

import asyncio
import json
import os
import time
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv


BASE_URL = os.getenv("RELEASE_API_URL", "http://127.0.0.1:8001")
API_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(API_ROOT / ".env")

ADMIN_EMAIL = "tarunkrishn666@gmail.com"
ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD", "")
OUTPUT = Path(__file__).resolve().parents[2] / "release-api-audit.json"


class Audit:
    def __init__(self) -> None:
        self.results: list[dict] = []

    def record(self, name: str, passed: bool, detail: object = None) -> None:
        self.results.append({"name": name, "passed": passed, "detail": detail})
        print(f"{'PASS' if passed else 'FAIL'} {name}: {detail}")


async def request_json(
    client: httpx.AsyncClient, method: str, path: str, **kwargs
) -> tuple[int, object, float]:
    started = time.perf_counter()
    response = await client.request(method, path, **kwargs)
    elapsed = round((time.perf_counter() - started) * 1000)
    try:
        body: object = response.json()
    except ValueError:
        body = response.text
    return response.status_code, body, elapsed


async def main() -> None:
    audit = Audit()
    timeout = httpx.Timeout(240, connect=10)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as client:
        status, body, elapsed = await request_json(client, "GET", "/health")
        audit.record("API health", status == 200 and body == {"status": "ok"}, {"ms": elapsed})

        status, providers, elapsed = await request_json(client, "GET", "/api/status")
        audit.record("Database status", status == 200 and providers.get("database") == "online", providers)
        audit.record("Groq live configuration", providers.get("groq") == "online", providers.get("groq"))
        audit.record(
            "OpenRouter live configuration",
            providers.get("openrouter") == "online",
            providers.get("openrouter"),
        )
        audit.record(
            "Ollama live configuration",
            providers.get("ollama") == "configured",
            providers.get("ollama"),
        )

        status, admin_auth, _ = await request_json(
            client,
            "POST",
            "/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        audit.record(
            "Super-admin live login",
            status == 200
            and isinstance(admin_auth, dict)
            and admin_auth.get("user", {}).get("role") == "super_admin",
            status,
        )
        admin_headers = (
            {"Authorization": f"Bearer {admin_auth['access_token']}"}
            if status == 200 and isinstance(admin_auth, dict)
            else {}
        )

        admin_endpoints = [
            "dashboard",
            "users",
            "conversations",
            "brains",
            "rate-limits",
            "analytics",
            "system-health",
            "logs",
            "settings",
        ]
        admin_codes = {}
        for endpoint in admin_endpoints:
            code, _, _ = await request_json(
                client, "GET", f"/api/admin/{endpoint}", headers=admin_headers
            )
            admin_codes[endpoint] = code
        audit.record(
            "Admin dashboard APIs",
            bool(admin_headers) and all(code == 200 for code in admin_codes.values()),
            admin_codes,
        )

        async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as anonymous:
            denied_code, _, _ = await request_json(
                anonymous, "GET", "/api/admin/dashboard"
            )
        audit.record("Unauthenticated admin protection", denied_code == 403, denied_code)

        suffix = uuid.uuid4().hex[:10]

        async def create_user(index: int) -> dict:
            local = httpx.AsyncClient(base_url=BASE_URL, timeout=timeout)
            email = f"release-{suffix}-{index}@example.com"
            try:
                code, auth, duration = await request_json(
                    local,
                    "POST",
                    "/api/auth/register",
                    headers={"X-Forwarded-For": f"198.51.100.{index + 1}"},
                    json={"email": email, "password": f"Release-password-{index}"},
                )
                return {
                    "code": code,
                    "auth": auth,
                    "duration": duration,
                    "email": email,
                }
            finally:
                await local.aclose()

        started = time.perf_counter()
        users = await asyncio.gather(*(create_user(index) for index in range(10)))
        total_ms = round((time.perf_counter() - started) * 1000)
        audit.record(
            "10 simultaneous user registrations",
            all(item["code"] == 201 for item in users),
            {"total_ms": total_ms, "codes": [item["code"] for item in users]},
        )

        first = users[0]
        first_auth = first["auth"]
        first_user = first_auth["user"]
        first_headers = {"Authorization": f"Bearer {first_auth['access_token']}"}
        audit.record(
            "Default role is user",
            first_user["role"] == "user",
            first_user["role"],
        )
        regular_admin_code, _, _ = await request_json(
            client, "GET", "/api/admin/dashboard", headers=first_headers
        )
        audit.record("Regular user admin denial", regular_admin_code == 403, regular_admin_code)

        duplicate_code, _, _ = await request_json(
            client,
            "POST",
            "/api/auth/register",
            json={"email": first["email"].upper(), "password": "Duplicate-password"},
        )
        audit.record("Duplicate email prevention", duplicate_code == 409, duplicate_code)

        other_user = users[1]["auth"]["user"]
        isolation_code, _, _ = await request_json(
            client,
            "GET",
            f"/api/users/{other_user['id']}/conversations",
            headers=first_headers,
        )
        audit.record("Cross-user data isolation", isolation_code == 403, isolation_code)

        stream_code, stream_body, stream_ms = await request_json(
            client,
            "POST",
            "/api/chat/stream",
            headers={**first_headers, "Accept": "text/event-stream"},
            json={
                "userId": first_user["id"],
                "message": f"Reply with exactly RELEASE_OK_{suffix}",
            },
        )
        stream_text = str(stream_body)
        audit.record(
            "Live Ollama fallback streaming",
            stream_code == 200
            and "event: token" in stream_text
            and "event: final" in stream_text,
            {"status": stream_code, "ms": stream_ms},
        )

        history_code, conversations, _ = await request_json(
            client,
            "GET",
            f"/api/users/{first_user['id']}/conversations",
            headers=first_headers,
        )
        conversation_id = conversations[0]["id"] if history_code == 200 and conversations else None
        messages_code, messages, _ = await request_json(
            client,
            "GET",
            f"/api/conversations/{conversation_id}/messages?user_id={first_user['id']}",
            headers=first_headers,
        )
        audit.record(
            "Chat history persistence",
            history_code == 200 and messages_code == 200 and len(messages) >= 2,
            {"conversations": len(conversations), "messages": len(messages) if isinstance(messages, list) else 0},
        )

        me_code, _, _ = await request_json(client, "GET", "/api/auth/me", headers=first_headers)
        logout_code, _, _ = await request_json(
            client, "POST", "/api/auth/logout", headers=first_headers
        )
        after_logout, _, _ = await request_json(client, "GET", "/api/auth/me", headers=first_headers)
        audit.record(
            "Session and logout",
            me_code == 200 and logout_code == 204 and after_logout == 401,
            {"before": me_code, "logout": logout_code, "after": after_logout},
        )

        rate_codes = []
        for index in range(12):
            code, _, _ = await request_json(
                client,
                "POST",
                "/api/auth/account",
                headers={"X-Forwarded-For": "203.0.113.10"},
                json={"email": f"rate-{suffix}-{index}@example.com"},
            )
            rate_codes.append(code)
        audit.record("Anonymous rate limiting", 429 in rate_codes, rate_codes)

    summary = {
        "passed": sum(item["passed"] for item in audit.results),
        "total": len(audit.results),
        "results": audit.results,
    }
    OUTPUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"passed": summary["passed"], "total": summary["total"], "output": str(OUTPUT)}))


if __name__ == "__main__":
    asyncio.run(main())
