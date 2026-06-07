import os
import asyncio
import tempfile
import unittest
from collections.abc import AsyncIterator

os.environ.setdefault("SUPER_ADMIN_EMAIL", "tarunkrishn666@gmail.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "Test-super-admin-password")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-api-key-with-32-characters")

from fastapi.testclient import TestClient

from app import db
from app import main as main_module
from app.services.ai_router import Brain, route_message
from app.services.base import AIServiceError, ProviderRequestError
from app.services.chat_service import RoutedChatService
from app.rate_limit import RateLimitConfig


class FakeProvider:
    def __init__(self, chunks: list[str] | None = None, fail: bool = False) -> None:
        self.chunks = chunks or []
        self.fail = fail
        self.calls = 0

    async def close(self) -> None:
        return None

    async def stream(
        self, model: str, messages: list[dict[str, str]]
    ) -> AsyncIterator[str]:
        self.calls += 1
        if self.fail:
            raise ProviderRequestError("provider failed")
        for chunk in self.chunks:
            yield chunk


class SlowProvider(FakeProvider):
    async def stream(
        self, model: str, messages: list[dict[str, str]]
    ) -> AsyncIterator[str]:
        self.calls += 1
        await asyncio.sleep(1)
        yield "late"


class FakeChatService:
    async def close(self) -> None:
        return None

    async def generate_reply(
        self, message: str, history: list[dict] | None = None
    ) -> str:
        return "Hello from sarA"

    async def stream_reply(
        self, message: str, history: list[dict] | None = None
    ) -> AsyncIterator[str]:
        yield "Hello "
        yield "from sarA"


class RouterTests(unittest.TestCase):
    def test_routes_debug_before_general_code(self) -> None:
        route = route_message("Fix this code bug")
        self.assertEqual(route.brain, Brain.OPENROUTER)
        self.assertEqual(route.model, "deepseek/deepseek-r1:free")

    def test_routes_code_to_openrouter(self) -> None:
        self.assertEqual(route_message("Build a function").model, "poolside/laguna-m.1:free")

    def test_routes_javascript_login_request_as_code(self) -> None:
        route = route_message("give the code for the login using js")
        self.assertEqual(route.intent, "coding")
        self.assertEqual(route.brain, Brain.OPENROUTER)

    def test_routes_complex_chat_to_large_groq(self) -> None:
        self.assertEqual(route_message("Analyze the architecture").model, "llama-3.1-70b-versatile")

    def test_routes_default_chat_to_fast_groq(self) -> None:
        self.assertEqual(route_message("Hello sarA").model, "llama-3.1-8b-instant")


class RoutedServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.service = RoutedChatService()

    async def asyncTearDown(self) -> None:
        await self.service.close()

    async def test_falls_back_without_calling_all_models(self) -> None:
        groq = FakeProvider(fail=True)
        openrouter = FakeProvider(chunks=["fallback"])
        ollama = FakeProvider(chunks=["local"])
        await self.service.close()
        self.service.providers = {
            Brain.GROQ: groq,
            Brain.OPENROUTER: openrouter,
            Brain.OLLAMA: ollama,
        }

        result = await self.service.generate_reply("Hello")

        self.assertEqual(result, "fallback")
        self.assertEqual(groq.calls, 1)
        self.assertEqual(openrouter.calls, 1)
        self.assertEqual(ollama.calls, 0)

    async def test_caches_same_context(self) -> None:
        groq = FakeProvider(chunks=["fast"])
        await self.service.providers[Brain.GROQ].close()
        self.service.providers[Brain.GROQ] = groq

        first = await self.service.generate_reply("Hello")
        second = await self.service.generate_reply("Hello")

        self.assertEqual(first, second)
        self.assertEqual(groq.calls, 1)

    async def test_allows_slow_normal_chat_to_complete(self) -> None:
        await self.service.close()
        self.service.providers = {
            Brain.GROQ: SlowProvider(),
            Brain.OPENROUTER: FakeProvider(),
            Brain.OLLAMA: FakeProvider(),
        }

        result = await self.service.generate_reply("Hello")

        self.assertEqual(result, "late")

    async def test_code_uses_longer_timeout(self) -> None:
        await self.service.close()
        self.service.providers = {
            Brain.GROQ: FakeProvider(),
            Brain.OPENROUTER: SlowProvider(),
            Brain.OLLAMA: FakeProvider(),
        }

        result = await self.service.generate_reply("Build a function")

        self.assertEqual(result, "late")


class DatabaseTests(unittest.TestCase):
    def test_recent_messages_are_user_isolated_and_limited(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "test.db")
            try:
                db.init_db()
                user = db.login_user("one@example.com", None)
                other = db.login_user("two@example.com", None)
                conversation = db.create_conversation(user["id"])
                other_conversation = db.create_conversation(other["id"])
                for index in range(12):
                    db.add_message(conversation["id"], user["id"], "user", str(index))
                db.add_message(other_conversation["id"], other["id"], "user", "private")

                messages = db.list_recent_messages(conversation["id"], user["id"])

                self.assertEqual(len(messages), 10)
                self.assertNotIn("private", {message["content"] for message in messages})
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path

    def test_daily_usage_limit_is_persisted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "usage.db")
            try:
                db.init_db()
                user = db.login_user("usage@example.com", None)
                self.assertTrue(db.consume_daily_usage(user["id"], "chat", 1)[0])
                allowed, remaining, reset_at = db.consume_daily_usage(user["id"], "chat", 1)
                self.assertFalse(allowed)
                self.assertEqual(remaining, 0)
                self.assertIsNotNone(reset_at)
                metrics = db.rate_limit_admin_metrics()
                self.assertEqual(metrics["total_requests"], 1)
                self.assertEqual(metrics["daily_requests"], 1)
                self.assertEqual(metrics["monthly_requests"], 1)
                self.assertEqual(metrics["api_usage"][0]["endpoint"], "chat")
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path


class ApiTests(unittest.TestCase):
    def test_chat_and_stream_contracts_persist_memory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            previous_service = main_module.chat_service
            os.environ["DB_PATH"] = os.path.join(temp_dir, "api.db")
            main_module.chat_service = FakeChatService()
            try:
                with TestClient(main_module.app) as client:
                    auth = client.post(
                        "/api/auth/register",
                        json={"email": "api@example.com", "password": "api-password"},
                    ).json()
                    user = auth["user"]
                    response = client.post(
                        "/api/chat",
                        json={"userId": user["id"], "message": "Hello"},
                    )
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["reply"], "Hello from sarA")

                    stream = client.post(
                        "/api/chat/stream",
                        json={"userId": user["id"], "message": "Hello again"},
                    )
                    self.assertIn("event: token", stream.text)
                    self.assertIn("event: final", stream.text)

                    conversation_id = response.json()["conversation"]["id"]
                    renamed = client.patch(
                        f"/api/conversations/{conversation_id}",
                        params={"user_id": user["id"]},
                        json={"title": "Renamed chat"},
                    )
                    self.assertEqual(renamed.status_code, 200)
                    self.assertEqual(renamed.json()["title"], "Renamed chat")

                    with db.connect() as conn:
                        count = conn.execute(
                            "SELECT COUNT(*) FROM chat_history WHERE user_id = ?",
                            (user["id"],),
                        ).fetchone()[0]
                    self.assertEqual(count, 2)

                    deleted = client.delete(
                        f"/api/conversations/{conversation_id}",
                        params={"user_id": user["id"]},
                    )
                    self.assertEqual(deleted.status_code, 204)
            finally:
                main_module.chat_service = previous_service
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path

    def test_chat_rate_limit_returns_structured_429(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            previous_service = main_module.chat_service
            previous_limit = RateLimitConfig.chat_per_minute
            os.environ["DB_PATH"] = os.path.join(temp_dir, "limited.db")
            main_module.chat_service = FakeChatService()
            RateLimitConfig.chat_per_minute = 1
            try:
                with TestClient(main_module.app) as client:
                    auth = client.post(
                        "/api/auth/register",
                        json={"email": "limited@example.com", "password": "limited-password"},
                    ).json()
                    user = auth["user"]
                    payload = {"userId": user["id"], "message": "Hello"}
                    self.assertEqual(client.post("/api/chat", json=payload).status_code, 200)
                    blocked = client.post("/api/chat", json=payload)
                    self.assertEqual(blocked.status_code, 429)
                    self.assertEqual(blocked.json()["error"], "Rate limit exceeded")
                    self.assertEqual(blocked.json()["remaining_requests"], 0)
                    self.assertIn("reset_time", blocked.json())
                    self.assertIn("Retry-After", blocked.headers)
            finally:
                RateLimitConfig.chat_per_minute = previous_limit
                main_module.chat_service = previous_service
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path


class AuthSecurityTests(unittest.TestCase):
    def test_startup_validation_rejects_missing_required_environment(self) -> None:
        previous_password = os.environ.pop("SUPER_ADMIN_PASSWORD", None)
        try:
            with self.assertRaisesRegex(
                RuntimeError,
                "SUPER_ADMIN_PASSWORD is missing from environment configuration.",
            ):
                main_module._validate_startup_environment()
        finally:
            if previous_password is not None:
                os.environ["SUPER_ADMIN_PASSWORD"] = previous_password

    def test_super_admin_password_bootstraps_from_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            previous_password = os.environ.get("SUPER_ADMIN_PASSWORD")
            previous_key = os.environ.get("ADMIN_API_KEY")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "startup-admin.db")
            os.environ["SUPER_ADMIN_PASSWORD"] = "Environment-admin-password"
            os.environ["ADMIN_API_KEY"] = "environment-admin-api-key-32-chars"
            try:
                with self.assertLogs("sara.startup", level="INFO") as logs:
                    with TestClient(main_module.app) as client:
                        signed_in = client.post(
                            "/api/auth/login",
                            json={
                                "email": "tarunkrishn666@gmail.com",
                                "password": "Environment-admin-password",
                            },
                        )
                        self.assertEqual(signed_in.status_code, 200)
                        self.assertEqual(signed_in.json()["user"]["role"], "super_admin")
                        self.assertEqual(signed_in.json()["redirect_to"], "/admin")
                        self.assertNotEqual(signed_in.json()["redirect_to"], "/chat")
                self.assertIn("Super admin created", "\n".join(logs.output))
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path
                if previous_password is None:
                    os.environ.pop("SUPER_ADMIN_PASSWORD", None)
                else:
                    os.environ["SUPER_ADMIN_PASSWORD"] = previous_password
                if previous_key is None:
                    os.environ.pop("ADMIN_API_KEY", None)
                else:
                    os.environ["ADMIN_API_KEY"] = previous_key

    def test_startup_forces_configured_email_to_super_admin(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            previous_password = os.environ.get("SUPER_ADMIN_PASSWORD")
            previous_key = os.environ.get("ADMIN_API_KEY")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "force-super-admin.db")
            os.environ["SUPER_ADMIN_PASSWORD"] = "Forced-super-admin-password"
            os.environ["ADMIN_API_KEY"] = "forced-admin-api-key-with-32-chars"
            try:
                db.init_db(ensure_super_admin=False)
                with db.connect() as conn:
                    conn.execute(
                        """
                        INSERT INTO users (
                          id, identifier, display_name, role, is_active,
                          password_hash, password_set
                        ) VALUES (?, ?, ?, 'user', 1, ?, 1)
                        """,
                        (
                            "demoted-super-admin",
                            "tarunkrishn666@gmail.com",
                            "Demoted Admin",
                            main_module.hash_password("old-password"),
                        ),
                    )

                with self.assertLogs("sara.startup", level="INFO") as logs:
                    with TestClient(main_module.app) as client:
                        signed_in = client.post(
                            "/api/auth/login",
                            json={
                                "email": "tarunkrishn666@gmail.com",
                                "password": "Forced-super-admin-password",
                            },
                        )
                        self.assertEqual(signed_in.status_code, 200)
                        self.assertEqual(signed_in.json()["user"]["role"], "super_admin")
                        self.assertEqual(signed_in.json()["redirect_to"], "/admin")
                        self.assertNotEqual(signed_in.json()["redirect_to"], "/chat")
                        self.assertEqual(
                            client.get("/api/admin/dashboard").status_code,
                            200,
                        )

                self.assertIn("Super admin verified", "\n".join(logs.output))
                self.assertEqual(
                    db.get_user_by_identifier("tarunkrishn666@gmail.com")["role"],
                    "super_admin",
                )
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path
                if previous_password is None:
                    os.environ.pop("SUPER_ADMIN_PASSWORD", None)
                else:
                    os.environ["SUPER_ADMIN_PASSWORD"] = previous_password
                if previous_key is None:
                    os.environ.pop("ADMIN_API_KEY", None)
                else:
                    os.environ["ADMIN_API_KEY"] = previous_key

    def test_registration_session_duplicate_and_admin_route_protection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "auth.db")
            try:
                with TestClient(main_module.app) as client:
                    registration = client.post(
                        "/api/auth/register",
                        json={"email": "user@example.com", "password": "secure-password"},
                    )
                    self.assertEqual(registration.status_code, 201)
                    user = registration.json()["user"]
                    self.assertEqual(user["role"], "user")
                    self.assertEqual(client.get("/api/auth/me").status_code, 200)
                    self.assertEqual(client.get("/api/admin/dashboard").status_code, 403)

                    with db.connect() as conn:
                        stored = conn.execute(
                            "SELECT password_hash FROM users WHERE id = ?", (user["id"],)
                        ).fetchone()["password_hash"]
                    self.assertTrue(stored.startswith("scrypt$"))
                    self.assertNotIn("secure-password", stored)

                    duplicate = client.post(
                        "/api/auth/register",
                        json={"email": "USER@example.com", "password": "another-password"},
                    )
                    self.assertEqual(duplicate.status_code, 409)

                    logout = client.post("/api/auth/logout")
                    self.assertEqual(logout.status_code, 204)
                    self.assertEqual(client.get("/api/auth/me").status_code, 401)
                    self.assertEqual(client.get("/api/admin/dashboard").status_code, 403)
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path

    def test_local_dev_auth_aliases_exist(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "aliases.db")
            try:
                with TestClient(main_module.app) as client:
                    registration = client.post(
                        "/api/register",
                        json={"email": "alias@example.com", "password": "alias-password"},
                    )
                    self.assertEqual(registration.status_code, 201)
                    signed_in = client.post(
                        "/api/login",
                        json={"email": "alias@example.com", "password": "alias-password"},
                    )
                    self.assertEqual(signed_in.status_code, 200)
                    self.assertEqual(client.post("/api/logout").status_code, 204)
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path

    def test_existing_email_cannot_create_second_account(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "one-email.db")
            try:
                db.init_db()
                db.login_user("reserved@example.com", None)
                with TestClient(main_module.app) as client:
                    lookup = client.post(
                        "/api/auth/account",
                        json={"email": "reserved@example.com"},
                    )
                    self.assertEqual(lookup.status_code, 200)
                    self.assertTrue(lookup.json()["exists"])
                    registration = client.post(
                        "/api/auth/register",
                        json={
                            "email": "reserved@example.com",
                            "password": "reserved-password",
                        },
                    )
                    self.assertEqual(registration.status_code, 409)
                    self.assertEqual(registration.json()["detail"], "Account already exists")
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path

    def test_request_body_cannot_spoof_rate_limit_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "spoof.db")
            try:
                db.init_db()
                victim = db.login_user("victim@example.com", None)
                with TestClient(main_module.app) as client:
                    response = client.post(
                        "/api/chat",
                        json={"userId": victim["id"], "message": "Charge the victim"},
                    )
                    self.assertEqual(response.status_code, 401)
                with db.connect() as conn:
                    count = conn.execute(
                        "SELECT COUNT(*) FROM usage_tracking WHERE user_id = ?",
                        (victim["id"],),
                    ).fetchone()[0]
                self.assertEqual(count, 0)
            finally:
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path

    def test_admin_bypasses_user_chat_limits(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            previous_service = main_module.chat_service
            previous_minute = RateLimitConfig.chat_per_minute
            previous_day = RateLimitConfig.chat_per_day
            os.environ["DB_PATH"] = os.path.join(temp_dir, "admin-limits.db")
            main_module.chat_service = FakeChatService()
            RateLimitConfig.chat_per_minute = 1
            RateLimitConfig.chat_per_day = 1
            try:
                with TestClient(main_module.app) as client:
                    admin = db.get_user_by_identifier("tarunkrishn666@gmail.com")
                    db.set_user_password(
                        admin["id"], main_module.hash_password("A-secure-admin-password-2026")
                    )
                    signed_in = client.post(
                        "/api/auth/login",
                        json={
                            "email": "tarunkrishn666@gmail.com",
                            "password": "A-secure-admin-password-2026",
                        },
                    )
                    admin = signed_in.json()["user"]
                    payload = {"userId": admin["id"], "message": "Hello"}
                    self.assertEqual(client.post("/api/chat", json=payload).status_code, 200)
                    self.assertEqual(client.post("/api/chat", json=payload).status_code, 200)
                    with db.connect() as conn:
                        count = conn.execute(
                            "SELECT COUNT(*) FROM usage_tracking WHERE user_id = ?",
                            (admin["id"],),
                        ).fetchone()[0]
                    self.assertEqual(count, 0)
            finally:
                RateLimitConfig.chat_per_minute = previous_minute
                RateLimitConfig.chat_per_day = previous_day
                main_module.chat_service = previous_service
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path

    def test_admin_api_key_allows_only_admin_api_access(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            previous_key = os.environ.get("ADMIN_API_KEY")
            os.environ["DB_PATH"] = os.path.join(temp_dir, "admin-key.db")
            os.environ["ADMIN_API_KEY"] = "valid-admin-api-key-with-32-characters"
            try:
                with TestClient(main_module.app) as client:
                    headers = {"X-Admin-Api-Key": "valid-admin-api-key-with-32-characters"}
                    self.assertEqual(client.get("/api/admin/dashboard", headers=headers).status_code, 200)
                    self.assertEqual(client.get("/api/auth/me", headers=headers).status_code, 401)
                    self.assertEqual(
                        client.get(
                            "/api/admin/dashboard",
                            headers={"X-Admin-Api-Key": "wrong-admin-api-key"},
                        ).status_code,
                        403,
                    )
            finally:
                if previous_key is None:
                    os.environ.pop("ADMIN_API_KEY", None)
                else:
                    os.environ["ADMIN_API_KEY"] = previous_key
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path


class SuperAdminTests(unittest.TestCase):
    def test_bootstrap_first_login_rbac_and_audit_log(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            previous_path = os.environ.get("DB_PATH")
            previous_enabled = RateLimitConfig.enabled
            os.environ["DB_PATH"] = os.path.join(temp_dir, "admin.db")
            RateLimitConfig.enabled = False
            try:
                db.init_db()
                db.init_db()
                admin = db.get_user_by_identifier("tarunkrishn666@gmail.com")
                self.assertEqual(admin["role"], "super_admin")
                self.assertEqual(admin["is_active"], 1)
                self.assertEqual(admin["password_set"], 0)

                with TestClient(main_module.app) as client:
                    lookup = client.post(
                        "/api/auth/account",
                        json={"email": "tarunkrishn666@gmail.com"},
                    )
                    self.assertEqual(lookup.status_code, 200)
                    self.assertTrue(lookup.json()["exists"])

                    registration = client.post(
                        "/api/auth/register",
                        json={
                            "email": "tarunkrishn666@gmail.com",
                            "password": "A-secure-admin-password-2026",
                        },
                    )
                    self.assertEqual(registration.status_code, 409)
                    self.assertTrue(
                        client.post(
                            "/api/auth/account",
                            json={"email": "tarunkrishn666@gmail.com"},
                        ).json()["exists"]
                    )
                    signed_in = client.post(
                        "/api/auth/login",
                        json={
                            "email": "tarunkrishn666@gmail.com",
                            "password": os.environ["SUPER_ADMIN_PASSWORD"],
                        },
                    )
                    self.assertEqual(signed_in.status_code, 200)
                    self.assertEqual(signed_in.json()["redirect_to"], "/admin")
                    token = signed_in.json()["access_token"]
                    headers = {"Authorization": f"Bearer {token}"}
                    self.assertEqual(
                        client.get("/api/admin/dashboard", headers=headers).status_code,
                        200,
                    )
                    for endpoint in (
                        "users",
                        "conversations",
                        "brains",
                        "rate-limits",
                        "analytics",
                        "system-health",
                        "logs",
                        "settings",
                    ):
                        self.assertEqual(
                            client.get(f"/api/admin/{endpoint}", headers=headers).status_code,
                            200,
                            endpoint,
                        )
                    created = client.post(
                        "/api/admin/users",
                        headers=headers,
                        json={
                            "identifier": "second-admin@example.com",
                            "temporary_password": "second-admin-password",
                        },
                    )
                    self.assertEqual(created.status_code, 200)
                    self.assertEqual(created.json()["role"], "admin")
                    admin_login = client.post(
                        "/api/auth/login",
                        json={
                            "email": "second-admin@example.com",
                            "password": "second-admin-password",
                        },
                    )
                    self.assertEqual(admin_login.status_code, 200)
                    self.assertEqual(admin_login.json()["user"]["role"], "admin")
                    self.assertEqual(admin_login.json()["redirect_to"], "/admin")
                    regular_user = client.post(
                        "/api/auth/register",
                        json={"email": "delete-me@example.com", "password": "delete-password"},
                    ).json()["user"]
                    ban = client.patch(
                        f"/api/admin/users/{regular_user['id']}",
                        headers=headers,
                        json={"is_active": False},
                    )
                    self.assertEqual(ban.status_code, 200)
                    settings = client.patch(
                        "/api/admin/settings",
                        headers=headers,
                        json={"key": "launch.mode", "value": "beta"},
                    )
                    self.assertEqual(settings.status_code, 200)
                    brain = client.patch(
                        "/api/admin/brains/groq",
                        headers=headers,
                        json={"key": "enabled", "value": "true"},
                    )
                    self.assertEqual(brain.status_code, 200)
                    deleted = client.delete(
                        f"/api/admin/users/{regular_user['id']}",
                        headers=headers,
                    )
                    self.assertEqual(deleted.status_code, 204)
                    logs = client.get("/api/admin/logs", headers=headers)
                    self.assertEqual(logs.status_code, 200)
                    self.assertGreaterEqual(len(logs.json()), 1)
                    actions = {item["action"] for item in logs.json()}
                    self.assertIn("admin_login", actions)
                    self.assertIn("user_ban", actions)
                    self.assertIn("settings_changed", actions)
                    self.assertIn("ai_configuration_changed", actions)
                    self.assertIn("user_deleted", actions)

                    logged_out = client.post("/api/auth/logout", headers=headers)
                    self.assertEqual(logged_out.status_code, 204)
                    self.assertEqual(
                        client.get("/api/admin/dashboard", headers=headers).status_code,
                        403,
                    )
                    logs_after_logout = client.get("/api/admin/logs", headers={"X-Admin-Api-Key": os.environ["ADMIN_API_KEY"]})
                    self.assertIn("admin_logout", {item["action"] for item in logs_after_logout.json()})

                    regular = client.post(
                        "/api/auth/register",
                        json={"email": "regular@example.com", "password": "regular-password"},
                    ).json()
                    self.assertEqual(regular["user"]["role"], "user")
                    self.assertEqual(regular["redirect_to"], "/chat")
                    denied = client.get(
                        "/api/admin/dashboard",
                        headers={"Authorization": f"Bearer {regular['access_token']}"},
                    )
                    self.assertEqual(denied.status_code, 403)
            finally:
                RateLimitConfig.enabled = previous_enabled
                if previous_path is None:
                    os.environ.pop("DB_PATH", None)
                else:
                    os.environ["DB_PATH"] = previous_path
