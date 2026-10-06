"""Auth boundary regressions; ordinary clients and independently committed sessions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import os
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import auth as routes
from app.core.auth import digest
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models import domain as m
from app.schemas.domain import utcnow
from test_auth import accounts, PASSWORD


def body(email='audit@example.test', **changes):
    return dict(role='candidate', email=email, password=PASSWORD, display_name='Audit', **changes)


def envelope(response, status, code):
    assert response.status_code == status, response.text
    error = response.json()['error']
    assert set(error) == {'code', 'message', 'retryable', 'details'}
    assert error['code'] == code
    assert 'Traceback' not in response.text and 'IntegrityError' not in response.text


def test_candidate_creation_failure_rolls_back_user_and_session(accounts, db):
    client, _ = accounts('institution')
    before = db.scalar(select(func.count()).select_from(m.UserSession))
    def fail_candidate(mapper, connection, target):
        raise IntegrityError('injected candidate failure', {}, Exception('test only'))
    event.listen(m.Candidate, 'before_insert', fail_candidate)
    try:
        response = client.post('/auth/register', json=body())
    finally:
        event.remove(m.Candidate, 'before_insert', fail_candidate)
    envelope(response, 409, 'ACCOUNT_CONFLICT')
    assert db.scalar(select(m.User).where(m.User.normalized_email == 'audit@example.test')) is None
    assert db.scalar(select(func.count()).select_from(m.UserSession)) == before
    assert 'set-cookie' not in response.headers


def test_password_unicode_normalization_and_no_secret_echo(accounts, db, caplog):
    client, _ = accounts('institution')
    password = '  Türkçe 🔐 parola e\u0301  '
    payload = body('  Mixed@Example.test  ')
    payload['password'] = password
    response = client.post('/auth/register', json=payload)
    assert response.status_code == 201
    user = db.get(m.User, UUID(response.json()['user']['id']))
    assert user.email == 'Mixed@Example.test'
    assert user.normalized_email == 'mixed@example.test'
    assert routes.hasher.verify(user.password_hash, password)
    assert user.password_hash.startswith('$argon2id$')
    assert 'password' not in response.text and 'token' not in response.text
    assert client.post('/auth/login', json={'email':' MIXED@example.test ', 'password':password}).status_code == 200
    assert client.post('/auth/login', json={'email':user.email, 'password':password.strip()}).status_code == 401
    for invalid in ['x'*11, 'x'*129]:
        payload['password'] = invalid
        response = client.post('/auth/register', json=payload)
        envelope(response, 422, 'VALIDATION_ERROR')
        assert invalid not in response.text
    assert password not in caplog.text and user.password_hash not in caplog.text


@pytest.mark.parametrize('header', ['Origin', 'Referer'])
@pytest.mark.parametrize('origin', [
    'http://localhost:3001', 'http://evil-localhost:3000',
    'http://localhost.evil.com:3000', 'https://evil-example.com',
    'https://localhost:3000', 'ftp://localhost:3000',
    'http://localhost:65536', 'http://localhost:3000@evil.test', 'null',
])
def test_csrf_exact_origin_bypasses_rejected(accounts, header, origin):
    client, _ = accounts()
    client.headers.pop('origin')
    response = client.post('/auth/logout', headers={header:origin + ('/profil' if header == 'Referer' else '')})
    envelope(response, 403, 'CSRF_ORIGIN_REJECTED')
    assert client.get('/auth/me').status_code == 200


def test_origin_takes_precedence_and_mutation_does_not_happen(accounts):
    client, state = accounts()
    cid = state['candidate']['id']
    response = client.patch(f'/candidates/{cid}', json={'name':'CSRF mutation'},
        headers={'Origin':'http://localhost:3001', 'Referer':'http://localhost:3000/profil'})
    envelope(response, 403, 'CSRF_ORIGIN_REJECTED')
    assert client.get(f'/candidates/{cid}').json()['name'] == 'candidate'


def test_session_ttl_and_logout_cookie_scope(accounts, db, monkeypatch):
    monkeypatch.setattr(settings, 'session_ttl', 600)
    client, state = accounts()
    token = client.cookies.get(settings.session_cookie_name)
    row = db.scalar(select(m.UserSession).where(m.UserSession.token_hash == digest(token)))
    expires = row.expires_at.replace(tzinfo=utcnow().tzinfo) if row.expires_at.tzinfo is None else row.expires_at
    assert 590 < (expires - utcnow()).total_seconds() <= 600
    login = client.post('/auth/login', json={'email':state['user']['email'], 'password':PASSWORD})
    header = login.headers['set-cookie']
    assert 'Max-Age=600' in header and 'Path=/' in header and 'Domain=' not in header
    assert 'HttpOnly' in header and 'SameSite=lax' in header and 'Secure' not in header
    logout = client.post('/auth/logout')
    assert 'Max-Age=0' in logout.headers['set-cookie'] and 'Path=/' in logout.headers['set-cookie']
    assert 'Domain=' not in logout.headers['set-cookie']
    assert client.get('/auth/me').headers['cache-control'] == 'no-store'


def test_unknown_email_runs_dummy_verification(accounts, monkeypatch):
    client, _ = accounts()
    calls = []
    real = routes.hasher
    class Verifier:
        def verify(self, encoded, password):
            calls.append(encoded)
            return real.verify(encoded, password)
    monkeypatch.setattr(routes, 'hasher', Verifier())
    envelope(client.post('/auth/login', json={'email':'absent@example.test','password':'wrong'}), 401, 'INVALID_CREDENTIALS')
    assert calls == [routes.dummy_hash]


def test_throttle_cleanup_and_ip_budget_bounds_email_rows(accounts, db, monkeypatch):
    client, _ = accounts()
    monkeypatch.setattr(settings, 'auth_ip_attempts', 2)
    db.add(m.AuthThrottle(key='expired', attempts=1, expires_at=utcnow()-timedelta(seconds=1)))
    db.commit()
    assert client.post('/auth/login', json={'email':'new@example.test','password':'wrong'}).status_code == 401
    count = db.scalar(select(func.count()).select_from(m.AuthThrottle))
    for i in range(5):
        envelope(client.post('/auth/login', json={'email':f'blocked{i}@example.test','password':'wrong'}), 429, 'AUTH_RATE_LIMITED')
    assert db.scalar(select(func.count()).select_from(m.AuthThrottle)) == count
    assert db.get(m.AuthThrottle, 'expired') is None


@pytest.fixture
def independent_db(tmp_path, monkeypatch):
    """Separate connections, real commits; optional dedicated migrated PostgreSQL DB."""
    url = os.environ.get('TEST_AUTH_CONCURRENCY_URL') or 'sqlite:///' + (tmp_path/'concurrent.db').as_posix()
    engine = create_engine(url)
    if engine.dialect.name == 'sqlite':
        @event.listens_for(engine, 'connect')
        def fk(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
        m.Base.metadata.create_all(engine)
    else:
        with engine.connect() as connection:
            assert connection.scalar(text('SELECT version_num FROM alembic_version')) == 'a13_operation_budgets'
    def sessions():
        with Session(engine, expire_on_commit=False) as db:
            yield db
    monkeypatch.setattr(settings, 'session_cookie_secure', False)
    app.dependency_overrides[get_db] = sessions
    yield engine
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.mark.parametrize('role', ['candidate', 'institution'])
def test_concurrent_duplicate_registration_unique_race(independent_db, monkeypatch, role):
    # Synchronize AFTER the advisory SELECT, BEFORE INSERT: both see no user.
    barrier = Barrier(2)
    real = routes.hasher
    class RacingHasher:
        def hash(self, password):
            barrier.wait(timeout=10)
            return real.hash(password)
    monkeypatch.setattr(routes, 'hasher', RacingHasher())
    email = f'{uuid4()}@example.test'
    def attempt(_):
        with TestClient(app, raise_server_exceptions=False, headers={'Origin':'http://localhost:3000'}) as client:
            payload = body(email)
            payload['role'] = role
            return client.post('/auth/register', json=payload)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))
    assert sorted(r.status_code for r in results) == [201,409]
    envelope(next(r for r in results if r.status_code == 409),409,'ACCOUNT_CONFLICT')
    with Session(independent_db) as db:
        user = db.scalar(select(m.User).where(m.User.normalized_email == email))
        assert user is not None
        assert db.scalar(select(func.count()).select_from(m.Candidate).where(m.Candidate.owner_user_id == user.id)) == (1 if role == 'candidate' else 0)
        assert db.scalar(select(func.count()).select_from(m.UserSession).where(m.UserSession.user_id == user.id)) == 1


@pytest.mark.parametrize('endpoint', ['/auth/login', '/auth/register'])
def test_concurrent_attempt_budget_persists_across_connections(independent_db, monkeypatch, endpoint):
    monkeypatch.setattr(settings, 'auth_email_attempts', 2)
    monkeypatch.setattr(settings, 'auth_ip_attempts', 1000)
    email = f'{uuid4()}@example.test'
    barrier = Barrier(5)
    def attempt(_):
        with TestClient(app, raise_server_exceptions=False, headers={'Origin':'http://localhost:3000'}) as client:
            barrier.wait(timeout=10)
            payload = body(email) if endpoint.endswith('register') else {'email':email,'password':PASSWORD}
            return client.post(endpoint,json=payload)
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(attempt, range(5)))
    assert sum(r.status_code == 429 for r in results) == 3
    assert all(r.status_code in {201,401,409,429} for r in results)
    with TestClient(app,headers={'Origin':'http://localhost:3000'}) as restarted:
        envelope(restarted.post('/auth/login',json={'email':email,'password':PASSWORD}),429,'AUTH_RATE_LIMITED')


def test_legacy_and_disabled_candidates_cannot_be_claimed_or_discovered(accounts, db):
    candidate, state = accounts()
    institution, _ = accounts('institution')
    disabled, disabled_state = accounts()
    db.get(m.User, UUID(disabled_state['user']['id'])).is_active = False
    legacy = m.Candidate(name='Legacy retained')
    legacy_need = m.OrganizationNeed(description='Legacy need', analysis_version='legacy')
    db.add_all([legacy, legacy_need]); db.commit()
    cid = str(legacy.id)
    for path in [f'/candidates/{cid}', f'/candidates/{cid}/projects',
                 f'/candidates/{cid}/profile-evidence', f'/candidates/{cid}/living-profile']:
        envelope(candidate.get(path), 404, 'NOT_FOUND')
    envelope(candidate.patch(f'/candidates/{cid}',json={'name':'Claim'}),404,'NOT_FOUND')
    envelope(candidate.post(f'/candidates/{cid}/projects',json={'name':'Claim','source_url':'https://github.com/test/repo'}),404,'NOT_FOUND')
    envelope(candidate.post(f'/candidates/{cid}/profile-evidence',json={'category':'education','title':'Claim'}),404,'NOT_FOUND')
    envelope(institution.get(f'/needs/{legacy_need.id}'),404,'NOT_FOUND')
    envelope(institution.patch(f'/needs/{legacy_need.id}',json={'target_role':'Claim'}),404,'NOT_FOUND')
    envelope(candidate.patch(f'/candidates/{state["candidate"]["id"]}',json={'name':'Claim','owner_user_id':str(uuid4())}),422,'VALIDATION_ERROR')
    need = institution.post('/needs', json={'description':'Python gerekli'}).json()
    for anonymous in ['true','false']:
        result = institution.get(f'/needs/{need["id"]}/discovery?anonymous={anonymous}')
        assert result.status_code == 200
        ids = {row['candidate_id'] for row in result.json()['candidates']}
        assert cid not in ids and disabled_state['candidate']['id'] not in ids
        if anonymous == 'true':
            assert 'Legacy retained' not in result.text
            assert all(row.get('name') is None for row in result.json()['candidates'])
    for target in [cid, disabled_state['candidate']['id']]:
        envelope(institution.post('/matches',json={'need_id':need['id'],'candidate_id':target}),404,'NOT_FOUND')
        envelope(institution.post(f'/needs/{need["id"]}/team-coverage',json={'candidate_ids':[state['candidate']['id'],target]}),404,'NOT_FOUND')
    db.refresh(legacy)
    assert legacy.owner_user_id is None and legacy.name == 'Legacy retained'


@pytest.mark.parametrize('constraint', ['email', 'token', 'candidate_owner', 'session_fk', 'need_fk', 'delete_user'])
def test_database_constraints_enforce_auth_invariants(accounts, db, constraint):
    client, state = accounts()
    uid = UUID(state['user']['id'])
    user = db.get(m.User, uid)
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            if constraint == 'email':
                db.add(m.User(email=user.email, normalized_email=user.normalized_email,
                    password_hash='test-only', role='candidate', display_name='Duplicate'))
            elif constraint == 'token':
                token_hash = db.scalar(select(m.UserSession.token_hash).where(m.UserSession.user_id == uid))
                db.add(m.UserSession(user_id=uid,token_hash=token_hash,expires_at=utcnow()+timedelta(days=1)))
            elif constraint == 'candidate_owner':
                db.add(m.Candidate(owner_user_id=uid,name='Duplicate'))
            elif constraint == 'session_fk':
                db.add(m.UserSession(user_id=uuid4(),token_hash=digest('missing-user'),expires_at=utcnow()+timedelta(days=1)))
            elif constraint == 'need_fk':
                db.add(m.OrganizationNeed(owner_user_id=uuid4(),description='Invalid FK',analysis_version='test'))
            else:
                db.delete(user)
            db.flush()
    assert client.get('/auth/me').status_code == 200


def test_failed_need_analysis_keeps_institution_ownership(accounts, db):
    from app.api.routes import get_need_analyzer
    from app.core.errors import AppError
    class FailingAnalyzer:
        version = 'audit-failure'
        def analyze_need(self, data):
            raise AppError('ANALYSIS_FAILED', 'Analiz tamamlanamadı.', 502)
    owner, _ = accounts('institution')
    other, _ = accounts('institution')
    app.dependency_overrides[get_need_analyzer] = lambda: FailingAnalyzer()
    response = owner.post('/needs', json={'description':'Python gerekli'})
    envelope(response, 502, 'ANALYSIS_FAILED')
    details = response.json()['error']['details']
    for path in [f'/needs/{details["need_id"]}', f'/analysis-runs/{details["analysis_run_id"]}']:
        assert owner.get(path).status_code == 200
        envelope(other.get(path), 404, 'NOT_FOUND')
