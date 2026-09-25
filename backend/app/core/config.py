from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings loaded from environment / backend/.env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="flashrisk-backend", validation_alias="FLASHRISK_APP_NAME")
    version: str = Field(default="0.1.0", validation_alias="FLASHRISK_VERSION")
    cors_origins: list[str] = Field(
        default=["http://localhost:3417", "http://127.0.0.1:3417"],
        validation_alias="FLASHRISK_CORS_ORIGINS",
    )
    # CDS credentials are never logged or returned by the API.
    cds_api_key: str | None = Field(default=None, validation_alias="CDS_API_KEY")
    cds_api_url: str = Field(
        default="https://cds.climate.copernicus.eu/api",
        validation_alias="CDS_API_URL",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
