from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4, UUID
import os
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models import domain as m
from app.models.github_account import GitHubConnection
from test_auth import accounts
from test_product import context
from test_github_account import github, connected, link
from postgres_support import isolated_postgres_schema


@pytest.fixture
def github_migration_database(tmp_path,postgres_test_database):
    url=os.environ.get('TEST_GITHUB_MIGRATION_URL') or postgres_test_database
    if url is not None:
        with isolated_postgres_schema(url,migrate=False) as isolated:
            yield isolated
    else:
        yield 'sqlite:///'+(tmp_path/'github-migration.db').as_posix()


@pytest.fixture
def github_concurrency_database(tmp_path,postgres_test_database):
    override=os.environ.get('TEST_GITHUB_CONCURRENCY_URL')
    if override:
        with isolated_postgres_schema(override) as isolated:
            yield isolated
    else:
        yield postgres_test_database or 'sqlite:///'+(tmp_path/'github-concurrent.db').as_posix()


def test_provenance_never_changes_matching_trace_or_proof(context, github, db):
    candidate,other,institution,stranger,project,match,payload=context
    github['repositories'][0].update(full_name='test/repo',html_url='https://github.com/test/repo')
    github['repositories'][0]['owner']['login']='test'
    original=institution.get('/matches/'+match['id']).json()
    evidence_before=candidate.get('/projects/'+project['id']+'/evidence').json()
    def unchanged():
        current=institution.post('/matches',json={'candidate_id':match['candidate_id'],'need_id':match['need_id']}).json()
        assert current['score']==original['score']
        ospf=next(c for c in current['unmatched_criteria'] if c['skill_key']=='ospf')
        assert not ospf['matched'] and all(e['status']!='observed' for e in ospf['trace_items'])
        assert institution.get('/matches/'+match['id']).json()==original
        assert candidate.get('/projects/'+project['id']+'/evidence').json()==evidence_before
    connected(candidate);unchanged()
    assert link(candidate,project['id']).status_code==200
    unchanged()
    proof=institution.post('/proof-requests',json=payload).json()
    submitted=candidate.post('/proof-requests/'+proof['id']+'/submit',
        json={'source_url':'https://github.com/test/repo','note':'linked work'}).json()
    assert submitted['submission']['status']=='linked'
    assert institution.patch('/proof-requests/'+proof['id'],json={'status':'closed'}).status_code==200
    unchanged()
    assert candidate.delete('/github/connection').status_code==204
    unchanged()
    # Strength is descriptive even after account verification.
    for row in db.scalars(select(m.SkillEvidence)):
        row.evidence_strength='weak' if row.evidence_strength=='strong' else 'strong'
    db.commit()
    current=institution.post('/matches',json={'candidate_id':match['candidate_id'],'need_id':match['need_id']}).json()
    assert current['score']==original['score']
    assert institution.get('/matches/'+match['id']).json()==original


def test_github_migration_preserves_existing_data_and_guards_downgrade(github_migration_database,monkeypatch):
    url=github_migration_database
    engine=create_engine(url)
    assert not inspect(engine).get_table_names(), 'Use a fresh isolated migration database/schema.'
    monkeypatch.setattr(settings,'database_url',url)
    config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    command.upgrade(config,'a14_proof_requests')
    cid,pid=uuid4(),uuid4()
    with engine.begin() as conn:
        conn.execute(m.Candidate.__table__.insert().values(id=cid,name='Legacy'))
        conn.execute(m.Project.__table__.insert().values(id=pid,candidate_id=cid,name='Existing',
            description='',source_type='github',source_url='https://github.com/test/repo'))
    def saved():
        with engine.connect() as conn:
            return conn.execute(select(*[c for c in m.Project.__table__.columns if c.name not in {'archived_at','github_repository_id','repository_private'}])).mappings().all()
    before=saved()
    command.upgrade(config,'head');command.check(config)
    assert saved()==before
    command.downgrade(config,'a14_proof_requests')
    assert saved()==before
    command.upgrade(config,'head');command.check(config)
    with Session(engine) as db:
        db.add(GitHubConnection(candidate_id=cid,github_user_id='123',github_login='test'));db.commit()
    with pytest.raises(RuntimeError,match='preserve/export'):
        command.downgrade(config,'a14_proof_requests')
    assert saved()==before
    engine.dispose()


def test_concurrent_identity_unique_constraint(github_concurrency_database):
    url=github_concurrency_database
    engine=create_engine(url)
    if engine.dialect.name=='sqlite': m.Base.metadata.create_all(engine)
    ids=[uuid4(),uuid4()]
    identity=str(uuid4().int % 10**19 + 1)
    with Session(engine) as db:
        db.add_all([m.Candidate(id=cid,name='Concurrent') for cid in ids]);db.commit()
    barrier=Barrier(2)
    def claim(cid):
        with Session(engine) as db:
            barrier.wait(timeout=10)
            db.add(GitHubConnection(candidate_id=cid,github_user_id=identity,github_login='test'))
            try: db.commit();return True
            except IntegrityError: db.rollback();return False
    try:
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(claim,ids))
        assert sorted(results)==[False,True]
        with Session(engine) as db:
            assert len(db.scalars(select(GitHubConnection).where(GitHubConnection.github_user_id==identity)).all())==1
    finally:
        with engine.begin() as conn:
            conn.execute(GitHubConnection.__table__.delete().where(GitHubConnection.candidate_id.in_(ids)))
            conn.execute(m.Candidate.__table__.delete().where(m.Candidate.id.in_(ids)))
        engine.dispose()
