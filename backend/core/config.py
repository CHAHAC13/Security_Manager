from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    databricks_host: str = Field(alias="DATABRICKS_HOST")
    databricks_token: str | None = Field(default=None, alias="DATABRICKS_TOKEN")
    allowed_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        alias="ALLOWED_ORIGINS",
    )
    discovery_cache_ttl_seconds: int = Field(
        default=300, ge=0, le=3600, alias="DISCOVERY_CACHE_TTL_SECONDS"
    )
    discovery_cache_max_entries: int = Field(
        default=500, ge=1, le=10000, alias="DISCOVERY_CACHE_MAX_ENTRIES"
    )
    databricks_page_size: int = Field(
        default=500, ge=1, le=1000, alias="DATABRICKS_PAGE_SIZE"
    )
    databricks_timeout_seconds: float = Field(
        default=30.0, gt=0, le=120, alias="DATABRICKS_TIMEOUT_SECONDS"
    )
    discovery_max_schema_requests: int = Field(
        default=5, ge=1, le=25, alias="DISCOVERY_MAX_SCHEMA_REQUESTS"
    )

    @field_validator("databricks_host")
    @classmethod
    def validate_databricks_host(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        # Databricks Apps injects DATABRICKS_HOST as a bare hostname
        # (e.g. "my-workspace.cloud.databricks.com"); default to HTTPS.
        if value and "://" not in value:
            value = f"https://{value}"
        parsed = urlparse(value)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("DATABRICKS_HOST must be a valid HTTP(S) URL.")
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise ValueError("DATABRICKS_HOST must use HTTPS outside local development.")
        return value

    @property
    def normalized_databricks_host(self) -> str:
        return self.databricks_host.rstrip("/")

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()