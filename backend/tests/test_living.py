from uuid import uuid4

import pytest
from sqlalchemy import event

from app.api.routes import get_github, get_need_analyzer
from app.main import app
from app.services.github.provider import GitHubProvider
from test_github import mock_transport
from test_api import create_entities


def add(client, cid, category, **fields):
    response = client.post(f'/candidates/{cid}/profile-evidence', json={'category': category, 'title': category, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_timeline_real_records_counts_and_provenance(client):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    cid, pid, _ = create_entities(client)
    analysis = client.post(f'/projects/{pid}/analyze').json()
    first = add(client, cid, 'education', started_at='2024-01-01')
    second = add(client, cid, 'hackathon', started_at='2025-06-01', source_url='https://example.org/event')
    portfolio = add(client, cid, 'portfolio', source_url='https://example.org/demo', metadata_json={'output_type':'demo'})
    response = client.get(f'/candidates/{cid}/living-profile')
    assert response.status_code == 200, response.text
    body = response.json()
    assert {r['id'] for r in body['timeline']} == {first['id'], second['id'], portfolio['id'], pid}
    assert [r['date'] for r in body['timeline']] == sorted(r['date'] for r in body['timeline'])
    assert body['timeline'][0]['date_basis'] == 'started_at'
    summary = {r['label']: r['count'] for r in body['summary']}
    assert summary['Proje'] == 1 and summary['Eğitim'] == 1
    assert summary['Gözlemlenen teknik kanıt'] == sum(e['evidence_status'] == 'observed' for e in analysis['evidence'])
    assert 'score' not in response.text and 'individual authorship not verified' in response.text
    assert {r['status'] for r in body['passport']} >= {'declared_only','linked','observed'}
    assert all(r['status'] != 'verified' for r in body['passport'])
    filtered = client.get(f'/candidates/{cid}/living-profile?since=2025-01-01').json()
    assert first['id'] not in {r['id'] for r in filtered['timeline']}
    # Latest successful run is counted once, even after reanalysis.
    client.post(f'/projects/{pid}/analyze')
    assert client.get(f'/candidates/{cid}/living-profile').json()['summary'] == body['summary']


def test_discovery_same_formula_no_ai_and_frozen_gaps(client):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    cid, pid, nid = create_entities(client)
    client.post(f'/projects/{pid}/analyze')
    saved = client.post('/matches', json={'candidate_id':cid,'need_id':nid}).json()
    # Discovery must never request an analyzer dependency or network.
    def forbidden():
        raise AssertionError('No AI calls in read models')
    app.dependency_overrides[get_need_analyzer] = forbidden
    discovery = client.get(f'/needs/{nid}/discovery').json()
    assert discovery['candidates'][0]['score'] == saved['score'] == 80
    for i in range(6):
        add(client, cid, 'certification', title=f'Irrelevant {i}')
    assert client.get(f'/needs/{nid}/discovery').json()['candidates'][0]['score'] == 80
    gaps = client.get('/matches/'+saved['id']+'/gaps').json()['items']
    docker = next(g for g in gaps if g['label'] == 'Docker')
    assert docker['state'] == 'preferred_gap'
    assert 'kanıt bulunamadı' in docker['explanation'] and 'Varsa' in docker['next_step']
    assert 'bilmiyor' not in str(gaps)
    assert client.get('/matches/'+saved['id']).json() == saved


def test_anonymous_response_removes_identity_and_preserves_sources(client):
    cid = client.post('/candidates', json={'name':'SECRET PERSON'}).json()['id']
    add(client, cid, 'education', title='SECRET SCHOOL', organization='SECRET SCHOOL', description='SECRET PERSON')
    add(client, cid, 'hackathon', title='SECRET PERSON contest', source_url='https://example.org/SECRET')
    nid = client.post('/needs', json={'description':'Hackathon deneyimi gerekli'}).json()['id']
    response = client.get(f'/needs/{nid}/discovery')
    assert response.status_code == 200 and 'SECRET' not in response.text
    row = response.json()['candidates'][0]
    assert row['label'].startswith('Aday #') and row['score'] == 100
    assert row['criteria'][0]['sources'] == [{'family':'hackathon','status':'linked','count':1}]
    assert client.get(f'/needs/{nid}/discovery?anonymous=false').json()['candidates'][0]['label'] == 'SECRET PERSON'


def test_team_union_no_fake_coverage_and_bounded_selection(client):
    a, b = [client.post('/candidates', json={'name':name}).json()['id'] for name in ['A','B']]
    add(client, a, 'hackathon')
    add(client, b, 'community')
    nid = client.post('/needs',json={'description':'Python gerekli; hackathon deneyimi gerekli; topluluk deneyimi tercih edilir'}).json()['id']
    response = client.post(f'/needs/{nid}/team-coverage', json={'candidate_ids':[a,b]})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['matched_count'] == 2 and body['total_count'] == 3
    assert body['required_coverage'] == .5 and body['preferred_coverage'] == 1
    python = next(c for c in body['criteria'] if c['label'] == 'Python')
    assert python['supporters'] == []
    for ids in [[a], [a,a], [a,b,a,b,a]]:
        assert client.post(f'/needs/{nid}/team-coverage',json={'candidate_ids':ids}).status_code == 422
    assert client.post(f'/needs/{nid}/team-coverage',json={'candidate_ids':[a,str(uuid4())]}).status_code == 404
    assert client.post(f'/needs/{nid}/team-coverage',json={'candidate_ids':[a,b], 'match_ids':[str(uuid4())]}).status_code == 422


def test_discovery_pagination_stable_and_query_count_constant(client, db):
    nid = client.post('/needs',json={'description':'Python gerekli'}).json()['id']
    for i in range(12):
        cid = client.post('/candidates',json={'name':str(i)}).json()['id']
        for j in range(2):
            client.post(f'/candidates/{cid}/projects',json={'name':str(j),'source_url':'https://github.com/test/repo'})
        add(client, cid, 'event')
    counts = []
    def record(*args):
        if args[2].lstrip().upper().startswith('SELECT'):
            counts.append(args[2])
    event.listen(db.bind, 'before_cursor_execute', record)
    try:
        small = client.get(f'/needs/{nid}/discovery?limit=1').json()
        one = len(counts)
        counts.clear()
        large = client.get(f'/needs/{nid}/discovery?limit=12').json()
        assert len(counts) == one and one <= 8
    finally:
        event.remove(db.bind, 'before_cursor_execute', record)
    assert small['has_more'] and not large['has_more']
    assert small['candidates'][0] == large['candidates'][0]
    assert client.get(f'/needs/{nid}/discovery?limit=51').status_code == 422
    assert client.get(f'/needs/{nid}/discovery?offset=-1').status_code == 422


@pytest.mark.parametrize('url',['javascript:alert(1)','data:text/html,test','file:///etc/passwd','vbscript:msgbox(1)','http://example.org','https://127.0.0.1','https://user:pass@example.org','https://example.local','https://example.org:8080'])
def test_portfolio_rejects_unsafe_urls(client, url):
    cid = client.post('/candidates',json={'name':'A'}).json()['id']
    assert client.post(f'/candidates/{cid}/profile-evidence',json={'category':'portfolio','title':'Demo','source_url':url}).status_code == 422


def test_portfolio_mass_assignment_and_metadata(client):
    cid = client.post('/candidates',json={'name':'A'}).json()['id']
    for extra in [{'verification_status':'verified'}, {'metadata_json':{'output_type':'arbitrary'}}, {'metadata_json':{'student_year':4}}]:
        assert client.post(f'/candidates/{cid}/profile-evidence',json={'category':'portfolio','title':'Demo',**extra}).status_code == 422
