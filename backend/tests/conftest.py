import os

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['LLM_PROVIDER'] = 'rule_based'

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import get_db
from app.main import app
from app.models.domain import Base


@pytest.fixture
def db():
    if os.environ.get('TEST_DATABASE_URL'):
        engine = create_engine(os.environ['TEST_DATABASE_URL'])
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
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    app.dependency_overrides.clear()
