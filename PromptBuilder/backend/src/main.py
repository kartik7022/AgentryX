# src/main.py
# Added: audit router mounted at /v1

import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine

DB_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:pass@db:5432/prompt_builder")
RESULTS_DIR = Path(os.getenv("RESULTS_DIR", "/app/results"))
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_url = os.getenv("DB_URL") or DB_URL
    if not db_url:
        raise RuntimeError("No database URL configured")
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

    engine: AsyncEngine = create_async_engine(db_url, echo=False, future=True)
    app.state.engine = engine
    logger.info(f"Async engine created: {engine}")

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection successful")
    except Exception as exc:
        logger.error(f"Database connection failed: {exc}")
        raise

    yield

    logger.info("Shutting down async engine...")
    await engine.dispose()


app = FastAPI(
    title="Prompt Builder API",
    description="AI-native prompt management and execution engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Router imports ────────────────────────────────────────────
from src.api.health      import router as health_router
from src.api.ai          import router as ai_router
from src.api.documents   import router as documents_router
from src.api.datasources import router as datasources_router
from src.api.prompts     import router as prompts_router
from src.api.audit       import router as audit_router

# ── Mount routers ─────────────────────────────────────────────
app.include_router(health_router,      prefix="/v1",  tags=["health"])
app.include_router(ai_router,          prefix="/v1",  tags=["ai"])
app.include_router(documents_router,   prefix="/v1",  tags=["documents"])
app.include_router(datasources_router, prefix="/v1",  tags=["datasources"])
app.include_router(prompts_router,     prefix="/v1",  tags=["prompts"])
app.include_router(audit_router,       prefix="/v1",  tags=["audit"])

# ── Debug ─────────────────────────────────────────────────────
@app.get("/_debug/routes", tags=["debug"])
async def list_routes():
    return {"routes": [
        {"path": r.path, "methods": list(r.methods), "name": r.name}
        for r in app.routes if hasattr(r, "methods")
    ]}

@app.get("/healthz", tags=["monitoring"])
async def health_check():
    return {"status": "ok", "service": "prompt-builder-api"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8080")), log_level="info", reload=False)