# services/eivs/config.py
import os
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import ClassVar


class EivsSettings(BaseSettings):
    """
    Centralized configuration for the EIVS service.
    Loads values from environment variables or .env file.
    """
    eivs_database_url: ClassVar[str] = os.getenv(
        "POSTGRES_DSN",
        "postgresql+psycopg2://postgres:postgres@postgres:5432/postgres"
    )
    # ------------------------------------------------------------------
    # Database connection (same Postgres instance as ops; the eivs schema
    # itself is set in your SQLAlchemy models' __table_args__).
    # ------------------------------------------------------------------
    database_url: str = Field(
        default=eivs_database_url,
        description="Canonical DB URL used by SQLAlchemy",
    )

    @property
    def postgres_dsn(self) -> str:
        """Backwards compat: some existing code might reference postgres_dsn"""
        return self.database_url

    # ------------------------------------------------------------------
    # Adapter service base URL
    # ------------------------------------------------------------------
    adapter_base_url: str = Field(
        default="http://adapter:8000",
        description="Adapter service base URL",
    )

    # ------------------------------------------------------------------
    # LLM primary backend (used by chart_llm_client.py)
    # ------------------------------------------------------------------
    llm_primary_backend_type: str = Field(
        default="hf",
        description="Backend type: e.g. 'openai', 'hf'",
    )
    llm_primary_base_url: Optional[str] = None
    llm_primary_api_key: Optional[str] = None
    llm_primary_model: Optional[str] = None
    llm_primary_timeout_seconds: int = 60

    # ------------------------------------------------------------------
    # LLM secondary backend (optional, for failover)
    # ------------------------------------------------------------------
    llm_secondary_backend_type: Optional[str] = None
    llm_secondary_base_url: Optional[str] = None
    llm_secondary_api_key: Optional[str] = None
    llm_secondary_model: Optional[str] = None
    llm_secondary_timeout_seconds: int = 60

    # ------------------------------------------------------------------
    # Backward‑compat convenience properties for older names
    # ------------------------------------------------------------------
    @property
    def llm_primary_backend(self) -> str:
        """Alias for older code that used `llm_primary_backend`"""
        return self.llm_primary_backend_type

    @property
    def llm_secondary_backend(self) -> Optional[str]:
        """Alias for older code that used `llm_secondary_backend`"""
        return self.llm_secondary_backend_type

    # ------------------------------------------------------------------
    # Pydantic v2 config
    # ------------------------------------------------------------------
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="EIVS_",   # All env vars must start with EIVS_
        case_sensitive=False,
        extra="ignore",
    )


# Instantiate settings singleton used across the service
settings = EivsSettings()