import logging
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_SUPER_ADMIN_EMAIL = "tarunkrishn666@gmail.com"
logger = logging.getLogger("sara.db")


def super_admin_email() -> str:
    return os.getenv("SUPER_ADMIN_EMAIL", DEFAULT_SUPER_ADMIN_EMAIL).strip().lower()


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> bool:
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def _db_path() -> Path:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        if database_url.startswith("sqlite:///"):
            configured = database_url[len("sqlite:///") :]
        else:
            raise ValueError("DATABASE_URL must be a sqlite URL like sqlite:///./data/sara.db")
    else:
        configured = os.getenv("DB_PATH", "./data/sara.db")

    path = Path(configured)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(
        _db_path(), check_same_thread=False, factory=ClosingConnection
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(ensure_super_admin: bool = True) -> None:
    logger.info("Initializing database at %s", _db_path())
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              identifier TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              theme TEXT NOT NULL DEFAULT 'dark',
              role TEXT NOT NULL DEFAULT 'user',
              is_active INTEGER NOT NULL DEFAULT 1,
              password_hash TEXT,
              password_set INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS conversations (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              title TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS messages (
              id TEXT PRIMARY KEY,
              conversation_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
              content TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_history (
              id TEXT PRIMARY KEY,
              conversation_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              user_message TEXT NOT NULL,
              assistant_response TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS usage_tracking (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              endpoint TEXT NOT NULL,
              request_count INTEGER NOT NULL DEFAULT 0,
              date TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(user_id, endpoint, date),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS rate_limit_events (
              id TEXT PRIMARY KEY,
              user_id TEXT,
              client_ip TEXT NOT NULL,
              endpoint TEXT NOT NULL,
              reason TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              token_hash TEXT NOT NULL UNIQUE,
              kind TEXT NOT NULL CHECK(kind = 'session'),
              expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS admin_audit_logs (
              id TEXT PRIMARY KEY,
              actor_user_id TEXT NOT NULL,
              action TEXT NOT NULL,
              target_user_id TEXT,
              details TEXT,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS system_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_by TEXT,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
              ON conversations(user_id, updated_at DESC);

            CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
              ON messages(conversation_id, created_at ASC);

            CREATE INDEX IF NOT EXISTS idx_chat_history_user_created
              ON chat_history(user_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_usage_tracking_date_endpoint
              ON usage_tracking(date, endpoint);

            CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created
              ON rate_limit_events(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash
              ON auth_tokens(token_hash);

            CREATE INDEX IF NOT EXISTS idx_admin_audit_created
              ON admin_audit_logs(created_at DESC);
            """
        )
        _ensure_user_columns(conn)
        if ensure_super_admin:
            _bootstrap_super_admin(conn)
        conn.execute(
            "DELETE FROM rate_limit_events WHERE created_at < datetime('now', '-90 days')"
        )
        conn.execute(
            "DELETE FROM usage_tracking WHERE date < date('now', '-400 days')"
        )
        conn.execute("DELETE FROM auth_tokens WHERE expires_at <= CURRENT_TIMESTAMP")
    logger.info("Database initialization complete")


def _ensure_user_columns(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    migrations = {
        "role": "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
        "is_active": "ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
        "password_hash": "ALTER TABLE users ADD COLUMN password_hash TEXT",
        "password_set": "ALTER TABLE users ADD COLUMN password_set INTEGER NOT NULL DEFAULT 0",
    }
    for column, statement in migrations.items():
        if column not in columns:
            conn.execute(statement)


def _bootstrap_super_admin(conn: sqlite3.Connection) -> str:
    email = super_admin_email()
    existing = conn.execute("SELECT id FROM users WHERE identifier = ?", (email,)).fetchone()
    if existing:
        conn.execute(
            "UPDATE users SET role = 'super_admin', is_active = 1 WHERE id = ?",
            (existing["id"],),
        )
        return "verified"
    conn.execute(
        """
        INSERT INTO users (
          id, identifier, display_name, role, is_active, password_set
        ) VALUES (?, ?, ?, 'super_admin', 1, 0)
        """,
        (str(uuid.uuid4()), email, "Super Admin"),
    )
    return "created"


def bootstrap_super_admin(password_hash: str) -> tuple[dict[str, Any], str]:
    email = super_admin_email()
    with connect() as conn:
        existing = conn.execute(
            "SELECT * FROM users WHERE identifier = ?", (email,)
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET role = 'super_admin',
                    is_active = 1,
                    password_hash = ?,
                    password_set = 1
                WHERE id = ?
                """,
                (password_hash, existing["id"]),
            )
            user = conn.execute("SELECT * FROM users WHERE id = ?", (existing["id"],)).fetchone()
            return dict(user), "verified"

        user_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO users (
              id, identifier, display_name, role, is_active, password_hash, password_set
            ) VALUES (?, ?, ?, 'super_admin', 1, ?, 1)
            """,
            (user_id, email, "Super Admin", password_hash),
        )
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(user), "created"


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def login_user(identifier: str, display_name: str | None) -> dict[str, Any]:
    clean_identifier = identifier.strip().lower()
    clean_name = (display_name or identifier.split("@")[0]).strip() or "sarA user"

    with connect() as conn:
        existing = conn.execute(
            "SELECT * FROM users WHERE identifier = ?", (clean_identifier,)
        ).fetchone()
        if existing:
            return dict(existing)

        user_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO users (id, identifier, display_name)
            VALUES (?, ?, ?)
            """,
            (user_id, clean_identifier, clean_name),
        )
        return dict(
            conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        )


def register_user(identifier: str, password_hash: str) -> dict[str, Any]:
    email = identifier.strip().lower()
    with connect() as conn:
        existing = conn.execute(
            "SELECT * FROM users WHERE identifier = ?", (email,)
        ).fetchone()
        if existing:
            raise ValueError("Account already exists")

        user_id = str(uuid.uuid4())
        role = "super_admin" if email == super_admin_email() else "user"
        conn.execute(
            """
            INSERT INTO users (
              id, identifier, display_name, role, is_active, password_hash, password_set
            ) VALUES (?, ?, ?, ?, 1, ?, 1)
            """,
            (user_id, email, email.split("@")[0], role, password_hash),
        )
        return dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def get_user_by_identifier(identifier: str) -> dict[str, Any] | None:
    with connect() as conn:
        return row_to_dict(
            conn.execute(
                "SELECT * FROM users WHERE identifier = ?", (identifier.strip().lower(),)
            ).fetchone()
        )


def set_user_password(user_id: str, password_hash: str) -> dict[str, Any]:
    with connect() as conn:
        conn.execute(
            """
            UPDATE users SET password_hash = ?, password_set = 1, is_active = 1
            WHERE id = ?
            """,
            (password_hash, user_id),
        )
        conn.execute(
            "DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'password_setup'",
            (user_id,),
        )
        return dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def create_auth_token(
    user_id: str, token_hash: str, kind: str, expires_at: datetime
) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO auth_tokens (id, user_id, token_hash, kind, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), user_id, token_hash, kind, expires_at.isoformat()),
        )


def get_user_by_auth_token(token_hash: str, kind: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT users.*
            FROM auth_tokens
            INNER JOIN users ON users.id = auth_tokens.user_id
            WHERE auth_tokens.token_hash = ? AND auth_tokens.kind = ?
              AND auth_tokens.expires_at > ?
            """,
            (token_hash, kind, datetime.now(timezone.utc).isoformat()),
        ).fetchone()
        return row_to_dict(row)


def delete_auth_token(token_hash: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE token_hash = ?", (token_hash,))


def delete_auth_tokens_for_user(user_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE user_id = ?", (user_id,))


def list_admin_users() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, identifier, display_name, theme, role, is_active,
                   password_set, created_at
            FROM users ORDER BY created_at DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def create_admin_user(
    identifier: str, display_name: str | None, password_hash: str
) -> dict[str, Any]:
    email = identifier.strip().lower()
    with connect() as conn:
        existing = conn.execute("SELECT * FROM users WHERE identifier = ?", (email,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET role = CASE WHEN role = 'super_admin' THEN role ELSE 'admin' END,
                    is_active = 1,
                    password_hash = ?,
                    password_set = 1
                WHERE id = ?
                """,
                (password_hash, existing["id"]),
            )
            return dict(conn.execute("SELECT * FROM users WHERE id = ?", (existing["id"],)).fetchone())
        user_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO users (
              id, identifier, display_name, role, is_active, password_hash, password_set
            ) VALUES (?, ?, ?, 'admin', 1, ?, 1)
            """,
            (user_id, email, (display_name or email.split("@")[0]).strip(), password_hash),
        )
        return dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def update_admin_user(user_id: str, role: str | None, is_active: bool | None) -> dict[str, Any] | None:
    with connect() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            return None
        if user["role"] == "super_admin":
            return dict(user)
        if role is not None:
            conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
        if is_active is not None:
            conn.execute("UPDATE users SET is_active = ? WHERE id = ?", (int(is_active), user_id))
        return dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def delete_admin_user(user_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user or user["role"] == "super_admin":
            return None
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return dict(user)


def add_admin_audit_log(
    actor_user_id: str, action: str, target_user_id: str | None = None, details: str | None = None
) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO admin_audit_logs (id, actor_user_id, action, target_user_id, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), actor_user_id, action, target_user_id, details),
        )


def list_admin_audit_logs(limit: int = 100) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT logs.*, users.identifier AS actor_identifier
            FROM admin_audit_logs logs
            LEFT JOIN users ON users.id = logs.actor_user_id
            ORDER BY logs.created_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def admin_dashboard_metrics() -> dict[str, Any]:
    with connect() as conn:
        users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        active_users = conn.execute("SELECT COUNT(*) FROM users WHERE is_active = 1").fetchone()[0]
        admins = conn.execute(
            "SELECT COUNT(*) FROM users WHERE role IN ('admin', 'super_admin')"
        ).fetchone()[0]
        conversations = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    return {
        "users": users,
        "active_users": active_users,
        "admins": admins,
        "conversations": conversations,
        "messages": messages,
        **rate_limit_admin_metrics(),
    }


def list_admin_conversations(limit: int = 100) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.title, c.created_at, c.updated_at,
                   users.identifier AS user_identifier,
                   COUNT(messages.id) AS message_count
            FROM conversations c
            LEFT JOIN users ON users.id = c.user_id
            LEFT JOIN messages ON messages.conversation_id = c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def list_system_settings() -> dict[str, str]:
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM system_settings ORDER BY key").fetchall()
        return {row["key"]: row["value"] for row in rows}


def set_system_setting(key: str, value: str, actor_user_id: str) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO system_settings (key, value, updated_by)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_by = excluded.updated_by,
              updated_at = CURRENT_TIMESTAMP
            """,
            (key, value, actor_user_id),
        )


def get_user(user_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        return row_to_dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def list_conversations(user_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT
              c.*,
              (
                SELECT m.content
                FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1
              ) AS last_message
            FROM conversations c
            WHERE c.user_id = ?
              AND EXISTS (
                SELECT 1
                FROM messages existing_messages
                WHERE existing_messages.conversation_id = c.id
              )
            ORDER BY c.updated_at DESC
            """,
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def create_conversation(user_id: str, title: str | None = None) -> dict[str, Any]:
    conversation_id = str(uuid.uuid4())
    safe_title = (title or "New chat").strip()[:80] or "New chat"

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO conversations (id, user_id, title)
            VALUES (?, ?, ?)
            """,
            (conversation_id, user_id, safe_title),
        )
        return dict(
            conn.execute(
                """
                SELECT c.*, NULL AS last_message
                FROM conversations c
                WHERE c.id = ? AND c.user_id = ?
                """,
                (conversation_id, user_id),
            ).fetchone()
        )


def get_conversation(conversation_id: str, user_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        return row_to_dict(
            conn.execute(
                """
                SELECT c.*,
                  (
                    SELECT m.content
                    FROM messages m
                    WHERE m.conversation_id = c.id
                    ORDER BY m.created_at DESC
                    LIMIT 1
                  ) AS last_message
                FROM conversations c
                WHERE c.id = ? AND c.user_id = ?
                """,
                (conversation_id, user_id),
            ).fetchone()
        )


def rename_conversation(conversation_id: str, user_id: str, title: str) -> dict[str, Any] | None:
    safe_title = title.strip()[:80]
    if not safe_title:
        return None
    with connect() as conn:
        result = conn.execute(
            """
            UPDATE conversations
            SET title = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (safe_title, conversation_id, user_id),
        )
        if result.rowcount == 0:
            return None
    return get_conversation(conversation_id, user_id)


def delete_conversation(conversation_id: str, user_id: str) -> bool:
    with connect() as conn:
        result = conn.execute(
            "DELETE FROM conversations WHERE id = ? AND user_id = ?",
            (conversation_id, user_id),
        )
        return result.rowcount > 0


def list_messages(conversation_id: str, user_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT m.*
            FROM messages m
            INNER JOIN conversations c ON c.id = m.conversation_id
            WHERE m.conversation_id = ? AND c.user_id = ?
            ORDER BY m.created_at ASC, m.rowid ASC
            """,
            (conversation_id, user_id),
        ).fetchall()
        return [dict(row) for row in rows]


def list_recent_messages(
    conversation_id: str, user_id: str, limit: int = 10
) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT recent.*
            FROM (
              SELECT m.*, m.rowid AS message_order
              FROM messages m
              INNER JOIN conversations c ON c.id = m.conversation_id
              WHERE m.conversation_id = ? AND c.user_id = ?
              ORDER BY m.created_at DESC, m.rowid DESC
              LIMIT ?
            ) AS recent
            ORDER BY recent.created_at ASC, recent.message_order ASC
            """,
            (conversation_id, user_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]


def add_message(
    conversation_id: str, user_id: str, role: str, content: str
) -> dict[str, Any]:
    message_id = str(uuid.uuid4())
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO messages (id, conversation_id, user_id, role, content)
            VALUES (?, ?, ?, ?, ?)
            """,
            (message_id, conversation_id, user_id, role, content.strip()),
        )
        conn.execute(
            """
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (conversation_id, user_id),
        )
        return dict(conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone())


def add_chat_history(
    conversation_id: str,
    user_id: str,
    user_message: str,
    assistant_response: str,
) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO chat_history (
              id, conversation_id, user_id, user_message, assistant_response
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                conversation_id,
                user_id,
                user_message.strip(),
                assistant_response.strip(),
            ),
        )


def update_conversation_title_if_new(
    conversation_id: str, user_id: str, message: str
) -> None:
    title = message.strip().replace("\n", " ")
    if len(title) > 56:
        title = f"{title[:53]}..."

    with connect() as conn:
        conn.execute(
            """
            UPDATE conversations
            SET title = ?
            WHERE id = ? AND user_id = ? AND title = 'New chat'
            """,
            (title or "New chat", conversation_id, user_id),
        )


def consume_daily_usage(
    user_id: str, endpoint: str, maximum: int
) -> tuple[bool, int, datetime]:
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    reset_at = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), timezone.utc)

    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """
            SELECT request_count FROM usage_tracking
            WHERE user_id = ? AND endpoint = ? AND date = ?
            """,
            (user_id, endpoint, today),
        ).fetchone()
        current = int(row["request_count"]) if row else 0
        if current >= maximum:
            return False, 0, reset_at
        conn.execute(
            """
            INSERT INTO usage_tracking (id, user_id, endpoint, request_count, date)
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(user_id, endpoint, date)
            DO UPDATE SET request_count = request_count + 1
            """,
            (str(uuid.uuid4()), user_id, endpoint, today),
        )
        return True, maximum - current - 1, reset_at


def record_blocked_request(
    user_id: str | None, client_ip: str, endpoint: str, reason: str
) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO rate_limit_events (id, user_id, client_ip, endpoint, reason)
            VALUES (?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), user_id, client_ip, endpoint, reason),
        )


def rate_limit_admin_metrics() -> dict[str, Any]:
    today = datetime.now(timezone.utc).date().isoformat()
    month_prefix = today[:7] + "%"
    with connect() as conn:
        total_requests = conn.execute(
            "SELECT COALESCE(SUM(request_count), 0) FROM usage_tracking"
        ).fetchone()[0]
        daily_requests = conn.execute(
            "SELECT COALESCE(SUM(request_count), 0) FROM usage_tracking WHERE date = ?",
            (today,),
        ).fetchone()[0]
        monthly_requests = conn.execute(
            "SELECT COALESCE(SUM(request_count), 0) FROM usage_tracking WHERE date LIKE ?",
            (month_prefix,),
        ).fetchone()[0]
        blocked_requests = conn.execute(
            "SELECT COUNT(*) FROM rate_limit_events"
        ).fetchone()[0]
        top_users = conn.execute(
            """
            SELECT u.user_id, users.display_name, users.identifier,
                   SUM(u.request_count) AS requests
            FROM usage_tracking u
            LEFT JOIN users ON users.id = u.user_id
            GROUP BY u.user_id
            ORDER BY requests DESC
            LIMIT 10
            """
        ).fetchall()
        api_usage = conn.execute(
            """
            SELECT endpoint, SUM(request_count) AS requests
            FROM usage_tracking
            GROUP BY endpoint
            ORDER BY requests DESC
            """
        ).fetchall()
    return {
        "total_requests": total_requests,
        "daily_requests": daily_requests,
        "monthly_requests": monthly_requests,
        "blocked_requests": blocked_requests,
        "top_users": [dict(row) for row in top_users],
        "api_usage": [dict(row) for row in api_usage],
    }
