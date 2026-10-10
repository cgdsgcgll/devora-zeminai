import os

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['LLM_PROVIDER'] = 'rule_based'
os.environ['ANALYSIS_WORKER_ENABLED'] = 'false'

import pytest
from domain_client import DomainClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import get_db
from app.main import app
from app.models.domain import Base
from postgres_support import isolated_postgres_schema


@pytest.fixture(scope='session')
def postgres_test_database():
    url=os.environ.get('TEST_DATABASE_URL')
    if not url:
        yield None
        return
    with isolated_postgres_schema(url) as isolated:
        yield isolated


@pytest.fixture
def postgres_independent_database(postgres_test_database):
    """Real-commit tests get their own schema, never polluting rollback-based tests."""
    url=os.environ.get('TEST_AUTH_CONCURRENCY_URL') or postgres_test_database
    if url is None:
        yield None
        return
    with isolated_postgres_schema(url) as isolated:
        yield isolated


@pytest.fixture
def db(postgres_test_database):
    if postgres_test_database is not None:
        engine = create_engine(postgres_test_database)
        with engine.connect() as connection:
            transaction = connection.begin()
            with Session(connection, expire_on_commit=False, join_transaction_mode='create_savepoint') as session:
                yield session
            transaction.rollback()
        engine.dispose()
        return
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with DomainClient(app, db=db, raise_server_exceptions=False) as client:
        yield client
    app.dependency_overrides.clear()
