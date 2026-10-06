from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

def engine_options(config):
    options = {'pool_pre_ping': True}
    if config.database_url.startswith('postgresql'):
        options.update(pool_size=config.db_pool_size, max_overflow=config.db_max_overflow,
                       pool_timeout=config.db_pool_timeout,
                       connect_args={'connect_timeout': config.db_connect_timeout,
                                     'options': f'-c statement_timeout={config.db_statement_timeout_ms}'})
    return options


engine = create_engine(settings.database_url, **engine_options(settings))
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
