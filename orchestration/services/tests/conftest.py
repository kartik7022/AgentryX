# services/tests/conftest.py
"""
Shared pytest fixtures for the orchestration test suite.

`services.main` runs `run_schema_sql()` at import time, which opens a
real connection to DATABASE_URL. To keep pure unit tests (executor
registry, AgentBudgetManager, AgentTaskConfig, AgentApprovalService)
runnable without a live Postgres instance, this file does NOT import
services.main at module level — only inside the `client` fixture, so
only tests that actually request `client` (or `db_conn`) pay that cost.

Integration tests need a real, reachable DATABASE_URL exported before
running pytest (e.g. `docker-compose up db` and export the same
DATABASE_URL the backend container uses).
"""
import os
import pytest

# services.config.Settings requires DATABASE_URL with no default, validated
# eagerly at import time. Unit tests only need pure-Python logic but still
# transitively import services.config through services.executors.* — give
# it a placeholder here if the environment hasn't already set a real one.
os.environ.setdefault(
    "DATABASE_URL", "postgresql://test:test@localhost:5432/test"
)


@pytest.fixture(scope="session")
def client():
    """
    A live TestClient against the real FastAPI app, backed by a real
    Postgres reachable at DATABASE_URL. Only request this fixture from
    integration tests.
    """
    from fastapi.testclient import TestClient
    from services.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_conn():
    """A raw psycopg2 connection from the app's real connection pool."""
    from services.db import get_pool
    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)