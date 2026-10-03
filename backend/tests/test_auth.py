"""Real cookie clients: no auth dependency overrides in these regressions."""
from datetime import timedelta
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db.session import get_db
from app.core.config import settings
from app.models import domain as m
from app.schemas.domain import utcnow

PASSWORD = 'a long test passphrase'
@pytest.fixture
def accounts(db, monkeypatch):
    monkeypatch.setattr(settings, 'session_cookie_secure', False)
    app.dependency_overrides[get_db] = lambda: db
    clients = []
    def new(role='candidate', email=None):
        client = TestClient(app, raise_server_exceptions=False, headers={'Origin':'http://localhost:3000'})
        clients.append(client)
        response = client.post('/auth/register', json=dict(role=role,email=email or f'{uuid4()}@example.test',
            password=PASSWORD,display_name=role))
        assert response.status_code == 201, response.text
        return client, response.json()
    yield new
    for client in clients: client.close()
    app.dependency_overrides.clear()

def test_register_cookie_hash_and_me(accounts, db):
    client, state = accounts()
    user = db.get(m.User, __import__('uuid').UUID(state['user']['id']))
    assert user.password_hash.startswith('$argon2id$') and PASSWORD not in user.password_hash
    cookie = client.cookies.get(settings.session_cookie_name)
    session = db.scalar(select(m.UserSession))
    assert session.token_hash != cookie and len(session.token_hash) == 64
    assert client.get('/auth/me').json() == state
    assert state['candidate']['name'] == 'candidate'
    response=client.post('/auth/login',json={'email':user.email,'password':PASSWORD})
    header=response.headers['set-cookie']
    assert 'HttpOnly' in header and 'SameSite=lax' in header and 'Max-Age=604800' in header
    assert cookie != client.cookies.get(settings.session_cookie_name)

def test_institution_duplicate_and_invalid_credentials(accounts):
    client,state=accounts('institution','Case@Example.test')
    assert state['candidate'] is None
    duplicate=client.post('/auth/register',json={'role':'candidate','email':'case@example.test','password':PASSWORD,'display_name':'Other'})
    assert duplicate.status_code==409
    messages=[]
    for email in ['case@example.test','missing@example.test']:
        r=client.post('/auth/login',json={'email':email,'password':'wrong'})
        assert r.status_code==401
        messages.append(r.json())
    assert messages[0]==messages[1]

@pytest.mark.parametrize('invalid',['expired','revoked','disabled','malformed','logout'])
def test_session_rejection(accounts,db,invalid):
    client,state=accounts()
    row=db.scalar(select(m.UserSession))
    if invalid=='expired': row.expires_at=utcnow()-timedelta(seconds=1)
    if invalid=='revoked': row.revoked_at=utcnow()
    if invalid=='disabled': db.get(m.User,row.user_id).is_active=False
    db.commit()
    if invalid=='malformed':
        client.cookies.clear();client.cookies.set(settings.session_cookie_name,'not-a-token')
    if invalid=='logout':
        old=client.cookies.get(settings.session_cookie_name)
        assert client.post('/auth/logout').status_code==204
        assert not client.cookies.get(settings.session_cookie_name)
        client.cookies.set(settings.session_cookie_name,old)
    assert client.get('/auth/me').status_code==401
    assert client.get('/candidates/'+state['candidate']['id']).status_code==401

def test_roles_ownership_and_legacy(accounts,db):
    a,sa=accounts();b,sb=accounts();ia,sia=accounts('institution');ib,sib=accounts('institution')
    aid,bid=sa['candidate']['id'],sb['candidate']['id']
    project=b.post(f'/candidates/{bid}/projects',json={'name':'B project','source_url':'https://github.com/test/repo'}).json()
    evidence=b.post(f'/candidates/{bid}/profile-evidence',json={'category':'education','title':'Private'}).json()
    need=ib.post('/needs',json={'description':'Python required','criteria':[{'skill_key':'python','skill_label':'Python','priority':'required'}]}).json()
    for path in [f'/candidates/{bid}',f'/candidates/{bid}/living-profile',f'/candidates/{bid}/profile-evidence',f'/candidates/{bid}/projects',
                 f'/projects/{project["id"]}',f'/profile-evidence/{evidence["id"]}']:
        assert a.get(path).status_code==404,path
    assert a.patch(f'/candidates/{bid}',json={'name':'Attack'}).status_code==404
    assert a.post(f'/projects/{project["id"]}/analyze').status_code==404
    assert a.patch(f'/profile-evidence/{evidence["id"]}',json={'title':'Attack'}).status_code==404
    assert a.delete(f'/profile-evidence/{evidence["id"]}').status_code==404
    for suffix in ['', '/discovery']:
        assert ia.get('/needs/'+need['id']+suffix).status_code==404
    assert ia.patch('/needs/'+need['id'],json={'target_role':'Attack'}).status_code==404
    updated=ib.patch('/needs/'+need['id'],json={'target_role':'Backend geliştirici'})
    assert updated.status_code==200 and updated.json()['target_role']=='Backend geliştirici'
    stable=lambda rows: [{k:v for k,v in row.items() if k!='created_at'} for row in rows]
    assert stable(updated.json()['criteria'])==stable(need['criteria'])
    assert ia.post('/needs/'+need['id']+'/team-coverage',json={'candidate_ids':[aid,bid]}).status_code==404
    assert a.get('/needs/'+need['id']+'/discovery').status_code==403
    assert a.post('/needs',json={'description':'Python required'}).status_code==403
    assert ia.post(f'/candidates/{bid}/projects',json={'name':'Attack','source_url':'https://github.com/test/repo'}).status_code==403
    assert ia.post(f'/candidates/{bid}/profile-evidence',json={'category':'education','title':'Attack'}).status_code==403
    assert ia.get(f'/candidates/{bid}/living-profile').status_code==403
    # Legacy rows are retained but never claimed or exposed in discovery.
    legacy=m.Candidate(name='Legacy private');db.add(legacy);db.commit()
    assert a.get(f'/candidates/{legacy.id}').status_code==404
    assert all(c['candidate_id']!=str(legacy.id) for c in ib.get('/needs/'+need['id']+'/discovery').json()['candidates'])

def test_csrf_and_anonymous(accounts):
    client,state=accounts()
    for origin in ['https://evil.test','null','http://localhost:3000.evil.test']:
        assert client.post('/auth/logout',headers={'Origin':origin}).status_code==403
    client.headers.pop('origin')
    assert client.post('/auth/logout').status_code==403
    assert client.post('/auth/logout',headers={'Referer':'http://['}).status_code==403
    assert client.post('/auth/logout',headers={'Referer':'http://localhost:3000/profil'}).status_code==204
    assert client.get('/candidates/'+state['candidate']['id']).status_code==401
    assert client.get('/health').status_code==200

def test_password_policy_and_secure_cookie(accounts,monkeypatch):
    client,_=accounts()
    for password in ['short','x'*129]:
        assert client.post('/auth/register',json={'role':'candidate','email':'new@example.test','password':password,'display_name':'Name'}).status_code==422
    monkeypatch.setattr(settings,'session_cookie_secure',True)
    r=client.post('/auth/register',json={'role':'institution','email':'secure@example.test','password':PASSWORD,'display_name':'Org'})
    assert 'Secure' in r.headers['set-cookie']


def test_match_context_and_indirect_private_resources(accounts, db):
    from app.api.routes import get_github
    from app.services.github.provider import GitHubProvider
    from test_github import mock_transport
    app.dependency_overrides[get_github]=lambda:GitHubProvider(transport=mock_transport())
    a,sa=accounts(); b,sb=accounts(); ia,_=accounts('institution');ib,_=accounts('institution')
    cid=sa['candidate']['id']
    project=a.post(f'/candidates/{cid}/projects',json={'name':'Repo','source_url':'https://github.com/test/repo'}).json()
    analysis=a.post('/projects/'+project['id']+'/analyze').json()
    need=ia.post('/needs',json={'description':'Python gerekli'}).json()
    match=ia.post('/matches',json={'candidate_id':cid,'need_id':need['id']}).json()
    mid=match['id']
    for suffix in ['', '/gaps']:
        assert ib.get('/matches/'+mid+suffix).status_code==404
        assert a.get('/matches/'+mid+suffix).status_code==403
    assert ib.post('/matches',json={'candidate_id':cid,'need_id':need['id']}).status_code==404
    for path in ['/snapshots/'+analysis['snapshot']['id'], '/analysis-runs/'+analysis['run']['id'],
                 '/evidence/'+analysis['evidence'][0]['id'], '/projects/'+project['id']+'/evidence']:
        assert b.get(path).status_code==404
        assert ia.get(path).status_code==403
    eid=match['matched_criteria'][0]['evidence_ids'][0]
    assert ia.get(f'/matches/{mid}/evidence/{eid}').status_code==200
    assert ib.get(f'/matches/{mid}/evidence/{eid}').status_code==404
    assert ia.get(f'/matches/{mid}/evidence/{uuid4()}').status_code==404

def test_every_business_route_requires_authentication(accounts):
    from fastapi.routing import APIRoute
    client,_=accounts()
    client.cookies.clear()
    public={'/health','/auth/register','/auth/login','/auth/logout'}
    checked=[]
    for template, operations in app.openapi()['paths'].items():
        if template in public: continue
        import re
        path=re.sub(r'\{[^}]+\}',str(uuid4()),template)
        for verb in operations:
            method=verb.upper()
            response=client.request(method,path,json={} if method not in {'GET','HEAD'} else None)
            assert response.status_code==401,(method,path,response.text)
            checked.append(path)
    assert len(checked)>=25

def test_abuse_budget_shared_between_clients(accounts,monkeypatch):
    client,state=accounts()
    monkeypatch.setattr(settings,'auth_email_attempts',2)
    body={'email':'unknown@example.test','password':'wrong'}
    assert client.post('/auth/login',json=body).status_code==401
    other=TestClient(app,headers={'Origin':'http://localhost:3000'})
    assert other.post('/auth/login',json=body).status_code==401
    assert client.post('/auth/login',json=body).status_code==429
    other.close()

def test_logout_is_idempotent_and_old_session_rotation(accounts):
    client,state=accounts()
    old=client.cookies.get(settings.session_cookie_name)
    r=client.post('/auth/login',json={'email':state['user']['email'],'password':PASSWORD})
    assert r.status_code==200
    client.cookies.clear();client.cookies.set(settings.session_cookie_name,old)
    assert client.get('/auth/me').status_code==401
    assert client.post('/auth/logout').status_code==204
    assert client.post('/auth/logout').status_code==204
