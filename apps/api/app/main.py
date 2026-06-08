from contextlib import asynccontextmanager
import json
import logging
import os
import sqlite3
import time
from collections.abc import AsyncIterator

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

load_dotenv()

from . import db
from .auth import authenticate_token, hash_password, issue_token, require_admin_access, require_super_admin_access, require_user, revoke_token, verify_password
from .rate_limit import RateLimitMiddleware
from .schemas import AccountLookupRequest, AdminCreateRequest, AdminUserUpdate, AuthResponse, ChatRequest, ChatResponse, Conversation, ConversationCreate, ConversationUpdate, LoginRequest, Message, RegisterRequest, SystemSettingUpdate, User
from .services.base import AIServiceError, EmptyProviderResponseError
from .services.chat_service import RoutedChatService

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

chat_service = RoutedChatService()
logger = logging.getLogger("sara.startup")
request_logger = logging.getLogger("sara.requests")
error_logger = logging.getLogger("sara.errors")


# --- CORS CONFIGURATION (RESOLVES DOMAIN BLOCKS) ---
origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
    ).split(",")
    if origin.strip()
]

# Explicitly guarantee production deployment paths are whitelisted
production_urls = [
    "https://sara-ai-k4ed8k2po-tarunkrishna666-cmyks-projects.vercel.app",
    "https://sara-ai-web-git-main-tarunkrishna666-cmyks-projects.vercel.app",
    "https://sara-ai-web-six.vercel.app",
]

for url in production_urls:
    if url not in origins:
        origins.append(url)


@asynccontextmanager
async def lifespan(app: FastAPI):
    startup_config = _validate_startup_environment()
    logger.info("Starting sarA API on configured port %s", os.getenv("PORT", "8001"))
    logger.info("Allowed CORS origins: %s", ", ".join(origins) or "none")
    logger.info(
        "AI providers: groq=%s openrouter=%s ollama=%s",
        "configured" if os.getenv("GROQ_API_KEY") else "not configured",
        "configured" if os.getenv("OPENROUTER_API_KEY") else "not configured",
        "configured" if os.getenv("OLLAMA_BASE_URL") else "not configured",
    )
    db.init_db(ensure_super_admin=False)
    super_admin, bootstrap_status = db.bootstrap_super_admin(
        hash_password(startup_config["SUPER_ADMIN_PASSWORD"])
    )
    if bootstrap_status == "created":
        logger.info("Super admin created")
    else:
        logger.info("Super admin verified")
    logger.info("Super admin email: %s", super_admin["identifier"])
    try:
        yield
    finally:
        logger.info("Shutting down sarA API")
        await chat_service.close()


app = FastAPI(
    title="sarA AI API",
    version="0.1.0",
    lifespan=lifespan,
)


# --- STRATEGIC MIDDLEWARE ORDERING (FIXES 400 OPTIONS BLOCK) ---

# 1. CORSMiddleware MUST process incoming traffic first to cleanly clear browser preflight requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. RateLimitMiddleware runs safely secondary once permissions are cleared
app.add_middleware(RateLimitMiddleware)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        error_logger.exception(
            "%s %s failed after %.1fms",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise
    elapsed_ms = (time.perf_counter() - started) * 1000
    request_logger.info(
        "%s %s -> %s %.1fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if exc.status_code >= 500:
        error_logger.error("%s %s -> %s %s", request.method, request.url.path, exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    error_logger.warning("%s %s validation failed: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    error_logger.exception("%s %s unhandled error", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status")
def status() -> dict:
    return {
        "database": "online",
        "groq": "online" if os.getenv("GROQ_API_KEY") else "not configured",
        "openrouter": "online" if os.getenv("OPENROUTER_API_KEY") else "not configured",
        "ollama": "configured" if os.getenv("OLLAMA_BASE_URL") else "not configured",
    }


@app.post("/api/auth/account")
def account_lookup(payload: AccountLookupRequest) -> dict[str, bool]:
    user = db.get_user_by_identifier(payload.email)
    return {"exists": bool(user)}


@app.post("/api/login", response_model=AuthResponse, include_in_schema=False)
@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response) -> dict:
    user = db.get_user_by_identifier(payload.email)
    if not user or not user["password_set"]:
        raise HTTPException(status_code=404, detail="Account not found")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is inactive")
    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect password")
    access_token = issue_token(user["id"])
    _set_session_cookie(response, access_token)
    if user["role"] in {"admin", "super_admin"}:
        db.add_admin_audit_log(user["id"], "admin_login", user["id"], user["identifier"])
    return {
        "user": user,
        "access_token": access_token,
        "redirect_to": "/admin" if user["role"] in {"admin", "super_admin"} else "/chat",
    }


@app.post("/api/register", response_model=AuthResponse, status_code=201, include_in_schema=False)
@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, response: Response) -> dict:
    try:
        user = db.register_user(payload.email, hash_password(payload.password))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if user["role"] in {"admin", "super_admin"}:
        db.add_admin_audit_log(user["id"], "account_registration_completed", user["id"])
    access_token = issue_token(user["id"])
    _set_session_cookie(response, access_token)
    return {
        "user": user,
        "access_token": access_token,
        "redirect_to": "/admin" if user["role"] in {"admin", "super_admin"} else "/chat",
    }


@app.get("/api/auth/me", response_model=User)
def current_user(user: dict = Depends(require_user)) -> dict:
    return user


@app.post("/api/logout", status_code=204, include_in_schema=False)
@app.post("/api/auth/logout", status_code=204)
def logout(
    response: Response,
    authorization: str | None = Header(default=None),
    sara_session: str | None = Cookie(default=None),
) -> None:
    token = (
        authorization.removeprefix("Bearer ").strip()
        if authorization and authorization.startswith("Bearer ")
        else sara_session
    )
    user = authenticate_token(token) if token else None
    if token:
        revoke_token(token)
    if user and user["role"] in {"admin", "super_admin"}:
        db.add_admin_audit_log(user["id"], "admin_logout", user["id"], user["identifier"])
    response.delete_cookie("sara_session", path="/")


@app.get("/api/admin/dashboard")
def admin_dashboard(admin: dict = Depends(require_admin_access)) -> dict:
    return db.admin_dashboard_metrics()


@app.get("/api/admin/users")
def admin_users(admin: dict = Depends(require_admin_access)) -> list[dict]:
    return db.list_admin_users()


@app.post("/api/admin/users")
def create_admin(payload: AdminCreateRequest, admin: dict = Depends(require_super_admin_access)) -> dict:
    created = db.create_admin_user(
        payload.identifier,
        payload.display_name,
        hash_password(payload.temporary_password),
    )
    db.add_admin_audit_log(admin["id"], "admin_created_or_promoted", created["id"], created["identifier"])
    return created


@app.patch("/api/admin/users/{user_id}")
def update_admin_user(
    user_id: str, payload: AdminUserUpdate, admin: dict = Depends(require_super_admin_access)
) -> dict:
    before = db.get_user(user_id)
    updated = db.update_admin_user(user_id, payload.role, payload.is_active)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.is_active is False:
        db.delete_auth_tokens_for_user(user_id)
        db.add_admin_audit_log(admin["id"], "user_ban", user_id, payload.model_dump_json())
    elif before and before["is_active"] == 0 and payload.is_active is True:
        db.add_admin_audit_log(admin["id"], "user_unban", user_id, payload.model_dump_json())
    else:
        db.add_admin_audit_log(admin["id"], "user_access_updated", user_id, payload.model_dump_json())
    return updated


@app.delete("/api/admin/users/{user_id}", status_code=204)
def delete_admin_user(
    user_id: str, admin: dict = Depends(require_super_admin_access)
) -> None:
    deleted = db.delete_admin_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete_auth_tokens_for_user(user_id)
    db.add_admin_audit_log(admin["id"], "user_deleted", user_id, deleted["identifier"])


@app.get("/api/admin/conversations")
def admin_conversations(admin: dict = Depends(require_admin_access)) -> list[dict]:
    return db.list_admin_conversations()


@app.get("/api/admin/brains")
def admin_brains(admin: dict = Depends(require_admin_access)) -> dict:
    return status()


@app.get("/api/admin/rate-limits")
def admin_rate_limits(admin: dict = Depends(require_admin_access)) -> dict:
    return db.rate_limit_admin_metrics()


@app.get("/api/admin/usage")
def admin_usage(admin: dict = Depends(require_admin_access)) -> dict:
    return db.rate_limit_admin_metrics()


@app.patch("/api/admin/brains/{provider}")
def update_admin_brain(
    provider: str, payload: SystemSettingUpdate, admin: dict = Depends(require_super_admin_access)
) -> dict:
    if provider not in {"groq", "openrouter", "ollama"}:
        raise HTTPException(status_code=404, detail="Unknown AI provider")
    key = f"provider.{provider}.{payload.key}"
    db.set_system_setting(key, payload.value, admin["id"])
    db.add_admin_audit_log(admin["id"], "ai_configuration_changed", details=key)
    return db.list_system_settings()


@app.patch("/api/admin/rate-limits/{key}")
def update_admin_rate_limit(
    key: str, payload: SystemSettingUpdate, admin: dict = Depends(require_super_admin_access)
) -> dict:
    setting_key = f"rate_limit.{key}"
    db.set_system_setting(setting_key, payload.value, admin["id"])
    db.add_admin_audit_log(admin["id"], "rate_limit_setting_updated", details=setting_key)
    return db.list_system_settings()


@app.get("/api/admin/analytics")
def admin_analytics(admin: dict = Depends(require_admin_access)) -> dict:
    return db.admin_dashboard_metrics()


@app.get("/api/admin/system-health")
def admin_system_health(admin: dict = Depends(require_admin_access)) -> dict:
    return {"api": "online", **status()}


@app.get("/api/admin/logs")
def admin_logs(admin: dict = Depends(require_admin_access)) -> list[dict]:
    return db.list_admin_audit_logs()


@app.get("/api/admin/settings")
def admin_settings(admin: dict = Depends(require_admin_access)) -> dict:
    return db.list_system_settings()


@app.patch("/api/admin/settings")
def update_admin_settings(
    payload: SystemSettingUpdate, admin: dict = Depends(require_super_admin_access)
) -> dict:
    db.set_system_setting(payload.key, payload.value, admin["id"])
    db.add_admin_audit_log(admin["id"], "settings_changed", details=payload.key)
    return db.list_system_settings()


@app.get("/api/users/{user_id}/conversations", response_model=list[Conversation])
def conversations(user_id: str, user: dict = Depends(require_user)) -> list[dict]:
    _require_owner(user, user_id)
    if not db.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return db.list_conversations(user_id)


@app.post("/api/users/{user_id}/conversations", response_model=Conversation)
def create_user_conversation(
    user_id: str, payload: ConversationCreate, user: dict = Depends(require_user)
) -> dict:
    _require_owner(user, user_id)
    if not db.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return db.create_conversation(user_id, payload.title)


@app.patch("/api/conversations/{conversation_id}", response_model=Conversation)
def rename_user_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    user_id: str = Query(...),
    user: dict = Depends(require_user),
) -> dict:
    _require_owner(user, user_id)
    conversation = db.rename_conversation(conversation_id, user_id, payload.title)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.delete("/api/conversations/{conversation_id}", status_code=204)
def delete_user_conversation(
    conversation_id: str,
    user_id: str = Query(...),
    user: dict = Depends(require_user),
) -> None:
    _require_owner(user, user_id)
    if not db.delete_conversation(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")


@app.get("/api/conversations/{conversation_id}/messages", response_model=list[Message])
def messages(
    conversation_id: str,
    user_id: str = Query(...),
    user: dict = Depends(require_user),
) -> list[dict]:
    _require_owner(user, user_id)
    if not db.get_conversation(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return db.list_messages(conversation_id, user_id)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, user: dict = Depends(require_user)) -> dict:
    _require_owner(user, payload.user_id)
    try:
        if not db.get_user(payload.user_id):
            raise HTTPException(status_code=404, detail="User not found")

        if payload.conversation_id:
            conversation = db.get_conversation(payload.conversation_id, payload.user_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
            history = db.list_recent_messages(conversation["id"], payload.user_id)
        else:
            conversation = db.create_conversation(payload.user_id)
            history = []

        db.add_message(conversation["id"], payload.user_id, "user", payload.message)
        db.update_conversation_title_if_new(
            conversation["id"], payload.user_id, payload.message
        )
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading chat") from exc

    try:
        reply_text = await chat_service.generate_reply(payload.message, history)
    except AIServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        assistant_message = db.add_message(
            conversation["id"], payload.user_id, "assistant", reply_text
        )
        db.add_chat_history(
            conversation["id"], payload.user_id, payload.message, reply_text
        )
        updated_conversation = db.get_conversation(conversation["id"], payload.user_id)
        messages = db.list_messages(conversation["id"], payload.user_id)
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=500, detail="Database error while saving chat") from exc

    return {
        "reply": reply_text,
        "conversation": updated_conversation,
        "messages": messages,
        "assistant_message": assistant_message,
    }


@app.post("/api/chat/stream")
async def chat_stream(
    payload: ChatRequest, user: dict = Depends(require_user)
) -> StreamingResponse:
    _require_owner(user, payload.user_id)
    try:
        if not db.get_user(payload.user_id):
            raise HTTPException(status_code=404, detail="User not found")

        if payload.conversation_id:
            conversation = db.get_conversation(payload.conversation_id, payload.user_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
            history = db.list_recent_messages(conversation["id"], payload.user_id)
        else:
            conversation = db.create_conversation(payload.user_id)
            history = []

        user_message = db.add_message(
            conversation["id"],
            payload.user_id,
            "user",
            payload.message,
        )
        db.update_conversation_title_if_new(conversation["id"], payload.user_id, payload.message)
        conversation = db.get_conversation(conversation["id"], payload.user_id) or conversation
    except sqlite3.DatabaseError as exc:
        raise HTTPException(status_code=500, detail="Database error while preparing chat") from exc

    async def events() -> AsyncIterator[str]:
        chunks: list[str] = []
        yield _sse_event(
            "ready",
            {
                "conversation": conversation,
                "user_message": user_message,
            },
        )

        try:
            async for chunk in chat_service.stream_reply(payload.message, history):
                chunks.append(chunk)
                yield _sse_event("token", {"content": chunk})

            reply_text = "".join(chunks).strip()
            if not reply_text:
                raise EmptyProviderResponseError("The AI provider returned an empty response.")

            assistant_message = db.add_message(
                conversation["id"],
                payload.user_id,
                "assistant",
                reply_text,
            )
            db.add_chat_history(
                conversation["id"], payload.user_id, payload.message, reply_text
            )
            updated_conversation = db.get_conversation(conversation["id"], payload.user_id)
            messages = db.list_messages(conversation["id"], payload.user_id)
            yield _sse_event(
                "final",
                {
                    "reply": reply_text,
                    "conversation": updated_conversation,
                    "messages": messages,
                    "assistant_message": assistant_message,
                },
            )
        except sqlite3.DatabaseError:
            yield _sse_event("error", {"detail": "Database error while saving chat"})
        except AIServiceError as exc:
            yield _sse_event("error", {"detail": str(exc)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        "sara_session",
        token,
        max_age=int(os.getenv("SESSION_TTL_DAYS", "14")) * 86400,
        httponly=True,
        secure=os.getenv("APP_ENV", "local") == "production",
        samesite="lax",
        path="/",
    )


def _require_owner(user: dict, user_id: str) -> None:
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _validate_startup_environment() -> dict[str, str]:
    required = ("SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD", "ADMIN_API_KEY")
    values: dict[str, str] = {}
    missing: list[str] = []
    for key in required:
        value = os.getenv(key, "").strip()
        if not value:
            message = f"{key} is missing from environment configuration."
            logger.error(message)
            missing.append(message)
        else:
            values[key] = value

    if missing:
        raise RuntimeError(" ".join(missing))
    if len(values["SUPER_ADMIN_PASSWORD"]) < 8:
        message = "SUPER_ADMIN_PASSWORD must contain at least 8 characters."
        logger.error(message)
        raise RuntimeError(message)
    if len(values["ADMIN_API_KEY"]) < 32:
        message = "ADMIN_API_KEY must contain at least 32 characters."
        logger.error(message)
        raise RuntimeError(message)
    if values["SUPER_ADMIN_EMAIL"].lower() != values["SUPER_ADMIN_EMAIL"]:
        values["SUPER_ADMIN_EMAIL"] = values["SUPER_ADMIN_EMAIL"].lower()
        os.environ["SUPER_ADMIN_EMAIL"] = values["SUPER_ADMIN_EMAIL"]
    return values
