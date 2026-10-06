from functools import lru_cache
from pathlib import Path
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text


@lru_cache
def expected_heads():
    config = Config(str(Path(__file__).resolve().parents[2] / 'alembic.ini'))
    return set(ScriptDirectory.from_config(config).get_heads())


def check_database(connection):
    connection.execute(text('SELECT 1'))
    if set(MigrationContext.configure(connection).get_current_heads()) != expected_heads():
        raise RuntimeError('MIGRATIONS_REQUIRED')
