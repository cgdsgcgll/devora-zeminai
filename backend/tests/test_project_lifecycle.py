from pathlib import Path
from uuid import UUID, uuid4
import pytest
from sqlalchemy import select, func, inspect, create_engine, text
from alembic import command
from alembic.config import Config
from app.main import app
from app.models import domain as m
from app.models.github_account import GitHubRepositoryLink
from app.core.config import settings
from app.api.routes import get_github
from app.services.github.provider import GitHubProvider
from test_github import mock_transport
from test_auth import accounts
from test_product import context
from test_github_account import github, connected, link, project
from test_github_invariants import github_migration_database


def test_multiple_projects_archive_create_again_and_ownership(context, github, db):
    candidate, other, institution, _, first, match, _ = context
    state=candidate.get('/auth/me').json()
    second=project(candidate,state)
    original=institution.get('/matches/'+match['id']).json()
    profile=candidate.post('/candidates/'+state['candidate']['id']+'/profile-evidence',json={'category':'certification','title':'Independent'}).json()
    connected(candidate)
    github['repositories'][0].update(full_name='test/repo',html_url='https://github.com/test/repo')
    github['repositories'][0]['owner']['login']='test'
    assert link(candidate,first['id']).status_code==200
    endpoint='/projects/'+first['id']
    for method in ('delete','patch'):
        kwargs={'json':{'name':'changed'}} if method=='patch' else {}
        assert getattr(other,method)(endpoint,**kwargs).status_code==404
        assert getattr(institution,method)(endpoint,**kwargs).status_code==403
    assert candidate.delete(endpoint,headers={'Origin':'https://evil.test'}).status_code==403
    assert candidate.patch(endpoint,json={'name':'Renamed','description':'metadata only'}).status_code==200
    evidence_count=db.scalar(select(func.count()).select_from(m.SkillEvidence))
    assert candidate.delete(endpoint).status_code==204
    assert candidate.get(endpoint).status_code==404
    assert candidate.post(endpoint+'/analyze').status_code==404
    assert [p['id'] for p in candidate.get('/candidates/'+state['candidate']['id']+'/projects').json()]==[second]
    assert candidate.get('/profile-evidence/'+profile['id']).status_code==200
    assert institution.get('/matches/'+match['id']).json()==original
    assert db.scalar(select(func.count()).select_from(m.SkillEvidence))==evidence_count
    relation=db.scalar(select(GitHubRepositoryLink).where(GitHubRepositoryLink.project_id==UUID(first['id'])))
    assert relation.revoked_at is not None
    third=project(candidate,state)
    assert third!=second
    from app.services.matching.material import load_material
    material=load_material(db,[UUID(state['candidate']['id'])])[UUID(state['candidate']['id'])]
    assert UUID(first['id']) not in {p.id for p in material.projects}
    assert not material.evidence
    assert db.scalar(select(m.Project).where(m.Project.id==UUID(first['id']))).archived_at
    if db.bind.dialect.name=='sqlite': assert not db.execute(text('PRAGMA foreign_key_check')).all()


@pytest.mark.parametrize('private,owner_type', [(False,'User'),(False,'Organization'),(True,'User')])
def test_selected_import_idempotent_analysis_and_private_limit(accounts, github, db, private, owner_type):
    client,state=accounts();connected(client)
    github['repositories'][0].update(private=private,full_name='test/repo',html_url='https://github.com/test/repo')
    github['repositories'][0]['owner'].update(login='test',type=owner_type)
    app.dependency_overrides[get_github]=lambda:GitHubProvider(transport=mock_transport())
    payload={'installation_id':'42','repository_id':'9007199254740993'}
    assert client.post('/github/import',json=payload,headers={'Origin':'https://evil.test'}).status_code==403
    response=client.post('/github/import',json=payload)
    assert response.status_code==200,response.text
    result=response.json();assert result['created'] and result['analysis']['state']==('not_started' if private else 'queued')
    pid=result['project']['id']
    activity=client.get('/projects/'+pid+'/activity').json()
    assert activity['link']['relationship']==('personal_owner' if owner_type=='User' else 'account_access')
    if private:
        assert activity['run'] is None and not activity['evidence']
        assert client.post('/projects/'+pid+'/analyze').json()['error']['code']=='PRIVATE_ANALYSIS_UNSUPPORTED'
    else:
        from app.services import analysis_jobs as jobs
        from app.services.analysis.factory import skill_analyzer
        jobs.execute(db,jobs.claim(db),GitHubProvider(transport=mock_transport()),skill_analyzer(settings))
        activity=client.get('/projects/'+pid+'/activity').json()
        assert activity['analysis']['state']=='succeeded'
        assert activity['run']['status']=='completed'
        assert any(e['evidence_status']=='observed' for e in activity['evidence'])
        live=client.get('/candidates/'+state['candidate']['id']+'/living-profile').json()
        assert any(p['status']=='observed' for p in live['passport'])
    count=db.scalar(select(func.count()).select_from(m.AnalysisRun))
    again=client.post('/github/import',json=payload).json()
    assert not again['created'] and again['project']['id']==pid
    assert db.scalar(select(func.count()).select_from(m.AnalysisRun))==count
    assert client.get('/github/installations/42/repositories').json()[0]['imported_project_id']==pid
    assert client.delete('/projects/'+pid).status_code==204
    assert client.post('/github/import',json=payload).json()['project']['id']!=pid


def test_import_source_failure_keeps_relationship_and_retry(accounts,github,db):
    from app.core.errors import AppError
    client,_=accounts();connected(client);github['repositories'][0]['private']=False
    class FailedSource:
        def fetch(self,url): raise AppError('GITHUB_FETCH_FAILED','Source unavailable',502)
    app.dependency_overrides[get_github]=FailedSource
    response=client.post('/github/import',json={'installation_id':'42','repository_id':'9007199254740993'})
    assert response.status_code==200,response.text
    item=response.json();assert item['analysis']['state']=='queued'
    from app.services import analysis_jobs as jobs
    from app.services.analysis.factory import skill_analyzer
    jobs.execute(db,jobs.claim(db),FailedSource(),skill_analyzer(settings))
    activity=client.get('/projects/'+item['project']['id']+'/activity').json()
    assert activity['link']['revoked_at'] is None and activity['run']['status']=='failed'
    assert client.get('/github/connection').json()['connection']['revoked_at'] is None


@pytest.mark.parametrize('status',[401,403,404])
def test_import_access_errors_fail_closed(accounts,github,db,status):
    client,_=accounts();connected(client)
    github['status']['/user/installations/42/repositories']=status
    response=client.post('/github/import',json={'installation_id':'42','repository_id':'9007199254740993'})
    assert response.status_code==409
    assert db.scalar(select(func.count()).select_from(m.Project))==0
    connection=client.get('/github/connection').json()['connection']
    assert bool(connection['revoked_at'])==(status==401)


def test_a16_upgrade_from_a15_preserves_data(github_migration_database,monkeypatch):
    url=github_migration_database
    monkeypatch.setattr(settings,'database_url',url)
    config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    command.upgrade(config,'a15_github_verification')
    engine=create_engine(url);cid,pid=uuid4(),uuid4()
    with engine.begin() as conn:
        conn.execute(m.Candidate.__table__.insert().values(id=cid,name='Existing'))
        conn.execute(m.Project.__table__.insert().values(id=pid,candidate_id=cid,name='Kept',description='',source_type='github',source_url='https://github.com/test/repo'))
    command.upgrade(config,'head');command.check(config)
    with engine.connect() as conn:
        row=conn.execute(select(m.Project.__table__).where(m.Project.id==pid)).mappings().one()
        assert row['name']=='Kept' and row['archived_at'] is None and row['github_repository_id'] is None
    assert 'uq_active_import_repository' in {i['name'] for i in inspect(engine).get_indexes('projects')}
    engine.dispose()
