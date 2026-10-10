from uuid import UUID, uuid4
import pytest
from sqlalchemy import select, event, create_engine
from fastapi.testclient import TestClient
from app.main import app
from app.models import domain as m
from app.api.routes import get_github
from app.services.github.provider import GitHubProvider
from test_github import mock_transport
from test_auth import accounts
from test_auth_audit import independent_db


@pytest.fixture
def context(accounts, db):
    candidate, state = accounts()
    other, other_state = accounts()
    institution, _ = accounts('institution')
    stranger, _ = accounts('institution')
    cid = state['candidate']['id']
    project = candidate.post(f'/candidates/{cid}/projects', json={'name':'Private name', 'description':'OSPF', 'source_url':'https://github.com/test/repo'}).json()
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    analyzed = candidate.post('/projects/'+project['id']+'/analyze')
    assert analyzed.status_code == 201, analyzed.text
    # Synthetic readme claim for an open-vocabulary criterion; no observed promotion.
    evidence = analyzed.json()['evidence'][0]
    db.add(m.SkillEvidence(candidate_id=UUID(cid),project_id=UUID(project['id']),
        snapshot_id=UUID(evidence['snapshot_id']),analysis_run_id=UUID(evidence['analysis_run_id']),
        skill_key='ospf',skill_label='OSPF',evidence_status='declared_only',evidence_strength='weak',
        evidence_type='readme',source_url='https://github.com/test/repo/blob/main/README.md',
        path='README.md',excerpt='OSPF',reason='README mention only',limitations=[]))
    db.commit()
    need = institution.post('/needs', json={'description':'Test', 'criteria':[
        {'skill_key':'python','skill_label':'Python','priority':'required'},
        {'skill_key':'ospf','skill_label':'OSPF','priority':'required'},
        {'skill_key':'docker','skill_label':'Docker','priority':'preferred'}]}).json()
    match = institution.post('/matches',json={'candidate_id':cid,'need_id':need['id']}).json()
    criterion = next(c for c in match['unmatched_criteria'] if c['skill_key']=='ospf')
    request = {'match_id':match['id'],'criterion_id':criterion['criterion_id'],'title':'OSPF proof','instructions':'Share relevant work.'}
    return candidate, other, institution, stranger, project, match, request


def test_frozen_trace_and_server_blind_payload(context, db):
    candidate, other, institution, stranger, project, match, request = context
    rows = match['matched_criteria']+match['unmatched_criteria']
    assert all(c['trace_available'] for c in rows)
    python = next(c for c in rows if c['skill_key']=='python')
    ospf = next(c for c in rows if c['skill_key']=='ospf')
    assert python['matched'] and any(e['status']=='observed' for e in python['trace_items'])
    assert not ospf['matched'] and any(e['status']=='declared_only' for e in ospf['trace_items'])
    blind=institution.get('/matches/'+match['id']+'?anonymous=true').json()
    assert blind['score']==match['score'] and blind['anonymous']
    for c in blind['matched_criteria']+blind['unmatched_criteria']:
        assert c['profile_evidence']==[]
        for e in c['trace_items']:
            assert e['source_url'] is None and not e['source_label'] and not e['summary'] and not e['excerpt']
    assert 'github.com' not in str(blind) and 'Private name' not in str(blind)
    original = institution.get('/matches/'+match['id']).json()
    row=db.scalar(select(m.SkillEvidence).where(m.SkillEvidence.project_id==UUID(project['id'])))
    row.reason='changed later';row.excerpt='later identity';db.commit()
    assert institution.get('/matches/'+match['id']).json()==original
    assert stranger.get('/matches/'+match['id']+'?anonymous=true').status_code==404


def test_proof_lifecycle_link_never_changes_score_or_evidence(context, db):
    candidate, other, institution, stranger, project, match, payload = context
    before=institution.get('/matches/'+match['id']).json()
    created=institution.post('/proof-requests',json=payload)
    assert created.status_code==201,created.text
    item=created.json();path='/proof-requests/'+item['id']
    assert institution.post('/proof-requests',json=payload).status_code==409
    assert candidate.get('/proof-requests').json()[0]['id']==item['id']
    assert institution.get('/proof-requests').json()[0]['id']==item['id']
    for client in [other,stranger]:
        assert client.get(path).status_code==404
        assert client.get('/proof-requests').json()==[]
    assert other.post(path+'/submit',json={'source_url':'https://example.org/work'}).status_code==404
    assert institution.post(path+'/submit',json={'source_url':'https://example.org/work'}).status_code==403
    assert candidate.patch(path,json={'status':'closed'}).status_code==403
    submitted=candidate.post(path+'/submit',json={'source_url':'https://example.org/work','note':'My work'})
    assert submitted.status_code==200,submitted.text
    assert submitted.json()['submission']['status']=='linked'
    assert candidate.post(path+'/submit',json={'source_url':'https://example.org/work'}).status_code==409
    assert stranger.patch(path,json={'status':'closed'}).status_code==404
    assert institution.patch(path,json={'status':'open'}).json()['status']=='open'
    assert candidate.post(path+'/submit',json={'source_url':'https://example.org/new'}).status_code==200
    assert institution.patch(path,json={'status':'closed'}).json()['status']=='closed'
    assert institution.patch(path,json={'status':'open'}).status_code==409
    assert institution.get('/matches/'+match['id']).json()==before
    second=institution.post('/proof-requests',json=payload).json()
    assert institution.patch('/proof-requests/'+second['id'],json={'status':'cancelled'}).json()['status']=='cancelled'


@pytest.mark.parametrize('source',['javascript:alert(1)','data:text/plain,test','file:///tmp/x','http://example.com','https://localhost/x','https://127.0.0.1/x','https://192.168.1.1/x','https://user:secret@example.org'])
def test_proof_rejects_unsafe_links(context,source):
    candidate,_,institution,_,_,_,payload=context
    item=institution.post('/proof-requests',json=payload).json()
    assert candidate.post('/proof-requests/'+item['id']+'/submit',json={'source_url':source}).status_code==422


def test_proof_project_profile_ownership_and_original_semantics(context):
    candidate,other,institution,stranger,project,match,payload=context
    item=institution.post('/proof-requests',json=payload).json();path='/proof-requests/'+item['id']
    state=other.get('/auth/me').json();other_project=other.post('/candidates/'+state['candidate']['id']+'/projects',json={'name':'Other','source_url':'https://github.com/test/repo'}).json()
    assert candidate.post(path+'/submit',json={'project_id':other_project['id']}).status_code==404
    good=candidate.post(path+'/submit',json={'project_id':project['id']})
    assert good.status_code==200 and good.json()['submission']['status']=='linked'
    assert any(e['status']=='declared_only' for e in good.json()['submission']['evidence'])
    assert institution.patch(path,json={'status':'open'}).status_code==200
    cid=candidate.get('/auth/me').json()['candidate']['id']
    profile=candidate.post('/candidates/'+cid+'/profile-evidence',json={'category':'portfolio','title':'My lab','source_url':'https://example.org/lab'}).json()
    submitted=candidate.post(path+'/submit',json={'profile_evidence_id':profile['id']}).json()
    assert submitted['submission']['status']=='linked'
    candidate.delete('/profile-evidence/'+profile['id'])
    assert institution.get(path).json()['submission']==submitted['submission']
    assert institution.get('/matches/'+match['id']).json()==match


def test_proof_requires_own_match_and_gap_and_csrf(context):
    candidate,_,institution,stranger,project,match,payload=context
    assert stranger.post('/proof-requests',json=payload).status_code==404
    assert candidate.post('/proof-requests',json=payload).status_code==403
    assert institution.post('/proof-requests',json={**payload,'criterion_id':str(uuid4())}).status_code==404
    assert institution.post('/proof-requests',json={**payload,'criterion_id':match['matched_criteria'][0]['criterion_id']}).status_code==409
    assert institution.post('/proof-requests',json=payload,headers={'Origin':'https://evil-localhost.example'}).status_code==403
    with TestClient(app) as anonymous:
        assert anonymous.get('/proof-requests').status_code==401
        assert anonymous.post('/proof-requests',json=payload,headers={'Origin':'http://localhost:3000'}).status_code==401


def test_proof_inbox_select_count_is_constant(context,db):
    _,_,institution,_,_,_,payload=context
    counts=[]
    def count(*args):
        if args[2].lstrip().upper().startswith('SELECT'): counts.append(1)
    def reads():
        counts.clear();event.listen(db.bind,'before_cursor_execute',count)
        try: assert institution.get('/proof-requests').status_code==200
        finally: event.remove(db.bind,'before_cursor_execute',count)
        return len(counts)
    first=institution.post('/proof-requests',json=payload).json();one=reads()
    for _ in range(11):
        institution.patch('/proof-requests/'+first['id'],json={'status':'cancelled'})
        first=institution.post('/proof-requests',json=payload).json()
    assert reads()==one


def test_new_observed_evidence_affects_only_new_match(context, db, monkeypatch):
    candidate, _, institution, _, project, old, payload = context
    from app.api.routes import get_skill_analyzer
    from app.services.analysis.rules import RuleSkillAnalyzer
    from app.schemas.domain import EvidenceInput
    class NewObservation(RuleSkillAnalyzer):
        # Synthetic analyzer output, not a claim about live provider grounding.
        def analyze_project(self, *args, **kwargs):
            result = super().analyze_project(*args, **kwargs)
            result.evidence.append(EvidenceInput(skill_key='ospf', skill_label='OSPF',
                evidence_status='observed', evidence_strength='strong', evidence_type='source_file',
                source_url='https://github.com/test/repo/blob/main/app.py', path='app.py',
                excerpt='synthetic OSPF fixture', reason='Synthetic source observation', limitations=[]))
            result.skills.append('ospf')
            return result
    app.dependency_overrides[get_skill_analyzer] = lambda: NewObservation()
    response = candidate.post('/projects/'+project['id']+'/analyze')
    assert response.status_code == 201, response.text
    item = institution.post('/proof-requests',json=payload).json()
    submitted = candidate.post('/proof-requests/'+item['id']+'/submit',json={'project_id':project['id']})
    assert submitted.status_code == 200
    assert any(e['skill_label']=='OSPF' and e['status']=='observed' for e in submitted.json()['submission']['evidence'])
    institution.patch('/proof-requests/'+item['id'],json={'status':'closed'})
    new = institution.post('/matches',json={'candidate_id':old['candidate_id'],'need_id':old['need_id']}).json()
    assert any(c['skill_key']=='ospf' for c in new['matched_criteria'])
    assert institution.get('/matches/'+old['id']).json() == old


def test_legacy_trace_is_explicitly_unavailable(context, db):
    _,_,institution,_,_,match,_ = context
    for row in db.scalars(select(m.MatchCriterion).where(m.MatchCriterion.match_id==UUID(match['id']))):
        row.trace_items = None
    db.commit()
    result = institution.get('/matches/'+match['id']).json()
    assert result['score'] == match['score']
    assert all(not c['trace_available'] and c['trace_items']==[] for c in result['matched_criteria']+result['unmatched_criteria'])


def test_trace_read_select_count_constant(context, db):
    _,_,institution,_,_,match,_ = context
    statements=[]
    def count(*args):
        if args[2].lstrip().upper().startswith('SELECT'): statements.append(1)
    event.listen(db.bind,'before_cursor_execute',count)
    try:
        assert institution.get('/matches/'+match['id']).status_code==200
    finally: event.remove(db.bind,'before_cursor_execute',count)
    assert len(statements) <= 8


def test_proof_migration_fresh_upgrade_and_downgrade_guard(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from app.core.config import settings
    from sqlalchemy import text
    from pathlib import Path
    url = 'sqlite:///'+(tmp_path/'proof-migration.db').as_posix()
    monkeypatch.setattr(settings,'database_url',url)
    config = Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    command.upgrade(config,'a13_operation_budgets')
    engine=create_engine(url)
    with engine.begin() as conn:
        before = conn.scalar(text('SELECT count(*) FROM users'))
    command.upgrade(config,'head'); command.check(config)
    with engine.begin() as conn:
        from alembic.script import ScriptDirectory
        assert conn.scalar(text('SELECT version_num FROM alembic_version'))==ScriptDirectory.from_config(config).get_current_head()
        assert conn.scalar(text('SELECT count(*) FROM users'))==before
    command.downgrade(config,'a13_operation_budgets')
    command.upgrade(config,'head'); command.check(config)
    engine.dispose()


def test_concurrent_proof_duplicate_and_restart(independent_db, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from app.core.config import settings
    from sqlalchemy.orm import Session
    from test_auth import PASSWORD
    headers={'Origin':'http://localhost:3000'}
    with TestClient(app,headers=headers) as candidate, TestClient(app,headers=headers) as institution:
        state=candidate.post('/auth/register',json={'role':'candidate','email':f'{uuid4()}@example.test','password':PASSWORD,'display_name':'Concurrent candidate'}).json()
        institution.post('/auth/register',json={'role':'institution','email':f'{uuid4()}@example.test','password':PASSWORD,'display_name':'Institution'})
        cid=state['candidate']['id']
        project=candidate.post('/candidates/'+cid+'/projects',json={'name':'Fixture','source_url':'https://github.com/test/repo'}).json()
        app.dependency_overrides[get_github]=lambda:GitHubProvider(transport=mock_transport())
        assert candidate.post('/projects/'+project['id']+'/analyze').status_code==201
        need=institution.post('/needs',json={'description':'Fixture','criteria':[{'skill_key':'ospf','skill_label':'OSPF','priority':'required'}]}).json()
        match=institution.post('/matches',json={'candidate_id':cid,'need_id':need['id']}).json()
        payload={'match_id':match['id'],'criterion_id':match['unmatched_criteria'][0]['criterion_id'],'title':'Proof','instructions':'Show source'}
        cookie=institution.cookies.get(settings.session_cookie_name)
        def create(_):
            with TestClient(app,headers=headers) as client:
                client.cookies.set(settings.session_cookie_name,cookie)
                return client.post('/proof-requests',json=payload)
        with ThreadPoolExecutor(max_workers=2) as pool: responses=list(pool.map(create,range(2)))
        assert sorted(r.status_code for r in responses)==[201,409]
        request=next(r.json() for r in responses if r.status_code==201)
        independent_db.dispose()
        assert institution.get('/proof-requests/'+request['id']).json()['status']=='open'
        path='/proof-requests/'+request['id']
        assert candidate.post(path+'/submit',json={'source_url':'https://example.org/proof'}).status_code==200
        assert institution.patch(path,json={'status':'closed'}).status_code==200
        with Session(independent_db) as db:
            assert db.get(m.ProofRequest,UUID(request['id'])).status=='closed'

        # Migration refuses to discard an actual saved request / trace.
        from alembic import command
        from alembic.config import Config
        from pathlib import Path
        monkeypatch.setattr(settings, 'database_url', independent_db.url.render_as_string(hide_password=False))
        config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
        if independent_db.dialect.name=='sqlite': command.stamp(config,'head')
        with pytest.raises(RuntimeError,match='Proof requests or frozen traces'):
            command.downgrade(config,'a13_operation_budgets')


def test_team_two_three_four_removal_and_blind_equivalence(client):
    from test_living import add
    ids=[client.post('/candidates',json={'name':f'Synthetic {i}'}).json()['id'] for i in range(4)]
    for cid,category in zip(ids,['hackathon','community','event','education']): add(client,cid,category)
    criteria=[{'skill_key':key,'skill_label':kind,'kind':kind,'priority':'required'} for key,kind in [('hackathon_experience','hackathon'),('community_experience','community'),('event_experience','event')]]
    need=client.post('/needs',json={'description':'Synthetic team coverage','criteria':criteria}).json()
    def coverage(selected,anonymous):
        response=client.post('/needs/'+need['id']+'/team-coverage',json={'candidate_ids':selected,'anonymous':anonymous})
        assert response.status_code==200,response.text
        return response.json()
    for size,expected in [(2,2),(3,3),(4,3)]:
        blind=coverage(ids[:size],True);normal=coverage(ids[:size],False)
        assert blind['matched_count']==normal['matched_count']==expected
        assert blind['required_coverage']==normal['required_coverage']==expected/3
        for bc,nc in zip(blind['criteria'],normal['criteria']):
            assert {k:v for k,v in bc.items() if k!='supporters'}=={k:v for k,v in nc.items() if k!='supporters'}
            assert [(v['candidate_id'],v['sources']) for v in bc['supporters']]==[(v['candidate_id'],v['sources']) for v in nc['supporters']]
        assert 'Synthetic ' not in str(blind)
    assert coverage([ids[0],ids[3]],True)['matched_count']==1
    assert client.post('/needs/'+need['id']+'/team-coverage',json={'candidate_ids':ids+[ids[0]]}).status_code==422
