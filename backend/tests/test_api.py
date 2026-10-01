from uuid import uuid4

from sqlalchemy import select

from app.api.routes import get_github, get_need_analyzer, get_skill_analyzer
from app.main import app
from app.models import domain as m
from app.services.github.provider import GitHubProvider
from test_github import mock_transport


def create_entities(client):
    candidate = client.post('/candidates', json={'name': 'Ada'})
    assert candidate.status_code == 201, candidate.text
    cid = candidate.json()['id']
    project = client.post(f'/candidates/{cid}/projects', json={
        'name': 'Demo', 'description': 'FastAPI', 'source_url': 'https://github.com/test/repo'})
    assert project.status_code == 201, project.text
    need = client.post('/needs', json={'description': 'Python ve FastAPI gerekli; Docker tercih edilir'})
    assert need.status_code == 201, need.text
    return cid, project.json()['id'], need.json()['id']


def test_create_get_and_health(client):
    cid, pid, nid = create_entities(client)
    assert client.get(f'/candidates/{cid}').json()['name'] == 'Ada'
    assert client.get(f'/projects/{pid}').json()['candidate_id'] == cid
    assert len(client.get(f'/needs/{nid}').json()['criteria']) == 3
    assert client.get('/health').json() == {'status': 'ok', 'service': 'zeminai-api', 'database': 'ok'}


def test_full_analysis_match_and_historical_references(client, db):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    cid, pid, nid = create_entities(client)
    analysis = client.post(f'/projects/{pid}/analyze')
    assert analysis.status_code == 201, analysis.text
    body = analysis.json()
    assert body['run']['status'] == 'completed'
    assert client.get('/snapshots/' + body['snapshot']['id']).json()['commit_sha'] == 'a'*40
    assert client.get('/analysis-runs/' + body['run']['id']).status_code == 200
    response = client.post('/matches', json={'candidate_id': cid, 'need_id': nid})
    assert response.status_code == 201, response.text
    result = response.json()
    assert result['score'] == 80
    assert len(result['matched_criteria']) == 2
    assert result['unmatched_criteria'][0]['skill_key'] == 'docker'
    assert client.get('/matches/' + result['id']).json() == result
    old_ids = {eid for c in result['matched_criteria'] for eid in c['evidence_ids']}
    for eid in old_ids:
        assert client.get('/evidence/' + eid).json()['candidate_id'] == cid
    assert client.post(f'/projects/{pid}/analyze').status_code == 201
    newer = client.post('/matches', json={'candidate_id': cid, 'need_id': nid}).json()
    assert newer['score'] == 80
    assert not old_ids.intersection(eid for c in newer['matched_criteria'] for eid in c['evidence_ids'])
    assert client.get('/matches/' + result['id']).json() == result


def test_match_without_analysis_is_explicit(client):
    cid, pid, nid = create_entities(client)
    response = client.post('/matches', json={'candidate_id': cid, 'need_id': nid})
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'INSUFFICIENT_PROJECT_DATA'


def test_failed_analysis_persisted_no_fake_evidence(client, db):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport(404))
    _, pid, _ = create_entities(client)
    response = client.post(f'/projects/{pid}/analyze')
    assert response.status_code == 404
    run = db.scalar(select(m.AnalysisRun).where(m.AnalysisRun.analysis_type == 'project'))
    assert run.status == 'failed'
    assert run.error_code == 'SOURCE_UNREACHABLE'
    assert db.scalars(select(m.SkillEvidence)).all() == []


def test_bad_ids_and_urls(client):
    assert client.get('/candidates/not-a-uuid').json()['error']['code'] == 'VALIDATION_ERROR'
    assert client.get('/candidates/' + str(uuid4())).status_code == 404
    cid = client.post('/candidates', json={'name': 'Ada'}).json()['id']
    response = client.post(f'/candidates/{cid}/projects', json={'name': 'bad', 'source_url': 'https://evil.test/a/b'})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'INVALID_SOURCE_URL'
    assert client.post('/candidates', json={'name': ' '}).status_code == 422
    assert client.get('/missing').json()['error']['code'] == 'HTTP_ERROR'


def test_explicit_criteria_and_empty_need(client):
    need = client.post('/needs', json={'description': 'Something custom', 'criteria': [
        {'skill_key': 'custom_skill', 'skill_label': 'Custom', 'priority': 'required'}]})
    assert need.status_code == 201
    assert need.json()['analysis_version'] == 'explicit-criteria-v0.1'
    empty = client.post('/needs', json={'description': 'Belirsiz ihtiyaç'}).json()
    cid = client.post('/candidates', json={'name': 'Ada'}).json()['id']
    response = client.post('/matches', json={'candidate_id': cid, 'need_id': empty['id']})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'MATCHING_FAILED'
    duplicate = client.post('/needs', json={'description': 'Python', 'criteria': [
        {'skill_key': 'python', 'skill_label': 'Python', 'priority': p} for p in ['required', 'preferred']]})
    assert duplicate.status_code == 422


def test_invalid_analysis_output_preserves_snapshot_and_failure(client, db):
    class BrokenAnalyzer:
        version = 'broken-test'

        def analyze_project(self, data):
            return {'skills': ['fabricated']}

    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    app.dependency_overrides[get_skill_analyzer] = BrokenAnalyzer
    _, pid, _ = create_entities(client)
    response = client.post(f'/projects/{pid}/analyze')
    assert response.status_code == 502
    assert response.json()['error']['code'] == 'INVALID_MODEL_OUTPUT'
    run_id = response.json()['error']['details']['analysis_run_id']
    assert client.get('/analysis-runs/' + run_id).json()['status'] == 'failed'
    assert len(db.scalars(select(m.RepositorySnapshot)).all()) == 1
    assert db.scalars(select(m.SkillEvidence)).all() == []


def test_invalid_need_output_is_recorded(client):
    class BrokenNeedAnalyzer:
        version = 'broken-need'

        def analyze_need(self, data):
            return '{}'

    app.dependency_overrides[get_need_analyzer] = BrokenNeedAnalyzer
    response = client.post('/needs', json={'description': 'Python'})
    assert response.status_code == 502
    error = response.json()['error']
    assert error['code'] == 'INVALID_MODEL_OUTPUT'
    assert client.get('/analysis-runs/' + error['details']['analysis_run_id']).json()['status'] == 'failed'


def test_database_failure_has_standard_error(client, db):
    from sqlalchemy.exc import OperationalError
    from app.db.session import get_db

    class BrokenDB:
        def execute(self, statement):
            raise OperationalError('SELECT 1', {}, Exception('sensitive connection info'))

    app.dependency_overrides[get_db] = BrokenDB
    response = client.get('/health')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'DATABASE_ERROR'
    assert 'sensitive' not in response.text


def test_successful_analysis_with_no_evidence_can_match_zero(client):
    from app.schemas.domain import SnapshotData, SnapshotFile

    class NoSkillsProvider:
        def fetch(self, url):
            return SnapshotData(repository_url=url, default_branch='main', commit_sha='a'*40,
                files=[SnapshotFile(path='README.md', content='Hello world', sha='b'*40, source_url=url)])

    app.dependency_overrides[get_github] = NoSkillsProvider
    cid, pid, nid = create_entities(client)
    analysis = client.post(f'/projects/{pid}/analyze')
    assert analysis.status_code == 201
    # Project description is still a declaration; it cannot increase coverage.
    assert all(e['evidence_status'] == 'declared_only' for e in analysis.json()['evidence'])
    result = client.post('/matches', json={'candidate_id': cid, 'need_id': nid})
    assert result.status_code == 201
    assert result.json()['score'] == 0
