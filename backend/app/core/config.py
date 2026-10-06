from pathlib import Path
from urllib.parse import urlsplit

from typing import Literal
import ipaddress
from sqlalchemy.engine import make_url
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / '.env', extra='ignore', hide_input_in_errors=True
    )
    environment: Literal['development', 'test', 'production'] = 'development'
    trusted_hosts: list[str] = ['localhost', '127.0.0.1', 'testserver']
    api_docs_enabled: bool | None = None
    db_pool_size: int = Field(default=5, ge=1, le=20)
    db_max_overflow: int = Field(default=2, ge=0, le=20)
    db_pool_timeout: int = Field(default=5, ge=1, le=60)
    db_connect_timeout: int = Field(default=5, ge=1, le=30)
    db_statement_timeout_ms: int = Field(default=30000, ge=1000, le=120000)
    rate_limit_key: str = Field(default='local-development-only', repr=False)
    ai_window_seconds: int = Field(default=3600, ge=1, le=86400)
    ai_user_attempts: int = Field(default=10, ge=1, le=1000)
    ai_ip_attempts: int = Field(default=60, ge=1, le=10000)
    compute_window_seconds: int = Field(default=60, ge=1, le=3600)
    compute_user_attempts: int = Field(default=60, ge=1, le=10000)
    compute_ip_attempts: int = Field(default=180, ge=1, le=100000)
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/zeminai'
    github_token: str = ''
    session_cookie_name: str = Field(default='zeminai_session', pattern=r'^[A-Za-z0-9_-]+$')
    session_cookie_secure: bool = True
    session_ttl: int = Field(default=604800, ge=300, le=2592000)
    auth_window_seconds: int = Field(default=900, ge=60, le=86400)
    auth_ip_attempts: int = Field(default=60, ge=1, le=1000)
    auth_email_attempts: int = Field(default=10, ge=1, le=100)
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

    @field_validator('trusted_hosts')
    @classmethod
    def explicit_hosts(cls, hosts):
        import re
        if not hosts or any(not re.fullmatch(r'[A-Za-z0-9.-]+', h) or h.startswith('.') or h.endswith('.') for h in hosts):
            raise ValueError('TRUSTED_HOSTS requires explicit hostnames without ports or wildcards.')
        return hosts

    @model_validator(mode='after')
    def production(self):
        if self.environment != 'production':
            return self
        if not self.session_cookie_secure:
            raise ValueError('Production requires secure session cookies.')
        try:
            url = make_url(self.database_url)
            valid_db = (url.drivername == 'postgresql+psycopg' and url.host and url.database
                        and url.username and url.password and len(url.password) >= 12
                        and url.password.lower() not in {'change_me_in_production', 'replace-with-secret'})
        except Exception:
            valid_db = False
        if not valid_db:
            raise ValueError('Production requires an explicit PostgreSQL URL with non-demo credentials.')
        if len(self.rate_limit_key) < 32 or self.rate_limit_key in {'local-development-only', 'replace-with-a-random-secret-key'}:
            raise ValueError('Production requires a separate random RATE_LIMIT_KEY of at least 32 characters.')
        if not self.cors_origins or 'cors_origins' not in self.model_fields_set or 'trusted_hosts' not in self.model_fields_set:
            raise ValueError('Production requires explicit CORS_ORIGINS and TRUSTED_HOSTS.')
        for origin in self.cors_origins:
            parts = urlsplit(origin)
            host = parts.hostname or ''
            try:
                public = ipaddress.ip_address(host).is_global
            except ValueError:
                public = '.' in host and not host.endswith(('.localhost', '.local', '.internal', '.test'))
            if parts.scheme != 'https' or not public or host == 'localhost':
                raise ValueError('Production CORS origins must be explicit public HTTPS origins.')
        if any(h in {'localhost', '127.0.0.1', 'testserver'} for h in self.trusted_hosts):
            raise ValueError('Production requires deployment-specific trusted hosts.')
        if self.llm_provider not in {'rule_based', 'gemini', 'openai'}:
            raise ValueError('Unknown production LLM provider.')
        if self.llm_provider == 'gemini' and not (self.gemini_api_key.strip() and self.gemini_model.strip()):
            raise ValueError('Selected Gemini provider requires credentials and model.')
        if self.llm_provider == 'openai' and not (self.llm_api_key.strip() and self.llm_model.strip()):
            raise ValueError('Selected OpenAI provider requires credentials and model.')
        return self


settings = Settings()
