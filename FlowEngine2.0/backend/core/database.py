# backend/core/database.py

from pathlib import Path
from sqlalchemy import create_engine, text

from backend.core.config import settings


# ── Engine ────────────────────────────────────────────────────────────────────

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)


def init_db():
    """
    Run init_schema.sql → creates all tables + seed data (idempotent).
    Guarded by a Postgres advisory lock so multiple uvicorn workers
    starting concurrently don't race on the same schema/seed SQL.
    """
    sql_path = Path(__file__).resolve().parent.parent.parent / "init_schema.sql"
    sql = sql_path.read_text(encoding="utf-8")

    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_lock(918273645)"))
        try:
            conn.execute(text(sql))
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(918273645)"))