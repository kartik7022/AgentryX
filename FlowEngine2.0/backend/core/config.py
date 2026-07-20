from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Unified settings for all merged subprojects."""

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str

    # ── Application ───────────────────────────────────────────────────────
    APP_NAME: str = "FlowEngine"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    cookie_domain: str = "localhost"
    # ── JWT / Auth ────────────────────────────────────────────────────────
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_ttl_hours: int = 8
    password_token_ttl_hours: int = 24

    # ── Frontend URL ───────────────────────────────────────────────────────
    frontend_base_url: str = "http://localhost:8000"

    # ── SMTP ──────────────────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@yourdomain.com"
    SMTP_FROM_NAME: str = "API Key Service"

    # ── Vault ────────────────────────────────────────────────────────────
    vault_addr: str = ""
    vault_token: str = ""
    vault_kv_mount: str = "secret"
    vault_role_id: str = ""
    vault_secret_id: str = ""
    vault_auth_method: str = "token"

    # ── Credential Broker ────────────────────────────────────────────────
    broker_url: str = "http://localhost:9100"
    broker_ttl_seconds: int = 600

    # ── MS SQL ODBC Driver ────────────────────────────────────────────────
    mssql_odbc_driver: str = "ODBC Driver 18 for SQL Server"

    # ── Super Admin ───────────────────────────────────────────────────────
    SUPER_ADMIN_USERNAME: str
    SUPER_ADMIN_PASSWORD: str
    admin_ui_url: str = "http://localhost:5000"
    admin_hub_url: str = "http://localhost:3000"
    # ── Google OAuth ──────────────────────────────────────────────────────
    google_client_id:     str = ""
    google_client_secret: str = ""
    google_redirect_uri:  str = "http://localhost:8000/auth/google/callback"

    # ── Keycloak ──────────────────────────────────────────────────────────
    keycloak_url:           str = "http://keycloak:8080"
    keycloak_realm:         str = "flowengine"
    keycloak_client_id:     str = ""
    keycloak_client_secret: str = ""
    keycloak_external_url: str = "http://localhost:7000"
    keycloak_internal_external_url: str = "http://host.docker.internal:7000"
    keycloak_admin_username: str = "admin"
    keycloak_admin_password: str = "admin"
    keycloak_redirect_uri: str = "http://localhost:3000/auth/keycloak/callback"
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

    # ── Kill Bill ──────────────────────────────────────────────────────────
    killbill_gateway_url: str = "http://localhost:3002"
    killbill_api_key: str = "company_a"
    killbill_api_secret: str = "company_a_secret"
    portal_url: str = "http://localhost:4000"

    @property
    def vault_enabled(self) -> bool:
        return bool(self.vault_addr and self.vault_token)

    @property
    def smtp_host(self) -> str:
        return self.SMTP_HOST

    @property
    def smtp_port(self) -> int:
        return self.SMTP_PORT

    @property
    def smtp_user(self) -> str:
        return self.SMTP_USER

    @property
    def smtp_password(self) -> str:
        return self.SMTP_PASSWORD

    @property
    def smtp_from_email(self) -> str:
        return self.SMTP_FROM_EMAIL

    @property
    def smtp_from_name(self) -> str:
        return self.SMTP_FROM_NAME


settings = Settings()