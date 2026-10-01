from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core.config import settings


def test_migration_upgrade_check_downgrade(tmp_path, monkeypatch):
    url = 'sqlite:///' + (tmp_path / 'migration.db').as_posix()
    monkeypatch.setattr(settings, 'database_url', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, 'head')
    engine = create_engine(url)
    assert 'match_evidence' in inspect(engine).get_table_names()
    command.check(config)
    engine.dispose()
    command.downgrade(config, 'base')
    engine = create_engine(url)
    assert inspect(engine).get_table_names() == ['alembic_version']
    engine.dispose()


def test_upgrade_preserves_existing_analysis(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    from uuid import uuid4
    from sqlalchemy import MetaData, Table, select

    url = 'sqlite:///' + (tmp_path / 'legacy.db').as_posix()
    monkeypatch.setattr(settings, 'database_url', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '5aacc06c939c')
    engine = create_engine(url)
    metadata = MetaData()
    needs = Table('organization_needs', metadata, autoload_with=engine)
    runs = Table('analysis_runs', metadata, autoload_with=engine)
    # Reflected SQLite UUID columns are CHAR; these inserts model already-stored v0.1 rows.
    need_id, run_id = uuid4().hex, uuid4().hex
    now = datetime.now(timezone.utc)
    with engine.begin() as connection:
        connection.execute(needs.insert().values(id=need_id, description='Python',
            uncertainties=[], analysis_version='rules-need-v0.1', created_at=now, updated_at=now))
        connection.execute(runs.insert().values(id=run_id, need_id=need_id, analysis_type='need',
            status='completed', analysis_version='rules-need-v0.1', started_at=now, completed_at=now,
            limitations=[], uncertainties=[]))
    engine.dispose()
    command.upgrade(config, 'head')
    engine = create_engine(url)
    current = Table('analysis_runs', MetaData(), autoload_with=engine)
    with engine.connect() as connection:
        saved = connection.execute(select(current)).mappings().one()
        assert saved['id'] == run_id
        assert saved['analysis_version'] == 'rules-need-v0.1'
        assert saved['provider'] is None and saved['model'] is None and saved['commit_sha'] is None
    engine.dispose()
    command.downgrade(config, 'base')
    engine = create_engine(url)
    assert inspect(engine).get_table_names() == ['alembic_version']
    engine.dispose()
