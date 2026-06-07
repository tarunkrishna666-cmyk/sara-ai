"""Idempotently initialize the database and bootstrap the configured Super Admin."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db
from app.auth import hash_password


if __name__ == "__main__":
    db.init_db()
    admin = db.get_user_by_identifier(db.super_admin_email())
    configured_password = os.getenv("SUPER_ADMIN_PASSWORD")
    if configured_password:
        if len(configured_password) < 8:
            raise ValueError("SUPER_ADMIN_PASSWORD must contain at least 8 characters")
        admin = db.set_user_password(admin["id"], hash_password(configured_password))
    print(
        {
            "identifier": admin["identifier"],
            "role": admin["role"],
            "is_active": bool(admin["is_active"]),
            "password_set": bool(admin["password_set"]),
        }
    )
