from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core.config import settings


def test_portfolio_migration_preserves_profile_and_guards_downgrade(tmp_path, monkeypatch):
    import os
    import pytest
    from uuid import uuid4
    from sqlalchemy import select
    from app.models import domain as m
    url = os.environ.get('TEST_PORTFOLIO_MIGRATION_URL') or 'sqlite:///' + (tmp_path / 'portfolio.db').as_posix()
    engine = create_engine(url)
    assert not inspect(engine).get_table_names(), 'Use an empty dedicated migration database.'
    monkeypatch.setattr(settings, 'database_url', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '41c0cbaf4250')
    cid, eid = uuid4(), uuid4()
    values = dict(id=eid, candidate_id=cid, category='education', title='Existing education', organization='',
        role='', description='', source_label='', verification_status='declared_only', metadata_json={})
    with engine.begin() as connection:
        connection.execute(m.Candidate.__table__.insert().values(id=cid, name='Existing candidate'))
        connection.execute(m.ProfileEvidenceItem.__table__.insert().values(**values))
    def saved():
        with engine.connect() as connection:
            return connection.execute(select(m.ProfileEvidenceItem.__table__)).mappings().all()
    before = saved()
    command.upgrade(config, 'head')
    command.check(config)
    assert saved() == before
    command.downgrade(config, '41c0cbaf4250')
    assert saved() == before
    command.upgrade(config, 'head')
    command.check(config)
    assert saved() == before
    with engine.begin() as connection:
        connection.execute(m.ProfileEvidenceItem.__table__.insert().values(**{**values, 'id':uuid4(), 'category':'portfolio'}))
    with pytest.raises(RuntimeError, match='preserve/export'):
        command.downgrade(config, '41c0cbaf4250')
    assert len(saved()) == 2
    engine.dispose()


def test_profile_migration_preserves_legacy_project_evidence(tmp_path, monkeypatch):
    import os
    from uuid import uuid4
    from sqlalchemy import select
    from app.models import domain as m

    # Optional PostgreSQL target must be a newly created, dedicated test DB.
    url = os.environ.get('TEST_MIGRATION_DATABASE_URL') or 'sqlite:///' + (tmp_path / 'profile-migration.db').as_posix()
    engine = create_engine(url)
    assert not inspect(engine).get_table_names(), 'Migration regression requires an empty dedicated database.'
    monkeypatch.setattr(settings, 'database_url', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '6b02_llm_metadata')
    cid, pid, sid, rid, eid = [uuid4() for _ in range(5)]
    with engine.begin() as connection:
        connection.execute(m.Candidate.__table__.insert().values(id=cid, name='Preserve candidate'))
        connection.execute(m.Project.__table__.insert().values(id=pid, candidate_id=cid,
            name='Preserve project', description='', source_type='github', source_url='https://github.com/test/repo'))
        connection.execute(m.RepositorySnapshot.__table__.insert().values(id=sid, project_id=pid,
            repository_url='https://github.com/test/repo', default_branch='main', commit_sha='a'*40,
            readme='', languages={}, files=[], limitations=[]))
        connection.execute(m.AnalysisRun.__table__.insert().values(id=rid, project_id=pid,
            analysis_type='project', status='completed', analysis_version='legacy'))
        connection.execute(m.SkillEvidence.__table__.insert().values(id=eid, candidate_id=cid, project_id=pid,
            snapshot_id=sid, analysis_run_id=rid, skill_key='python', skill_label='Python', evidence_status='observed',
            evidence_strength='strong', evidence_type='source_file', source_url='https://github.com/test/repo',
            excerpt='print(1)', reason='Source', limitations=[]))
    tables = [m.Candidate.__table__, m.Project.__table__, m.RepositorySnapshot.__table__, m.SkillEvidence.__table__]
    def saved():
        with engine.connect() as connection:
            return [connection.execute(select(*[c for c in table.c if c.name not in {"owner_user_id", "archived_at", "github_repository_id", "repository_private"}])).mappings().all() for table in tables]
    before = saved()
    command.upgrade(config, 'head')
    command.check(config)
    assert saved() == before
    command.downgrade(config, '6b02_llm_metadata')
    assert saved() == before
    command.upgrade(config, 'head')
    command.check(config)
    assert saved() == before
    assert 'profile_evidence_items' in inspect(engine).get_table_names()
    engine.dispose()


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
