"""Synthetic GitHub HTTP and real ZeminAI cookies; never needs provider credentials."""
import base64
import hashlib
from datetime import timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from uuid import UUID
import httpx
import pytest
from sqlalchemy import select
from app.main import app
from app.core.config import settings
from app.models import domain as m
from app.models.github_account import GitHubConnection, GitHubOAuthState, GitHubRepositoryLink
from app.schemas.domain import utcnow
from app.services.github.account_provider import GitHubAccountProvider, get_account_provider
from app.services.github import account_service as service
from test_auth import accounts

ACCESS = 'ghu_synthetic_test_value_not_a_real_token'
REFRESH = 'ghr_synthetic_test_value_not_a_real_token'


@pytest.mark.parametrize('offset',[None,2,-5])
def test_expiry_conversion_preserves_instant(offset):
    instant=utcnow()
    stored=(instant.replace(tzinfo=None) if offset is None else
            instant.astimezone(timezone(timedelta(hours=offset))))
    assert service.as_utc(stored)==instant


def configure_test_github(monkeypatch):
    """Override the complete config used by configured(), never local App credentials."""
    monkeypatch.setattr(settings,'environment','test')
    monkeypatch.setattr(settings,'trusted_hosts',['localhost','127.0.0.1','testserver'])
    monkeypatch.setattr(settings,'cors_origins',['http://localhost:3000','http://127.0.0.1:3000'])
    monkeypatch.setattr(settings,'github_app_slug','zeminai-test')
    monkeypatch.setattr(settings,'github_app_client_id','test-client')
    monkeypatch.setattr(settings,'github_app_client_secret','synthetic-client-secret')
    monkeypatch.setattr(settings,'github_app_callback_url','http://localhost:8000/github/callback')
    monkeypatch.setattr(settings,'github_app_encryption_key',base64.urlsafe_b64encode(b'0'*32).decode())
    # Missing cryptography must fail at setup, not masquerade as an OAuth 503.
    from cryptography.fernet import Fernet
    assert isinstance(service.configured(), Fernet)


@pytest.fixture
def github(monkeypatch):
    configure_test_github(monkeypatch)
    mock = {'user':{'id':123,'login':'candidate','type':'User'},'calls':[], 'status':{}, 'headers':{}, 'tokens':{
        'access_token':ACCESS,'refresh_token':REFRESH,'expires_in':28800,
        'refresh_token_expires_in':15897600,'token_type':'bearer'},
        'installations':[{'id':42,'account':{'id':123,'login':'candidate','type':'User'}}],
        'repositories':[{'id':9007199254740993,'full_name':'candidate/demo','html_url':'https://github.com/candidate/demo',
            'owner':{'id':123,'login':'candidate','type':'User'},'permissions':{'pull':True,'push':True}}]}
    def respond(request):
        mock['calls'].append(request)
        status = mock['status'].get(request.url.path,200)
        if status != 200: return httpx.Response(status,headers=mock['headers'].get(request.url.path,{}),json={'message':ACCESS+REFRESH})
        if request.url.path=='/login/oauth/access_token': value=mock['tokens']
        elif request.url.path=='/user': value=mock['user']
        elif request.url.path=='/user/installations':
            value={'total_count':len(mock['installations']),'installations':mock['installations']}
        elif request.url.path in ('/user/installations/42/repositories','/user/installations/43/repositories'):
            value={'total_count':len(mock['repositories']),'repositories':mock['repositories']}
        else: return httpx.Response(404)
        return httpx.Response(200,json=value)
    provider = GitHubAccountProvider(httpx.MockTransport(respond))
    app.dependency_overrides[get_account_provider] = lambda: provider
    mock['provider'] = provider
    yield mock
    app.dependency_overrides.pop(get_account_provider,None)


def test_test_configuration_is_independent_of_local_config(monkeypatch):
    monkeypatch.setattr(settings,'environment','production')
    monkeypatch.setattr(settings,'trusted_hosts',['deployment.example'])
    monkeypatch.setattr(settings,'cors_origins',['https://deployment.example'])
    for key in ('github_app_client_id','github_app_client_secret','github_app_callback_url','github_app_encryption_key'):
        monkeypatch.setattr(settings,key,'inherited-invalid-test-value')
    with pytest.raises(Exception) as denied:
        service.configured()
    assert denied.value.code=='GITHUB_APP_NOT_CONFIGURED'
    configure_test_github(monkeypatch)
    assert settings.environment=='test'
    assert service.configured().decrypt(service.cipher().encrypt(b'synthetic'))==b'synthetic'


def test_production_http_callback_still_fails_closed(github,monkeypatch):
    monkeypatch.setattr(settings,'environment','production')
    with pytest.raises(Exception) as denied:
        service.configured()
    assert denied.value.code=='GITHUB_APP_NOT_CONFIGURED'


def begin(client):
    response=client.post('/github/connect',json={})
    assert response.status_code==200,response.text
    return parse_qs(urlsplit(response.json()['authorization_url']).query)


def finish(client,params):
    return client.get('/github/callback',params={'state':params['state'][0],'code':'synthetic-code'},follow_redirects=False)


def connected(client):
    response=finish(client,begin(client))
    assert response.status_code==303,response.text
    assert response.headers['location']=='http://localhost:3000/aday'
    assert response.headers['referrer-policy']=='no-referrer'
    return client.get('/github/connection').json()['connection']


def project(client,state,url='https://github.com/candidate/demo'):
    response=client.post('/candidates/'+state['candidate']['id']+'/projects',
        json={'name':'Demo','description':'','source_type':'github','source_url':url})
    assert response.status_code==201,response.text
    return response.json()['id']


def link(client,pid,rid='9007199254740993'):
    return client.post('/projects/'+pid+'/github-relationship',json={'installation_id':'42','repository_id':rid})


def test_pkce_session_state_encryption_and_single_use(accounts,github,db):
    client,state=accounts()
    params=begin(client)
    row=db.scalar(select(GitHubOAuthState))
    assert len(params['state'][0])==43 and row.state_hash!=params['state'][0]
    verifier=service.decrypt(row.verifier_ciphertext)
    assert params['code_challenge_method']==['S256']
    assert params['code_challenge']==[base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()]
    assert 0 < (service.as_utc(row.expires_at)-utcnow()).total_seconds() <= 300
    assert finish(client,params).status_code==303
    db.refresh(row)
    assert row.used_at and row.verifier_ciphertext is None
    assert finish(client,params).json()['error']['code']=='GITHUB_OAUTH_STATE_INVALID'
    connection=db.scalar(select(GitHubConnection))
    assert connection.github_user_id=='123' and connection.github_login=='candidate'
    assert ACCESS not in connection.access_ciphertext
    assert service.decrypt(connection.access_ciphertext)==ACCESS
    assert service.decrypt(connection.refresh_ciphertext)==REFRESH
    body=client.get('/github/connection').text
    assert all(secret not in body for secret in (ACCESS,REFRESH,verifier,'ciphertext'))
    exchange=next(r for r in github['calls'] if r.method=='POST')
    assert parse_qs(exchange.content.decode())['code_verifier']==[verifier]
    assert not exchange.url.query
    assert exchange.headers['Accept']=='application/json'


def test_disconnect_during_callback_cannot_reconnect(accounts,github):
    client,_=accounts();params=begin(client)
    original=github['provider'].user
    def disconnect_before_return(token):
        assert client.delete('/github/connection').status_code==204
        return original(token)
    github['provider'].user=disconnect_before_return
    assert finish(client,params).json()['error']['code']=='GITHUB_OAUTH_STATE_INVALID'
    assert client.get('/github/connection').json()=={'connection':None}


def test_complete_bounded_pagination():
    calls=[]
    def reply(request):
        calls.append(request)
        page=int(request.url.params['page'])
        batch=[{'id':i} for i in (range(1,101) if page==1 else [101])]
        return httpx.Response(200,json={'total_count':101,'repositories':batch})
    provider=GitHubAccountProvider(httpx.MockTransport(reply))
    assert len(provider.collection('/test','repositories',500,ACCESS))==101
    assert len(calls)==2


def test_relationship_read_has_constant_queries(accounts,github,db):
    from sqlalchemy import event
    client,state=accounts();pid=project(client,state);connected(client)
    assert link(client,pid).status_code==200
    counts=[]
    def count_query(conn,cursor,statement,parameters,context,executemany):
        if statement.lstrip().upper().startswith('SELECT'):counts.append(statement)
    def read_count():
        db.expunge_all();counts.clear()
        event.listen(db.bind,'before_cursor_execute',count_query)
        try:
            assert client.get('/projects/'+pid+'/github-relationship').status_code==200
            return len(counts)
        finally:event.remove(db.bind,'before_cursor_execute',count_query)
    one=read_count()
    for i in range(11):
        db.add(m.Project(candidate_id=UUID(state['candidate']['id']),name=f'Other {i}',
            description='',source_url=f'https://github.com/candidate/repo{i}'))
    db.commit()
    assert read_count()==one and one<=6


def test_callback_logs_never_contain_code_or_token(accounts,github,monkeypatch):
    from app.core import observability
    records=[]
    monkeypatch.setattr(observability.logger,'info',records.append)
    client,_=accounts();params=begin(client)
    assert finish(client,params).status_code==303
    assert all(secret not in ''.join(records) for secret in
        ('synthetic-code',ACCESS,REFRESH,params['state'][0],settings.github_app_client_secret))


@pytest.mark.parametrize('invalid',[{'id':True,'login':'ok','type':'User'},
    {'id':123,'login':'hostile/name','type':'User'},{'id':123,'login':'ok','type':'Organization'}])
def test_untrusted_github_identity_rejected(accounts,github,invalid):
    client,_=accounts();github['user']=invalid
    assert finish(client,begin(client)).json()['error']['code']=='GITHUB_PROVIDER_ERROR'
    assert client.get('/github/connection').json()=={'connection':None}


def test_refresh_persists_even_if_metadata_temporarily_fails(accounts,github,db):
    client,_=accounts();connected(client)
    row=db.scalar(select(GitHubConnection));row.access_expires_at=utcnow()-timedelta(seconds=1);db.commit()
    github['tokens']['access_token']='ghu_synthetic_rotated_test_value'
    github['status']['/user/installations']=500
    assert client.get('/github/installations').status_code==502
    db.refresh(row)
    assert service.decrypt(row.access_ciphertext)=='ghu_synthetic_rotated_test_value' and row.revoked_at is None


@pytest.mark.parametrize('kind',['missing','unknown','expired','other-user','other-session','duplicate'])
def test_invalid_state(accounts,github,db,kind):
    client,state=accounts(); params=begin(client)
    if kind=='missing': params={'state':['']}
    if kind=='unknown': params={'state':['x'*43]}
    if kind=='expired':
        row=db.scalar(select(GitHubOAuthState));row.expires_at=utcnow()-timedelta(seconds=1);db.commit()
        db.expire_all()
    if kind=='other-user': client,_=accounts()
    if kind=='other-session':
        client.post('/auth/login',json={'email':state['user']['email'],'password':'a long test passphrase'})
    if kind=='duplicate':
        response=client.get('/github/callback?state='+params['state'][0]+'&state=bad&code=test')
    else: response=finish(client,params)
    assert response.status_code==400,response.text
    if kind=='expired': assert response.json()['error']['code']=='GITHUB_OAUTH_STATE_EXPIRED'
    assert not github['calls']


def test_roles_csrf_missing_config_and_legacy(accounts,github,monkeypatch):
    institution,_=accounts('institution')
    assert institution.post('/github/connect',json={}).status_code==403
    assert institution.delete('/github/connection').status_code==403
    client,state=accounts()
    assert client.post('/github/connect',json={},headers={'Origin':'http://evil-localhost:3000'}).status_code==403
    monkeypatch.setattr(settings,'github_app_client_secret','')
    assert client.post('/github/connect',json={}).json()['error']['code']=='GITHUB_APP_NOT_CONFIGURED'
    pid=project(client,state)
    assert client.get('/projects/'+pid+'/github-relationship').json()=={'link':None}
    client.cookies.clear()
    assert client.get('/github/connection').status_code==401


@pytest.mark.parametrize('path',['/login/oauth/access_token','/user'])
def test_provider_failure_is_safe_and_consumes_state(accounts,github,path):
    client,_=accounts(); params=begin(client); github['status'][path]=500
    response=finish(client,params)
    assert response.status_code==502
    assert response.json()['error']['code']=='GITHUB_PROVIDER_ERROR'
    assert ACCESS not in response.text and REFRESH not in response.text
    assert finish(client,params).status_code==400


def test_identity_uniqueness_reconnect_and_login_rename(accounts,github,db):
    a,_=accounts();b,_=accounts()
    first=connected(a)
    github['user']['login']='renamed'
    second=connected(a)
    assert first['id']==second['id'] and second['github_user_id']=='123' and second['github_login']=='renamed'
    response=finish(b,begin(b))
    assert response.status_code==409 and response.json()['error']['code']=='GITHUB_IDENTITY_ALREADY_LINKED'
    assert len(db.scalars(select(GitHubConnection).where(GitHubConnection.revoked_at.is_(None))).all())==1


@pytest.mark.parametrize('owner_id,owner_type,expected',[(123,'User','personal_owner'),(999,'Organization','account_access'),(999,'User','account_access'),(123,'Organization','account_access')])
def test_repository_relationships_and_disconnect(accounts,github,db,owner_id,owner_type,expected):
    client,state=accounts(); connected(client); pid=project(client,state)
    github['repositories'][0]['owner'].update(id=owner_id,type=owner_type)
    response=link(client,pid)
    assert response.status_code==200,response.text
    value=response.json()['link']
    assert value['relationship']==expected and value['github_repository_id']=='9007199254740993'
    assert '/user/installations' in [r.url.path for r in github['calls']]
    github['repositories'][0].update(full_name='candidate/renamed',html_url='https://github.com/candidate/renamed')
    assert link(client,pid).json()['link']['github_repository_id']==value['github_repository_id']
    assert client.delete('/github/connection').status_code==204
    assert db.get(m.Project,UUID(pid))
    row=db.scalar(select(GitHubConnection))
    assert row.revoked_at and row.access_ciphertext is None and row.refresh_ciphertext is None
    assert client.get('/projects/'+pid+'/github-relationship').json()['link']['revoked_at']
    assert client.get('/github/installations').status_code==409


def test_intersection_ownership_mismatch_and_unlink(accounts,github):
    a,sa=accounts();b,sb=accounts(); connected(a)
    pid=project(a,sa)
    other=project(b,sb)
    assert link(a,other).status_code==404
    assert b.get('/projects/'+pid+'/github-relationship').status_code==404
    assert link(a,pid,'111').status_code==409
    wrong=project(a,sa,'https://github.com/candidate/other')
    assert link(a,wrong).json()['error']['code']=='GITHUB_REPOSITORY_MISMATCH'
    assert link(a,pid).status_code==200
    assert a.delete('/projects/'+pid+'/github-relationship').status_code==204
    assert a.get('/projects/'+pid+'/github-relationship').json()['link']['revoked_at']
    assert a.get('/github/installations/999/repositories').status_code==409
    assert not any('/999/repositories' in r.url.path for r in github['calls'])


def test_refresh_and_provider_revocation(accounts,github,db):
    client,_=accounts();connected(client)
    row=db.scalar(select(GitHubConnection));row.access_expires_at=utcnow()-timedelta(seconds=1);db.commit()
    db.expire_all()
    assert client.get('/github/installations').status_code==200
    assert any(b'grant_type=refresh_token' in r.content for r in github['calls'] if r.method=='POST')
    github['status']['/user/installations']=401
    assert client.get('/github/installations').json()['error']['code']=='GITHUB_CONNECTION_REVOKED'
    db.refresh(row);assert row.revoked_at and row.access_ciphertext is None


@pytest.mark.parametrize('failure',['cipher','refresh','expired-refresh'])
def test_credentials_fail_closed(accounts,github,db,failure):
    client,_=accounts();connected(client);row=db.scalar(select(GitHubConnection))
    if failure=='cipher': row.access_ciphertext='corrupted'
    else:
        row.access_expires_at=utcnow()-timedelta(seconds=1)
        if failure=='refresh': github['status']['/login/oauth/access_token']=400
        else: row.refresh_expires_at=utcnow()-timedelta(seconds=1)
    db.commit()
    db.expire_all()
    assert client.get('/github/installations').status_code==409
    db.refresh(row);assert row.revoked_at and row.access_ciphertext is None


@pytest.mark.parametrize('key',['','bad','ümlaut'])
def test_bad_encryption_configuration(accounts,github,monkeypatch,key):
    client,_=accounts();monkeypatch.setattr(settings,'github_app_encryption_key',key)
    assert client.post('/github/connect',json={}).json()['error']['code']=='GITHUB_APP_NOT_CONFIGURED'


@pytest.mark.parametrize('malformation',['too-many','partial','duplicate','unsafe-url','bad-id','permissions'])
def test_bounded_untrusted_repositories(github,malformation):
    if malformation=='too-many':
        github['repositories']*=501
    if malformation=='duplicate': github['repositories']*=2
    if malformation=='unsafe-url': github['repositories'][0]['html_url']='http://127.0.0.1/private'
    if malformation=='bad-id': github['repositories'][0]['id']=True
    if malformation=='permissions': github['repositories'][0]['permissions']={'pull':'yes'}
    provider=github['provider']
    if malformation=='partial':
        original=provider.request
        def partial(method,url,token=None,data=None,**kwargs):
            value=original(method,url,token,data,**kwargs)
            if 'repositories?' in url: value['total_count']=2
            return value
        provider.request=partial
    with pytest.raises(Exception) as error: provider.repositories(ACCESS,'42')
    assert getattr(error.value,'code','').startswith('GITHUB_')
    assert len(github['calls'])<=2


@pytest.mark.parametrize('path', ['/user/installations', '/user/installations/42/repositories'])
@pytest.mark.parametrize('status', [403, 404])
def test_access_failure_preserves_connection_and_other_repository(accounts, github, db, path, status):
    client, state = accounts()
    connected(client)
    pid = project(client, state)
    row = db.scalar(select(GitHubConnection))
    ciphertext = row.access_ciphertext
    github['status'][path] = status
    response = link(client, pid)
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'GITHUB_REPOSITORY_NOT_ACCESSIBLE'
    db.refresh(row)
    assert row.revoked_at is None and row.access_ciphertext == ciphertext
    assert db.scalar(select(GitHubRepositoryLink)) is None
    github['status'].clear()
    github['installations'].append({'id':43,'account':{'id':123,'login':'candidate','type':'User'}})
    assert client.get('/github/installations').status_code == 200
    assert client.get('/github/installations/43/repositories').status_code == 200
    assert link(client, pid).status_code == 200


@pytest.mark.parametrize('missing', ['installation', 'repository'])
def test_missing_access_does_not_revoke(accounts, github, db, missing):
    client, state = accounts()
    connected(client)
    pid = project(client, state)
    github['installations' if missing == 'installation' else 'repositories'].clear()
    response = link(client, pid)
    assert response.json()['error']['code'] == 'GITHUB_REPOSITORY_NOT_ACCESSIBLE'
    row = db.scalar(select(GitHubConnection))
    db.refresh(row)
    assert row.revoked_at is None and row.access_ciphertext
    assert db.scalar(select(GitHubRepositoryLink)) is None


@pytest.mark.parametrize('status,headers', [(403,{}),(404,{}),(500,{}),(429,{}),
    (403,{'x-ratelimit-remaining':'0'}),(403,{'retry-after':'60'})])
def test_user_provider_failure_preserves_connection(accounts, github, db, status, headers):
    from app.core.errors import AppError
    client, _ = accounts()
    connected(client)
    row = db.scalar(select(GitHubConnection))
    github['status']['/user'] = status
    github['headers']['/user'] = headers
    with pytest.raises(AppError) as error:
        service.with_token(db, row, github['provider'], github['provider'].user)
    assert error.value.code == 'GITHUB_PROVIDER_ERROR'
    db.refresh(row)
    assert row.revoked_at is None and row.access_ciphertext


@pytest.mark.parametrize('status,headers', [(429,{}),(500,{}),
    (403,{'x-ratelimit-remaining':'0'}),(403,{'retry-after':'60'})])
def test_discovery_provider_failure_preserves_connection(accounts, github, db, status, headers):
    client, _ = accounts()
    connected(client)
    github['status']['/user/installations'] = status
    github['headers']['/user/installations'] = headers
    response = client.get('/github/installations')
    assert response.status_code == 502
    assert response.json()['error']['code'] == 'GITHUB_PROVIDER_ERROR'
    row = db.scalar(select(GitHubConnection))
    db.refresh(row)
    assert row.revoked_at is None and row.access_ciphertext


@pytest.mark.parametrize('slug', ['', 'https://evil.test', '../evil', 'app/evil',
    'app?redirect=evil', 'app#evil', 'app%2fother', 'app\\evil', ' app', 'app\n',
    '-app', 'app-', 'app--name', 'App', 'äpp', 'a'*101])
def test_installation_slug_fails_safely(accounts, github, monkeypatch, db, slug):
    client, _ = accounts()
    connected(client)
    monkeypatch.setattr(settings, 'github_app_slug', slug)
    response = client.get('/github/installation-url')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'GITHUB_APP_NOT_CONFIGURED'
    assert 'installation_url' not in response.json()
    row = db.scalar(select(GitHubConnection))
    assert row.revoked_at is None and row.access_ciphertext


def test_installation_url_private_fixed_destination_and_refresh(accounts, github, db):
    institution, _ = accounts('institution')
    assert institution.get('/github/installation-url').status_code == 403
    client, state = accounts()
    assert client.get('/github/installation-url').status_code == 409
    original = connected(client)
    github['installations'].clear()
    assert client.get('/github/installations').json() == []
    response = client.get('/github/installation-url', params={
        'installation_url':'https://evil.test', 'redirect_uri':'https://evil.test',
        'slug':'evil', 'installation_id':'999'})
    assert response.status_code == 200
    assert response.json() == {'installation_url':'https://github.com/apps/zeminai-test/installations/new'}
    assert 'location' not in response.headers
    # A Setup URL redirect cannot confer access to an arbitrary installation.
    pid = project(client, state)
    response = client.post('/projects/'+pid+'/github-relationship', json={
        'installation_id':'999', 'repository_id':'9007199254740993'})
    assert response.json()['error']['code'] == 'GITHUB_REPOSITORY_NOT_ACCESSIBLE'
    assert db.scalar(select(GitHubRepositoryLink)) is None
    oauth_calls = sum(r.url.path == '/login/oauth/access_token' for r in github['calls'])
    github['installations'].append({'id':42,'account':{'id':123,'login':'candidate','type':'User'}})
    assert client.get('/github/installations').json()[0]['id'] == '42'
    assert client.get('/github/installations/42/repositories').status_code == 200
    assert link(client, pid).status_code == 200
    assert client.get('/github/connection').json()['connection'] == original
    assert sum(r.url.path == '/login/oauth/access_token' for r in github['calls']) == oauth_calls
    client.delete('/github/connection')
    assert client.get('/github/installation-url').status_code == 409
