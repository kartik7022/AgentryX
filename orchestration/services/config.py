# orchestration/orchestration/services/config.py
import os
import sys
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AliasChoices, Field

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # ── Core infra ─────────────────────────────────────────────────
    DATABASE_URL: str

    # ── Groq AI ────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    GROQ_MODEL:   str = "llama-3.3-70b-versatile"

    # ── Security ───────────────────────────────────────────────────
    TENANT_JWT_SECRET:   str = Field(
        "dev-orchestration-jwt-secret",
        validation_alias=AliasChoices("JWT_SECRET", "TENANT_JWT_SECRET"),
    )
    TENANT_JWKS_URL:     str = ""
    TENANT_JWT_ALG:      str = Field(
        "HS256",
        validation_alias=AliasChoices("JWT_ALG", "TENANT_JWT_ALG"),
    )
    ADMIN_REQUIRED_ROLE: str = "orchestration_admin"

    # ── Service metadata ───────────────────────────────────────────
    SERVICE_NAME:    str = "orchestration-service"
    SERVICE_VERSION: str = "1.0.0"

    model_config = SettingsConfigDict(
        env_file=".env.prod",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def validate_environment(self) -> None:
        errors   = []
        warnings = []

        if not self.DATABASE_URL:
            errors.append("DATABASE_URL is required")

        if not self.TENANT_JWT_SECRET or self.TENANT_JWT_SECRET == "dev-orchestration-jwt-secret":
            warnings.append(
                "JWT_SECRET is using default dev value — "
                "set a strong secret in production"
            )

        if not self.GROQ_API_KEY:
            warnings.append("GROQ_API_KEY not set — AI transform steps will fail")

        for w in warnings:
            logger.warning("ENV WARNING: %s", w)

        if errors:
            for e in errors:
                logger.error("ENV ERROR: %s", e)
            logger.error("Startup aborted due to missing required environment variables.")
            sys.exit(1)

        logger.info("Environment validation passed")
        logger.info("Service: %s v%s", self.SERVICE_NAME, self.SERVICE_VERSION)
        logger.info("Database: %s", self.DATABASE_URL.split("@")[-1])


settings = Settings()