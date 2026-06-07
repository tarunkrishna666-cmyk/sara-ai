import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Header, HTTPException

from . import db


SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "14"))
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    return "scrypt$16384$8$1$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(derived).decode()


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=32,
        )
        return hmac.compare_digest(derived, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


def issue_token(user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    db.create_auth_token(
        user_id,
        _token_hash(token),
        "session",
        datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS),
    )
    return token


def authenticate_token(token: str, kind: str = "session") -> dict | None:
    return db.get_user_by_auth_token(_token_hash(token), kind)


def revoke_token(token: str) -> None:
    db.delete_auth_token(_token_hash(token))


def require_user(
    authorization: str | None = Header(default=None),
    sara_session: str | None = Cookie(default=None),
) -> dict:
    token = _bearer_token(authorization) or sara_session
    user = authenticate_token(token) if token else None
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_admin(
    authorization: str | None = Header(default=None),
    sara_session: str | None = Cookie(default=None),
) -> dict:
    user = require_user(authorization, sara_session)
    if user["role"] not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_admin_access(
    authorization: str | None = Header(default=None),
    sara_session: str | None = Cookie(default=None),
    x_admin_api_key: str | None = Header(default=None),
) -> dict:
    token = _bearer_token(authorization) or sara_session
    user = authenticate_token(token) if token else None
    if user and user["is_active"] and user["role"] in {"admin", "super_admin"}:
        return user

    if _valid_admin_api_key(x_admin_api_key):
        super_admin = db.get_user_by_identifier(db.super_admin_email())
        if super_admin and super_admin["is_active"] and super_admin["role"] == "super_admin":
            return super_admin

    raise HTTPException(status_code=403, detail="Admin access required")


def require_super_admin(
    authorization: str | None = Header(default=None),
    sara_session: str | None = Cookie(default=None),
) -> dict:
    user = require_admin(authorization, sara_session)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return user


def require_super_admin_access(
    authorization: str | None = Header(default=None),
    sara_session: str | None = Cookie(default=None),
    x_admin_api_key: str | None = Header(default=None),
) -> dict:
    user = require_admin_access(authorization, sara_session, x_admin_api_key)
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return user


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _valid_admin_api_key(value: str | None) -> bool:
    configured = os.getenv("ADMIN_API_KEY", "")
    if not configured or not value:
        return False
    return hmac.compare_digest(value, configured)
