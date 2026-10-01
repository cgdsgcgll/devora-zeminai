"""Explicit PostgreSQL demo setup; never prints credentials or raw exceptions."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def prepare(migrate=False, config_only=False):
    from app.core.config import Settings
    settings = Settings()
    if 'database_url' not in settings.model_fields_set:
        raise ValueError('DATABASE_URL_REQUIRED: Set DATABASE_URL in the root .env or process environment.')
    if make_url(settings.database_url).drivername != 'postgresql+psycopg':
        raise ValueError('POSTGRESQL_REQUIRED: Configure PostgreSQL with psycopg; no fallback is used.')
    if settings.llm_provider not in {'rule_based', 'gemini', 'openai'}:
        raise ValueError('PROVIDER_INVALID: Select rule_based, gemini or openai.')
    if settings.llm_provider == 'gemini' and not (settings.gemini_api_key.strip() and settings.gemini_model.strip()):
        raise ValueError('GEMINI_CONFIG_REQUIRED: Configure GEMINI_API_KEY and GEMINI_MODEL, or select rule_based.')
    if settings.llm_provider == 'openai' and not (settings.llm_api_key.strip() and settings.llm_model.strip()):
        raise ValueError('OPENAI_CONFIG_REQUIRED: Configure LLM_API_KEY and LLM_MODEL, or select rule_based.')
    if config_only:
        return
    engine = create_engine(settings.database_url, connect_args={'connect_timeout': 5})
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
        if migrate:
            command.upgrade(config, 'head')
        with engine.connect() as connection:
            actual = set(MigrationContext.configure(connection).get_current_heads())
        if actual != set(ScriptDirectory.from_config(config).get_heads()):
            raise ValueError('MIGRATIONS_REQUIRED: Run the demo setup with --migrate.')
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--migrate', action='store_true')
    parser.add_argument('--config-only', action='store_true')
    args = parser.parse_args()
    try:
        prepare(args.migrate, args.config_only)
    except ValueError as exc:
        # Only our fixed diagnostic strings may be displayed, never parser/driver values.
        message = str(exc)
        prefixes = ('DATABASE_URL_REQUIRED:', 'POSTGRESQL_REQUIRED:', 'PROVIDER_INVALID:',
                    'GEMINI_CONFIG_REQUIRED:', 'OPENAI_CONFIG_REQUIRED:', 'MIGRATIONS_REQUIRED:')
        print(message if message.startswith(prefixes) else 'CONFIG_INVALID: Check local environment settings.')
        return 1
    except Exception:
        print('DATABASE_SETUP_FAILED: Check PostgreSQL availability, credentials and migration permissions. No fallback was used.')
        return 1
    print('CONFIG_OK' if args.config_only else 'DATABASE_READY: PostgreSQL is reachable and migrations are current.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
