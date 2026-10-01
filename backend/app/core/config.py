from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / '.env', extra='ignore'
    )
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/zeminai'
    github_token: str = ''
    cors_origins: list[str] = ['http://localhost:3000', 'http://127.0.0.1:3000']
    llm_api_key: str = ''
    llm_provider: str = 'rule_based'
    llm_model: str = ''
    gemini_api_key: str = ''
    gemini_model: str = ''
    llm_timeout_seconds: float = Field(default=30, gt=0, le=300)
    llm_max_retries: int = Field(default=2, ge=0, le=2)
    llm_max_input_bytes: int = Field(default=24000, ge=8000, le=100000)
    llm_max_output_tokens: int = Field(default=4000, ge=256, le=16000)

    @field_validator('cors_origins')
    @classmethod
    def explicit_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            parts = urlsplit(origin)
            if (parts.scheme not in {'http', 'https'} or not parts.hostname
                    or '*' in origin or parts.username or parts.password
                    or parts.path or parts.query or parts.fragment or origin != origin.strip()):
                raise ValueError('CORS_ORIGINS must contain explicit HTTP(S) origins without paths or credentials.')
            _ = parts.port  # Reject malformed/out-of-range ports at startup.
        return origins


settings = Settings()
