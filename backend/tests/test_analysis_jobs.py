"""Import commits before analysis; real queue transitions use unchanged analyzers."""
from copy import deepcopy
from datetime import timedelta
from time import perf_counter
from uuid import UUID
import pytest
from sqlalchemy import select, func
from app.core.config import settings
from app.core.errors import AppError
from app.models import domain as m
from app.models.github_account import GitHubRepositoryLink
from app.schemas.domain import utcnow
from app.services import analysis_jobs as jobs, workflows
from app.services.analysis.factory import skill_analyzer
from app.services.github.provider import GitHubProvider
from test_github import mock_transport
from test_auth import accounts
from test_github_account import github, connected

def source():
    return GitHubProvider(transport=mock_transport())

def repos(github):
    original=deepcopy(github['repositories'][0])
    github['repositories']=[]
    for i in range(3):
        repo=deepcopy(original)
        repo.update(id=101+i,full_name='test/repo',html_url='https://github.com/test/repo',private=False)
        repo['owner']['login']='test'
        github['repositories'].append(repo)
    return ['101','102','103']

def batch(client, ids):
    response=client.post('/github/import-batch',json={'installation_id':'42','repository_ids':ids})
    assert response.status_code==200,response.text
    return response.json()['items']

def activity(client,pid):
    response=client.get('/projects/'+pid+'/activity')
    assert response.status_code==200,response.text
    return response.json()

def test_import_response_never_waits_for_source_or_analyzer(accounts,github,db,monkeypatch):
    client,_=accounts();connected(client)
    ids=repos(github)
    def prohibited(*args,**kwargs):
        pytest.fail('Analysis executed in import request')
    monkeypatch.setattr(workflows,'analyze_project',prohibited)
    start=perf_counter()
    results=batch(client,ids)
    elapsed=perf_counter()-start
    print(f' three-repository import response: {elapsed*1000:.2f} ms')
    assert elapsed<5
    assert [r['result']['analysis']['state'] for r in results]==['queued']*3
    assert db.scalar(select(func.count()).select_from(m.Project))==3
    assert db.scalar(select(func.count()).select_from(GitHubRepositoryLink))==3
    assert db.scalar(select(func.count()).select_from(m.AnalysisRun))==0

def test_three_repo_independent_success_failure_retry_and_idempotency(accounts,github,db):
    client,_=accounts();connected(client);ids=repos(github)
    results=batch(client,ids)
    pids=[r['result']['project']['id'] for r in results]
    class FailedAnalyzer:
        version='synthetic-failure'
        def analyze_project(self,data):raise AppError('LLM_TIMEOUT','Synthetic timeout',504)
    for _ in range(3):
        jid=jobs.claim(db);job=db.get(m.AnalysisJob,jid)
        jobs.execute(db,jid,source(),FailedAnalyzer() if str(job.project_id)==pids[1] else skill_analyzer(settings))
    states=[activity(client,p) for p in pids]
    assert [a['analysis']['state'] for a in states]==['succeeded','failed','succeeded']
    assert all(a['link']['revoked_at'] is None for a in states)
    assert states[0]['evidence'] and states[2]['evidence']
    assert states[1]['analysis']['error_code']=='LLM_TIMEOUT'
    assert client.get('/github/connection').json()['connection']['revoked_at'] is None
    link_ids=[a['link']['id'] for a in states]
    again=batch(client,ids+['999','101'])
    assert [r['status'] for r in again]==['existing','existing','existing','failed']
    assert [r['result']['project']['id'] for r in again[:3]]==pids
    assert db.scalar(select(func.count()).select_from(m.AnalysisJob))==3
    retry=client.post('/projects/'+pids[1]+'/analysis-jobs')
    assert retry.status_code==202 and retry.json()['state']=='queued'
    duplicate=client.post('/projects/'+pids[1]+'/analysis-jobs')
    assert duplicate.json()['job_id']==retry.json()['job_id']
    assert client.post('/projects/'+pids[1]+'/analyze').status_code==409
    jid=jobs.claim(db);jobs.execute(db,jid,source(),skill_analyzer(settings))
    assert [activity(client,p)['analysis']['state'] for p in pids]==['succeeded']*3
    assert [activity(client,p)['link']['id'] for p in pids]==link_ids
    assert db.scalar(select(func.count()).select_from(m.Project))==3
    assert db.scalar(select(func.count()).select_from(m.AnalysisRun))==4

@pytest.mark.parametrize('claimed',[False,True])
def test_expired_jobs_reconcile_after_restart_and_late_worker_cannot_succeed(accounts,github,db,claimed):
    client,_=accounts();connected(client);pid=batch(client,repos(github)[:1])[0]['result']['project']['id']
    jid=jobs.claim(db) if claimed else db.scalar(select(m.AnalysisJob.id))
    job=db.get(m.AnalysisJob,jid);job.deadline=utcnow()-timedelta(seconds=1);db.commit()
    state=activity(client,pid)
    assert state['analysis']['state']=='failed'
    assert state['analysis']['error_code']==('ANALYSIS_TIMEOUT' if claimed else 'ANALYSIS_QUEUE_TIMEOUT')
    if claimed:
        jobs.execute(db,jid,source(),skill_analyzer(settings))
        assert activity(client,pid)['analysis']['state']=='failed'
        assert not activity(client,pid)['evidence']
    assert activity(client,pid)['link']['revoked_at'] is None

def test_archiving_active_project_cancels_job_without_late_evidence(accounts,github,db):
    client,_=accounts();connected(client);pid=batch(client,repos(github)[:1])[0]['result']['project']['id']
    jid=jobs.claim(db)
    assert client.delete('/projects/'+pid).status_code==204
    jobs.execute(db,jid,source(),skill_analyzer(settings))
    assert db.get(m.AnalysisJob,jid).status=='failed'
    assert db.scalar(select(func.count()).select_from(m.SkillEvidence))==0

def test_analysis_queue_candidate_ownership_and_csrf(accounts,github):
    client,_=accounts();connected(client);pid=batch(client,repos(github)[:1])[0]['result']['project']['id']
    other,_=accounts();institution,_=accounts(role='institution')
    endpoint='/projects/'+pid+'/analysis-jobs'
    assert other.post(endpoint).status_code==404
    assert institution.post(endpoint).status_code==403
    assert client.post(endpoint,headers={'Origin':'https://evil.test'}).status_code==403
    assert institution.post('/github/import-batch',json={'installation_id':'42','repository_ids':['101']}).status_code==403

from test_auth_audit import independent_db
from sqlalchemy.orm import Session
from concurrent.futures import ThreadPoolExecutor

def test_atomic_claim_independent_connections_and_restart_persistence(independent_db):
    with Session(independent_db) as db:
        candidate=m.Candidate(name='Queue test');db.add(candidate);db.flush()
        project=m.Project(candidate_id=candidate.id,name='Queue test',description='',source_type='github',source_url='https://github.com/test/repo')
        db.add(project);db.flush()
        job=m.AnalysisJob(project_id=project.id,status='queued',deadline=utcnow()+timedelta(minutes=1))
        db.add(job);db.commit();jid,pid=job.id,project.id
    def claim():
        with Session(independent_db) as db:return jobs.claim(db)
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims=list(pool.map(lambda _:claim(),range(2)))
    assert claims.count(jid)==1 and claims.count(None)==1
    # A new worker/session sees the durable claim after the claimant has gone.
    with Session(independent_db) as db:
        assert jobs.view(db,pid)['state']=='analyzing'
        jobs.execute(db,jid,source(),skill_analyzer(settings))
    with Session(independent_db) as db:
        assert jobs.view(db,pid)['state']=='succeeded'
        assert db.scalar(select(func.count()).select_from(m.AnalysisRun))==1
        assert db.scalar(select(func.count()).select_from(m.SkillEvidence))>0


def test_started_worker_processes_durable_queue_without_request_waiting(independent_db,monkeypatch):
    from time import sleep, monotonic
    from app.services.github import provider as provider_module
    from app.services.analysis import factory
    provider=source()
    analyzer=skill_analyzer(settings)
    monkeypatch.setattr(provider_module,'GitHubProvider',lambda *args:provider)
    monkeypatch.setattr(factory,'skill_analyzer',lambda *args:analyzer)
    monkeypatch.setattr(settings,'analysis_worker_threads',1)
    with Session(independent_db) as db:
        candidate=m.Candidate(name='Worker test');db.add(candidate);db.flush()
        project=m.Project(candidate_id=candidate.id,name='Worker test',description='',source_type='github',source_url='https://github.com/test/repo')
        db.add(project);db.flush()
        db.add(m.AnalysisJob(project_id=project.id,status='queued',deadline=utcnow()+timedelta(minutes=1)))
        db.commit();pid=project.id
    stop=jobs.start_workers(lambda:Session(independent_db,expire_on_commit=False))
    try:
        deadline=monotonic()+10
        while monotonic()<deadline:
            with Session(independent_db) as db:
                state=db.scalar(select(m.AnalysisJob.status).where(m.AnalysisJob.project_id==pid))
                if state in ('succeeded','failed'):break
            sleep(.02)
        assert state=='succeeded'
    finally:stop.set()
