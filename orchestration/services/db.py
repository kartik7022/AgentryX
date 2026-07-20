# orchestration/orchestration/services/db.py
import logging
from contextlib import contextmanager
from typing import Generator

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from .config import settings

logger = logging.getLogger(__name__)

# ── Connection Pool ────────────────────────────────────────────────
_pool: ThreadedConnectionPool | None = None


def init_pool() -> None:
    """Initialize the psycopg2 connection pool."""
    global _pool
    _pool = ThreadedConnectionPool(
        minconn=2,
        maxconn=20,
        dsn=settings.DATABASE_URL,
    )
    logger.info("Database connection pool initialized")


def get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        init_pool()
    return _pool


# ── Schema bootstrap ───────────────────────────────────────────────
def run_schema_sql() -> None:
    """Run schema.sql to create all tables if not exist."""
    import os
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    if not os.path.exists(schema_path):
        logger.warning("schema.sql not found at %s — skipping", schema_path)
        return

    with open(schema_path, "r") as f:
        sql = f.read()

    conn = None
    try:
        conn = get_pool().getconn()
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        logger.info("schema.sql executed successfully — all tables ready")
    except Exception as e:
        logger.error("Failed to run schema.sql: %s", e)
        raise
    finally:
        if conn:
            get_pool().putconn(conn)


# ── FastAPI dependency ─────────────────────────────────────────────
def get_db() -> Generator:
    """
    FastAPI dependency — yields a psycopg2 connection.
    Uses RealDictCursor so rows come back as dicts.
    """
    pool = get_pool()
    conn = pool.getconn()
    try:
        conn.autocommit = False
        yield conn
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()
    finally:
        pool.putconn(conn)


# ── Helper: dict cursor ────────────────────────────────────────────
def dict_cursor(conn):
    """Return a cursor that returns rows as dicts."""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ── Helper: execute query ──────────────────────────────────────────
def execute(conn, sql: str, params=None):
    """Execute a query and return all rows as list of dicts."""
    with dict_cursor(conn) as cur:
        cur.execute(sql, params)
        try:
            return cur.fetchall()
        except psycopg2.ProgrammingError:
            return []


def execute_one(conn, sql: str, params=None):
    """Execute a query and return one row as dict or None."""
    with dict_cursor(conn) as cur:
        cur.execute(sql, params)
        try:
            return cur.fetchone()
        except psycopg2.ProgrammingError:
            return None


def execute_write(conn, sql: str, params=None):
    """Execute INSERT/UPDATE/DELETE — returns nothing."""
    with dict_cursor(conn) as cur:
        cur.execute(sql, params)


__all__ = [
    "init_pool", "get_pool", "get_db",
    "run_schema_sql", "dict_cursor",
    "execute", "execute_one", "execute_write",
]