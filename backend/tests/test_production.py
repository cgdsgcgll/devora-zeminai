"""Production boundaries: real DB counters and ordinary authenticated clients."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta, datetime, timezone
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4
import os

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, select, func, text
from sqlalchemy.orm import Session
from alembic import command
from alembic.config import Config
from pathlib import Path

from app.core.config import Settings, settings
from app.core.errors import AppError
from app.core import rate_limits
from app.core.rate_limits import consume
from app.core.readiness import check_database
from app.db.session import get_db, engine_options
from app.main import app
from app.models import domain as m
from app.schemas.domain import utcnow
from test_auth import accounts


def production(**changes):
    values = dict(environment='production', database_url='postgresql+psycopg://app:synthetic-test-pass@db/app',
        cors_origins=['https://app.example.com'], trusted_hosts=['api.example.com'],
        rate_limit_key='synthetic-key-for-tests-only-32-characters', llm_provider='rule_based')
    values.update(changes)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize('invalid', [
    {'database_url':'sqlite://'}, {'database_url':'postgresql+psycopg://postgres:postgres@localhost/app'},
    {'database_url':'not-a-url'}, {'session_cookie_secure':False}, {'rate_limit_key':''},
    {'cors_origins':[]}, {'cors_origins':['*']}, {'cors_origins':['http://app.example.com']},
    {'cors_origins':['https://localhost']}, {'cors_origins':['https://127.0.0.1']},
    {'trusted_hosts':['*']}, {'trusted_hosts':['localhost']},
    {'llm_provider':'gemini','gemini_api_key':'','gemini_model':'gemini-model'},
    {'llm_provider':'openai','llm_api_key':'','llm_model':'model'}, {'llm_provider':'unknown'},
])
def test_production_fail_fast(invalid):
    with pytest.raises(ValidationError): production(**invalid)


def test_valid_production_and_conservative_pool():
    config = production()
    assert config.session_cookie_secure
    assert engine_options(config)['pool_size'] == 5
    assert engine_options(config)['max_overflow'] == 2
    assert engine_options(config)['connect_args']['connect_timeout'] == 5
    dev = Settings(_env_file=None, database_url='sqlite://', session_cookie_secure=False)
    assert engine_options(dev) == {'pool_pre_ping':True}
    assert not dev.session_cookie_secure


def test_ai_budget_429_before_workflow_and_different_user(accounts, db, monkeypatch):
    monkeypatch.setattr(settings,'ai_user_attempts',1)
    a, _ = accounts('institution'); b, _ = accounts('institution')
    first = a.post('/needs',json={'description':'Python gerekli'})
    assert first.status_code == 201
    count = db.scalar(select(func.count()).select_from(m.OrganizationNeed))
    blocked = a.post('/needs',json={'description':'Python gerekli'})
    assert blocked.status_code == 429
    assert blocked.json()['error']['code'] == 'ANALYSIS_RATE_LIMITED'
    assert blocked.json()['error']['retryable'] is True
    assert 1 <= int(blocked.headers['Retry-After']) <= settings.ai_window_seconds
    assert set(blocked.json()['error']['details']) == {'retry_after_seconds'}
    assert db.scalar(select(func.count()).select_from(m.OrganizationNeed)) == count
    assert a.get('/auth/me').status_code == 200
    assert b.post('/needs',json={'description':'Python gerekli'}).status_code == 201


def test_project_limit_prevents_github_call_and_counts_failures(accounts, monkeypatch):
    from app.api.routes import get_github
    class FailedGitHub:
        calls=0
        def fetch(self, url):
            self.calls+=1
            raise AppError('SOURCE_UNREACHABLE','Kaynağa erişilemiyor.',502,True)
    provider = FailedGitHub()
    monkeypatch.setattr(settings,'ai_user_attempts',1)
    app.dependency_overrides[get_github] = lambda:provider
    client, state = accounts()
    project = client.post(f'/candidates/{state["candidate"]["id"]}/projects',
        json={'name':'Test','source_url':'https://github.com/test/repo'}).json()
    assert client.post(f'/projects/{project["id"]}/analyze').status_code == 502
    assert client.post(f'/projects/{project["id"]}/analyze').status_code == 429
    assert provider.calls == 1
    assert client.get('/health/live').status_code == 200


def test_shared_compute_budget_covers_discovery_team_match_and_explicit_need(accounts, monkeypatch):
    institution,_=accounts('institution'); a,sa=accounts(); b,sb=accounts()
    need=institution.post('/needs',json={'description':'Python gerekli'}).json()
    monkeypatch.setattr(settings,'compute_user_attempts',1)
    assert institution.get('/needs/'+need['id']+'/discovery').status_code == 200
    assert institution.post('/needs/'+need['id']+'/team-coverage',json={'candidate_ids':[sa['candidate']['id'],sb['candidate']['id']]}).status_code==429
    assert institution.post('/matches',json={'need_id':need['id'],'candidate_id':sa['candidate']['id']}).status_code==429
    assert institution.post('/needs',json={'description':'Explicit','criteria':[{'skill_key':'python','skill_label':'Python','priority':'required'}]}).status_code==429


def test_rate_db_failure_is_fail_closed(accounts, monkeypatch):
    from sqlalchemy.exc import OperationalError
    client,_=accounts('institution')
    def fail(*args,**kwargs): raise OperationalError('safe-test',{},Exception('sensitive-do-not-log'))
    monkeypatch.setattr(rate_limits,'pg_insert',fail)
    monkeypatch.setattr(rate_limits,'sqlite_insert',fail)
    response=client.post('/needs',json={'description':'Python gerekli'})
    assert response.status_code==503
    assert response.json()['error']['code']=='RATE_LIMIT_UNAVAILABLE'
    assert 'sensitive' not in response.text


def test_ip_budget_and_cleanup_do_not_allocate_after_denial(db, monkeypatch):
    monkeypatch.setattr(settings,'ai_ip_attempts',1)
    now=datetime(2026,10,6,12,0,0,tzinfo=timezone.utc)
    monkeypatch.setattr(rate_limits,'utcnow',lambda:now)
    req=SimpleNamespace(client=SimpleNamespace(host='synthetic-peer'))
    consume(req,db,SimpleNamespace(id=uuid4()),'ai')
    for _ in range(5):
        with pytest.raises(AppError) as caught: consume(req,db,SimpleNamespace(id=uuid4()),'ai')
        assert caught.value.status==429
        assert caught.value.headers['Retry-After'] == str(settings.ai_window_seconds)
    assert db.scalar(select(func.count()).select_from(m.RateBucket))==2
    assert max(db.scalars(select(m.RateBucket.attempts)))==2
    later=now+timedelta(seconds=settings.ai_window_seconds*3)
    monkeypatch.setattr(rate_limits,'utcnow',lambda:later)
    consume(req,db,SimpleNamespace(id=uuid4()),'ai')
    assert db.scalar(select(func.count()).select_from(m.RateBucket))==2


def test_concurrent_budget_across_connections_and_restart(tmp_path, monkeypatch):
    url=os.environ.get('TEST_RATE_DATABASE_URL') or 'sqlite:///'+(tmp_path/'rate.db').as_posix()
    engine=create_engine(url)
    if engine.dialect.name=='sqlite': m.Base.metadata.create_all(engine)
    else:
        with engine.connect() as c: check_database(c)
    monkeypatch.setattr(settings,'ai_user_attempts',3)
    identity=SimpleNamespace(id=uuid4())
    req=SimpleNamespace(client=SimpleNamespace(host=str(uuid4())))
    barrier=Barrier(8)
    def attempt(_):
        with Session(engine) as db:
            barrier.wait(timeout=10)
            try: consume(req,db,identity,'ai'); return 200
            except AppError as e: return e.status
    with ThreadPoolExecutor(max_workers=8) as pool: result=list(pool.map(attempt,range(8)))
    assert result.count(200)==3 and result.count(429)==5
    engine.dispose()
    restarted=create_engine(url)
    try:
        with Session(restarted) as db:
            with pytest.raises(AppError) as caught: consume(req,db,identity,'ai')
            assert caught.value.status==429
    finally: restarted.dispose()


def test_readiness_requires_migration_and_liveness_never_connects(tmp_path, monkeypatch):
    url='sqlite:///'+(tmp_path/'ready.db').as_posix()
    engine=create_engine(url)
    def sessions():
        with Session(engine) as db: yield db
    app.dependency_overrides[get_db]=sessions
    try:
        with TestClient(app) as client:
            assert client.get('/health/live').status_code==200
            assert client.get('/health').status_code==200
            assert client.get('/health/ready').status_code==503
            monkeypatch.setattr(settings,'database_url',url)
            config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
            command.upgrade(config,'head')
            assert client.get('/health/ready').status_code==200
            def disconnected():
                from sqlalchemy.exc import OperationalError
                raise OperationalError('sensitive-query', {}, Exception('sensitive-password'))
                yield
            app.dependency_overrides[get_db]=disconnected
            assert client.get('/health/live').status_code==200
            unavailable = client.get('/health/ready')
            assert unavailable.status_code == 503
            assert 'sensitive' not in unavailable.text
    finally:
        app.dependency_overrides.clear();engine.dispose()


def test_request_metadata_headers_hosts_and_secret_redaction(accounts, monkeypatch):
    from app.core import observability
    events=[]
    monkeypatch.setattr(observability.logger,'info',lambda message:events.append(message))
    client,_=accounts()
    response=client.get('/health/live?password=never-log-this',headers={'X-Request-ID':'injected-secret','Authorization':'never-log-this'})
    assert len(response.headers['x-request-id'])==32
    assert response.headers['x-request-id']!='injected-secret'
    assert response.headers['x-content-type-options']=='nosniff'
    assert 'strict-transport-security' not in response.headers
    assert 'never-log-this' not in ''.join(events)
    assert 'injected-secret' not in ''.join(events)
    assert response.headers['x-request-id'] in ''.join(events)
    assert client.get('/health/live',headers={'Host':'evil.example'}).json()['error']['code']=='INVALID_HOST'
    monkeypatch.setattr(settings,'environment','production')
    assert client.get('/health/live').headers['strict-transport-security']=='max-age=31536000'


def test_rate_migration_preserves_auth_data_and_blocks_active_downgrade(tmp_path, monkeypatch):
    url=os.environ.get('TEST_RATE_MIGRATION_URL') or 'sqlite:///'+(tmp_path/'migration.db').as_posix()
    monkeypatch.setattr(settings,'database_url',url)
    config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    command.upgrade(config,'a12_auth_ownership')
    engine=create_engine(url)
    with Session(engine) as db:
        user=m.User(email='migration@example.test',normalized_email='migration@example.test',password_hash='test-only',role='candidate',display_name='Preserved')
        db.add(user);db.flush();db.add(m.Candidate(name='Preserved',owner_user_id=user.id));db.commit()
    command.upgrade(config,'head');command.check(config)
    with Session(engine) as db:
        assert db.scalar(select(m.User.display_name))=='Preserved'
        assert db.scalar(select(m.Candidate.owner_user_id)) is not None
        db.add(m.RateBucket(key='test',attempts=1,expires_at=utcnow()+timedelta(hours=1)));db.commit()
    with pytest.raises(RuntimeError,match='Active rate budgets'): command.downgrade(config,'a12_auth_ownership')
    with Session(engine) as db:
        db.get(m.RateBucket,'test').expires_at=utcnow()-timedelta(seconds=1);db.commit()
    command.downgrade(config,'a12_auth_ownership')
    command.upgrade(config,'head');command.check(config)
    with Session(engine) as db: assert db.scalar(select(m.User.display_name))=='Preserved'
    engine.dispose()


def test_unexpected_exception_logs_only_safe_metadata(monkeypatch):
    from fastapi import FastAPI
    from app.core.observability import RequestTelemetry, logger
    events = []
    monkeypatch.setattr(logger, 'error', lambda message: events.append(message))
    isolated = FastAPI()
    isolated.add_middleware(RequestTelemetry, config=settings)
    @isolated.get('/failure')
    def failure():
        raise RuntimeError('synthetic-sensitive-password-and-sql')
    with TestClient(isolated, raise_server_exceptions=False) as client:
        response = client.get('/failure')
    assert response.status_code == 500
    assert response.headers['x-request-id'] in ''.join(events)
    assert 'RuntimeError' in ''.join(events)
    assert 'synthetic-sensitive' not in response.text + ''.join(events)
    assert 'INTERNAL_ERROR' == response.json()['error']['code']


def test_production_app_disables_public_docs_without_connecting():
    import subprocess, sys
    env = dict(os.environ, ENVIRONMENT='production',
        DATABASE_URL='postgresql+psycopg://app:synthetic-test-pass@db/app',
        SESSION_COOKIE_SECURE='true', CORS_ORIGINS='["https://app.example.com"]',
        TRUSTED_HOSTS='["api.example.com"]', RATE_LIMIT_KEY='synthetic-key-for-tests-only-32-characters',
        LLM_PROVIDER='rule_based')
    env.pop('API_DOCS_ENABLED', None)
    result = subprocess.run([sys.executable, '-c',
        'from app.main import app; assert app.docs_url is None; assert app.redoc_url is None; assert app.openapi_url is None; assert app.openapi()["paths"]; print("PRODUCTION_DOCS_CLOSED")'],
        cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True)
    assert result.returncode == 0
    assert 'PRODUCTION_DOCS_CLOSED' in result.stdout
