from uuid import UUID, uuid4
import pytest
from sqlalchemy import event
from fastapi.testclient import TestClient
from app.main import app
from app.models import domain as m
from app.services import living
from app.core.config import settings
from app.api.routes import get_github, get_need_analyzer
from app.services.github.provider import GitHubProvider
from test_github import mock_transport
from test_auth import accounts
from test_living import add


def setup(client, size=5):
    ids = [client.post('/candidates', json={'name': f'SECRET {n}'}).json()['id'] for n in range(size)]
    need = client.post('/needs', json={'description': 'hackathon deneyimi gerekli; topluluk deneyimi tercih edilir'}).json()['id']
    return ids, need


def request(client, need, ids, **extra):
    return client.post(f'/needs/{need}/team-complements', json={'candidate_ids': ids, **extra})


def test_order_union_sources_and_anonymous(client):
    ids, need = setup(client, 7)
    # Required outranks preferred even though every gap contributes to the union.
    for cid in ids[2:6]: add(client, cid, 'hackathon', title='SECRET title')
    for cid in [ids[2], ids[3], ids[6]]: add(client, cid, 'community')
    expected = sorted(ids[2:4]) + sorted(ids[4:6]) + [ids[6]]
    for anonymous in [True, False]:
        r = request(client, need, ids[:2], anonymous=anonymous)
        assert r.status_code == 200, r.text
        body = r.json()
        assert [c['candidate_id'] for c in body['candidates']] == expected
        assert len(body['uncovered_criteria']) == 2
        assert all(c['candidate_id'] not in ids[:2] for c in body['candidates'])
        first = body['candidates'][0]
        assert first['resulting_required_coverage'] == first['resulting_preferred_coverage'] == 1
        assert first['resulting_matched_count'] == 2
        assert first['closes'][0]['sources']
        assert body['ordering'] == 'closes_required_count DESC, closes_preferred_count DESC, candidate_id ASC'
        if anonymous: assert 'SECRET' not in r.text
        else: assert 'SECRET' in r.text
    # Already covered required criteria must not count as newly closed gaps.
    add(client, ids[0], 'hackathon')
    body = request(client, need, ids[:2]).json()
    assert {c['candidate_id'] for c in body['candidates']} == {ids[2], ids[3], ids[6]}
    assert all(c['closes_required_count'] == 0 and c['resulting_required_coverage'] == 1 for c in body['candidates'])
    add(client, ids[1], 'community')
    body = request(client, need, ids[:2]).json()
    assert body['uncovered_criteria'] == body['candidates'] == []


@pytest.mark.parametrize('count', [0, 1, 4, 5])
def test_size_validation(client, count):
    ids, need = setup(client)
    assert request(client, need, ids[:count]).status_code == 422


def test_duplicate_missing_inactive_and_empty(client, db):
    ids, need = setup(client)
    assert request(client, need, [ids[0], ids[0]]).status_code == 422
    assert request(client, need, [ids[0], str(uuid4())]).status_code == 404
    assert request(client, need, ids[:3]).status_code == 200
    assert request(client, need, ids[:2]).json()['candidates'] == []
    candidate = db.get(m.Candidate, UUID(ids[0]))
    db.get(m.User, candidate.owner_user_id).is_active = False
    db.commit()
    assert request(client, need, ids[:2]).status_code == 404


def test_technical_observed_not_declared_no_providers(client, monkeypatch):
    ids, _ = setup(client, 4)
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    pid = client.post(f'/candidates/{ids[2]}/projects', json={'name':'Project', 'source_url':'https://github.com/test/repo'}).json()['id']
    assert client.post(f'/projects/{pid}/analyze').status_code == 201
    need = client.post('/needs', json={'description':'Python gerekli; Docker tercih edilir'}).json()['id']
    def forbidden(*args, **kwargs): raise AssertionError('No provider or external fetch')
    app.dependency_overrides[get_github] = forbidden
    app.dependency_overrides[get_need_analyzer] = forbidden
    monkeypatch.setattr(GitHubProvider, 'fetch', forbidden)
    body = request(client, need, ids[:2]).json()
    assert len(body['candidates']) == 1
    suggestion = body['candidates'][0]
    assert [c['label'] for c in suggestion['closes']] == ['Python']
    assert suggestion['resulting_required_coverage'] == 1
    assert suggestion['resulting_preferred_coverage'] == 0
    assert all(s['status'] == 'observed' for c in suggestion['closes'] for s in c['sources'])


def test_pool_limit_fails_before_material_and_searches_beyond_first_page(client, monkeypatch):
    ids, need = setup(client, 23)
    ids = sorted(ids)  # Qualifying candidate is beyond the first 20 DB IDs.
    add(client, ids[-1], 'hackathon')
    assert request(client, need, ids[:2]).json()['candidates'][0]['candidate_id'] == ids[-1]
    monkeypatch.setattr(living, 'DISCOVERY_MAX_CANDIDATES', 22)
    def forbidden(*args, **kwargs): raise AssertionError('Do not load partial pool')
    monkeypatch.setattr(living, 'load_material', forbidden)
    response = request(client, need, ids[:2])
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'DISCOVERY_POOL_LIMIT_EXCEEDED'
    assert 'candidates' not in response.json()


@pytest.mark.parametrize('size', [3, 12])
def test_bounded_queries(client, db, size):
    ids, need = setup(client, size)
    db.expunge_all()
    queries = []
    def record(*args):
        if args[2].lstrip().upper().startswith('SELECT'): queries.append(args[2])
    event.listen(db.bind, 'before_cursor_execute', record)
    try:
        response = request(client, need, ids[:2])
        assert response.status_code == 200, response.text
        assert len(queries) == 10
    finally: event.remove(db.bind, 'before_cursor_execute', record)


def test_real_auth_ownership_csrf_and_compute(accounts, monkeypatch):
    institution, _ = accounts('institution')
    other, _ = accounts('institution')
    candidate, a = accounts()
    _, b = accounts()
    need = institution.post('/needs', json={'description':'Python gerekli'}).json()['id']
    ids = [a['candidate']['id'], b['candidate']['id']]
    assert request(candidate, need, ids).status_code == 403
    assert request(other, need, ids).status_code == 404
    with TestClient(app, headers={'Origin':'http://localhost:3000'}) as anon:
        assert request(anon, need, ids).status_code == 401
    assert institution.post(f'/needs/{need}/team-complements', json={'candidate_ids':ids}, headers={'Origin':'https://evil.example'}).status_code == 403
    monkeypatch.setattr(settings, 'compute_user_attempts', 1)
    assert request(institution, need, ids).status_code == 200
    limited = request(institution, need, ids)
    assert limited.status_code == 429
    assert limited.headers['Retry-After']


def test_more_required_gaps_precede_preferred_and_inactive_suggestions_are_excluded(client, db):
    ids, _ = setup(client, 5)
    for family in ['hackathon', 'community']: add(client, ids[2], family)
    for family in ['hackathon', 'event']: add(client, ids[3], family)
    add(client, ids[4], 'community')
    candidate = db.get(m.Candidate, UUID(ids[4]))
    db.get(m.User, candidate.owner_user_id).is_active = False
    db.commit()
    need = client.post('/needs', json={'description':'Explicit criteria', 'criteria':[
        {'kind':family, 'skill_key':key, 'skill_label':family, 'priority':priority}
        for family,key,priority in [('hackathon','hackathon_experience','required'),
            ('community','community_experience','required'), ('event','event_experience','preferred')]]}).json()['id']
    body = request(client, need, ids[:2]).json()
    assert [c['candidate_id'] for c in body['candidates']] == [ids[2], ids[3]]
    assert [c['closes_required_count'] for c in body['candidates']] == [2, 1]
    assert [c['closes_preferred_count'] for c in body['candidates']] == [0, 1]
