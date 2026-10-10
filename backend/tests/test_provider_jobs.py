"""Real job/transaction lifecycle with mocked provider HTTP, never real credentials."""
import json
import httpx
import pytest
from sqlalchemy import select, func
from app.models import domain as m
from app.models.github_account import GitHubRepositoryLink
from app.services import analysis_jobs as jobs
from app.services.analysis.llm_analyzers import ProjectSkillAnalyzer
from app.services.llm.gemini_provider import GeminiProvider
from test_auth import accounts
from test_github_account import github, connected
from test_analysis_jobs import batch, repos, source, activity
from test_gemini import envelope
from test_llm import evidence_draft
from test_auth_audit import independent_db


@pytest.mark.parametrize('failure', [429, 500, 'timeout'])
def test_transient_http_keeps_one_run_and_one_evidence(accounts, github, db, monkeypatch, failure):
    monkeypatch.setattr('app.services.llm.gemini_provider.time.sleep', lambda _: None)
    client,_=accounts();connected(client)
    pid=batch(client,repos(github)[:1])[0]['result']['project']['id']
    calls=[]
    def handle(request):
        calls.append(1)
        if len(calls)==1:
            if failure=='timeout':raise httpx.ReadTimeout('SECRET',request=request)
            return httpx.Response(failure)
        return httpx.Response(200,json=envelope(json.dumps(evidence_draft())))
    analyzer=ProjectSkillAnalyzer(GeminiProvider('test-key','test-model',transport=httpx.MockTransport(handle)))
    jobs.execute(db,jobs.claim(db),source(),analyzer)
    assert activity(client,pid)['analysis']['state']=='succeeded'
    assert len(calls)==2
    assert db.scalar(select(func.count()).select_from(m.AnalysisRun))==1
    assert db.scalar(select(func.count()).select_from(m.SkillEvidence))==1


@pytest.mark.parametrize('status,code,count,retryable', [
    (429,'LLM_RATE_LIMITED',3,True),(401,'LLM_CONFIGURATION_ERROR',1,False),
    (403,'LLM_CONFIGURATION_ERROR',1,False),(400,'LLM_REQUEST_REJECTED',1,False)])
def test_terminal_failure_preserves_provenance_and_safe_diagnostics(accounts,github,db,monkeypatch,caplog,status,code,count,retryable):
    monkeypatch.setattr('app.services.llm.gemini_provider.time.sleep',lambda _:None)
    client,_=accounts();connected(client)
    pid=batch(client,repos(github)[:1])[0]['result']['project']['id']
    calls=[]
    def handle(request):
        calls.append(1)
        return httpx.Response(status,text='SECRET raw body')
    analyzer=ProjectSkillAnalyzer(GeminiProvider('SECRET','test-model',transport=httpx.MockTransport(handle)))
    jid=jobs.claim(db);jobs.execute(db,jid,source(),analyzer)
    state=activity(client,pid)['analysis']
    assert (state['state'],state['error_code'],state['retryable'])==('failed',code,retryable)
    job=db.get(m.AnalysisJob,jid)
    assert job.diagnostics=={'upstream_status':status,'stage':'llm_request'}
    assert len(calls)==count
    assert db.scalar(select(func.count()).select_from(m.Project))==1
    assert db.scalar(select(func.count()).select_from(GitHubRepositoryLink))==1
    assert db.scalar(select(func.count()).select_from(m.SkillEvidence))==0
    assert 'SECRET' not in caplog.text
    assert 'from fastapi' not in caplog.text


def test_grounding_repair_is_still_one_and_terminal(accounts,github,db):
    client,_=accounts();connected(client)
    pid=batch(client,repos(github)[:1])[0]['result']['project']['id']
    calls=[]
    def handle(request):
        calls.append(1)
        return httpx.Response(200,json=envelope(json.dumps(evidence_draft(excerpt='invented'))))
    analyzer=ProjectSkillAnalyzer(GeminiProvider('test-key','test-model',transport=httpx.MockTransport(handle)))
    jobs.execute(db,jobs.claim(db),source(),analyzer)
    state=activity(client,pid)['analysis']
    assert (state['error_code'],state['retryable'])==('GROUNDING_REJECTED',False)
    assert len(calls)==2
    assert db.scalar(select(func.count()).select_from(m.SkillEvidence))==0


def test_empty_source_never_calls_llm(accounts,github,db):
    client,_=accounts();connected(client)
    pid=batch(client,repos(github)[:1])[0]['result']['project']['id']
    class EmptySource:
        def fetch(self,url):
            result=source().fetch(url)
            return result.model_copy(update={'files':[],'languages':{},'readme':''})
    def prohibited(request):pytest.fail('Empty material must not reach LLM')
    analyzer=ProjectSkillAnalyzer(GeminiProvider('test-key','test-model',transport=httpx.MockTransport(prohibited)))
    jid=jobs.claim(db);jobs.execute(db,jid,EmptySource(),analyzer)
    assert activity(client,pid)['analysis']['error_code']=='INSUFFICIENT_PROJECT_DATA'
    assert db.get(m.AnalysisJob,jid).diagnostics['stage']=='source_load'


def test_transport_retry_after_and_deadline(monkeypatch):
    from datetime import timedelta
    from types import SimpleNamespace
    from app.schemas.domain import utcnow
    from app.core.errors import AppError
    from app.services.llm import retry, diagnostics
    waits=[]
    monkeypatch.setattr(retry.time,'sleep',waits.append)
    monkeypatch.setattr(retry.random,'uniform',lambda a,b:0.25)
    error=diagnostics.http_error(429)
    retry.pause(0,error,5)
    retry.pause(1,error,None)
    assert waits==[5,2.25]

    assert retry.retry_after('12')==12
    assert retry.retry_after('invalid') is None
    with pytest.raises(AppError,match='Analiz sağlayıcısı'):
        retry.pause(0,error,31)
    assert waits==[5,2.25]  # Do not retry earlier than a long Retry-After.
    with diagnostics.analysis_context(SimpleNamespace(id='test',project_id='test',deadline=utcnow()+timedelta(seconds=1))):
        with pytest.raises(AppError) as caught:retry.pause(0,error,5)
    assert caught.value.code=='ANALYSIS_TIMEOUT'
    assert waits==[5,2.25]


def test_three_workers_capacity_keeps_unclaimed_jobs_queued_and_independent(independent_db,monkeypatch):
    from datetime import timedelta
    from threading import Event, Lock
    from time import monotonic, sleep
    from sqlalchemy.orm import Session
    from app.schemas.domain import utcnow
    from app.core.config import settings
    from app.core.errors import AppError
    from app.services.llm import capacity as capacity_module
    from app.services.analysis import factory
    from app.services.github import provider as source_module
    entered, release = Event(), Event()
    lock=Lock(); active=0; maximum=0; calls=[]
    monkeypatch.setattr(capacity_module,'capacity',capacity_module.Capacity(1))
    monkeypatch.setattr(settings,'analysis_worker_threads',3)
    monkeypatch.setattr(source_module,'GitHubProvider',lambda *args:source_provider)
    source_provider=source()
    class Analyzer:
        provider='gemini';model='test-model';version='test'
        def analyze_project(self,data):
            nonlocal active,maximum
            with lock:active+=1;maximum=max(maximum,active);calls.append(data.name)
            try:
                if len(calls)==1:
                    entered.set();assert release.wait(5)
                if data.name=='B':raise AppError('LLM_CONFIGURATION_ERROR','Safe error',502)
                from app.services.analysis.rules import RuleSkillAnalyzer
                return RuleSkillAnalyzer().analyze_project(data)
            finally:
                with lock:active-=1
    monkeypatch.setattr(factory,'skill_analyzer',lambda *args:Analyzer())
    with Session(independent_db) as db:
        c=m.Candidate(name='Capacity test');db.add(c);db.flush()
        for name in ['A','B','C']:
            p=m.Project(candidate_id=c.id,name=name,description='',source_url='https://github.com/test/repo')
            db.add(p);db.flush()
            db.add(m.AnalysisJob(project_id=p.id,status='queued',deadline=utcnow()+timedelta(minutes=1)))
        db.commit()
    stop=jobs.start_workers(lambda:Session(independent_db,expire_on_commit=False))
    try:
        assert entered.wait(5)
        with Session(independent_db) as db:
            states=list(db.scalars(select(m.AnalysisJob.status)))
            assert sorted(states)==['analyzing','queued','queued']
        release.set()
        limit=monotonic()+10
        while monotonic()<limit:
            with Session(independent_db) as db:
                states=list(db.scalars(select(m.AnalysisJob.status)))
            if all(s in ('succeeded','failed') for s in states):break
            sleep(.02)
        assert sorted(states)==['failed','succeeded','succeeded']
        assert maximum==1 and sorted(calls)==['A','B','C']
        with Session(independent_db) as db:
            assert db.scalar(select(func.count()).select_from(m.Project))==3
            assert db.scalar(select(func.count()).select_from(m.AnalysisRun))==3
    finally:
        release.set();stop.set()
