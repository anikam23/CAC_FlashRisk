from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FLASHRISK_", env_file=".env", extra="ignore"
    )

    app_name: str = "flashrisk-backend"
    version: str = "0.1.0"
    cors_origins: list[str] = ["http://localhost:3417", "http://127.0.0.1:3417"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
