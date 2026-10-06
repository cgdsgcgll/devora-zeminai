import os
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from app.core.config import settings

def test_auth_upgrade_preserves_legacy_and_guards_accounts(tmp_path,monkeypatch):
    url=os.environ.get('TEST_AUTH_MIGRATION_URL') or 'sqlite:///'+(tmp_path/'auth.db').as_posix()
    engine=create_engine(url)
    assert not inspect(engine).get_table_names(), 'Requires a fresh dedicated migration database'
    monkeypatch.setattr(settings,'database_url',url)
    config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    command.upgrade(config,'529ac1_living_portfolio')
    from sqlalchemy import Table,MetaData,select
    table=Table('candidates',MetaData(),autoload_with=engine)
    cid=uuid4() if engine.dialect.name=='postgresql' else uuid4().hex
    now=datetime.now(timezone.utc)
    with engine.begin() as c:
        c.execute(table.insert().values(id=cid,name='Legacy',created_at=now,updated_at=now))
    command.upgrade(config,'head');command.check(config)
    with engine.connect() as c:
        row=c.execute(text('SELECT name, owner_user_id FROM candidates')).one()
        assert row==('Legacy',None)
    command.downgrade(config,'529ac1_living_portfolio')
    command.upgrade(config,'head');command.check(config)
    from app.models import domain as m
    with engine.begin() as c:
        c.execute(m.User.__table__.insert().values(email='one@example.test',normalized_email='one@example.test',
            password_hash='test-only',role='candidate',display_name='One',is_active=True))
    with pytest.raises(RuntimeError,match='preserve/export'):
        command.downgrade(config,'529ac1_living_portfolio')
    with engine.connect() as c:
        assert c.scalar(text('SELECT count(*) FROM users'))==1
        assert c.scalar(text('SELECT count(*) FROM candidates'))==1
    engine.dispose()
