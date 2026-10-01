from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / '.env', extra='ignore'
    )
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/zeminai'
    github_token: str = ''
    llm_api_key: str = ''
    llm_provider: str = 'rule_based'
    llm_model: str = ''
    gemini_api_key: str = ''
    gemini_model: str = ''
    llm_timeout_seconds: float = Field(default=30, gt=0, le=300)
    llm_max_retries: int = Field(default=2, ge=0, le=2)
    llm_max_input_bytes: int = Field(default=24000, ge=8000, le=100000)
    llm_max_output_tokens: int = Field(default=4000, ge=256, le=16000)


settings = Settings()
