"""
config.py — App settings and database engine (MySQL via SQLAlchemy)
"""
from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import create_engine          # sync engine for LangChain toolkit


class Settings(BaseSettings):
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "finance_user"
    mysql_password: str = ""
    # Railway exposes MYSQL_DATABASE; local .env can use either name
    mysql_db: str = "finance_tracker"
    mysql_database: str = ""          # populated by Railway's plugin

    openai_api_key: str = ""
    app_secret_key: str = "change_me"
    debug: bool = False

    # Comma-separated list of allowed CORS origins
    cors_origins: str = "http://localhost:5173"

    @field_validator("mysql_port", mode="before")
    @classmethod
    def coerce_empty_port(cls, v):
        return 3306 if v == "" else v

    class Config:
        env_file = ".env"

    @property
    def effective_db_name(self) -> str:
        return self.mysql_database or self.mysql_db

    # ── Connection URL helpers ────────────────────────────────
    @property
    def async_db_url(self) -> str:
        """aiomysql driver — used by FastAPI async routes."""
        return (
            f"mysql+aiomysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.effective_db_name}"
            f"?charset=utf8mb4"
        )

    @property
    def sync_db_url(self) -> str:
        """PyMySQL driver — used by LangChain's SQL toolkit (sync only)."""
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.effective_db_name}"
            f"?charset=utf8mb4"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ── Async engine (FastAPI) ────────────────────────────────────
def build_async_engine(settings: Settings):
    return create_async_engine(
        settings.async_db_url,
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600,    # recycle connections every hour
        pool_pre_ping=True,   # verify connection health before use
        echo=settings.debug,
    )


def build_session_factory(engine):
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


# ── Sync engine (LangChain) ───────────────────────────────────
def build_sync_engine(settings: Settings):
    return create_engine(
        settings.sync_db_url,
        pool_size=5,
        max_overflow=10,
        pool_recycle=3600,
        pool_pre_ping=True,
        echo=settings.debug,
    )