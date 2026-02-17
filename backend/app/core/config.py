from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Expense Tracker"
    VERSION: str = "0.1.0"
    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        url = value.strip()
        if url.startswith("postgres://"):
            return f"postgresql+psycopg://{url[len('postgres://'):]}"
        if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
            return f"postgresql+psycopg://{url[len('postgresql://'):]}"
        return url

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
