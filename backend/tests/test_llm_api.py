import json

import httpx
import pytest
from sqlalchemy import select

from app.api.routes import get_github
from app.core.config import settings
from app.main import app
from app.models import domain as m
from app.services.github.provider import GitHubProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.llm.gemini_provider import GeminiProvider
from test_gemini import envelope as gemini_envelope
from test_api import create_entities
from test_github import mock_transport
from test_llm import envelope, evidence_draft


@pytest.mark.parametrize('mode', ['openai', 'gemini'])
def test_llm_full_api_flow_and_metadata(client, db, monkeypatch, mode):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    cid, pid, _ = create_entities(client)
    def handle(request):
        payload = json.loads(request.content)
        name = (payload['text']['format']['name'] if mode == 'openai' else
                ('project_analysis' if 'evidence' in payload['generationConfig']['responseFormat']['text']['schema']['properties'] else 'need_analysis'))
        output = evidence_draft() if name == 'project_analysis' else {'criteria': [{
            'kind': 'technical_skill', 'skill_key': 'FastAPI', 'skill_label': 'FastAPI', 'priority': 'preferred',
            'reason': 'Explicit preference', 'source_excerpt': 'FastAPI'}], 'uncertainties': []}
        return httpx.Response(200, json=(envelope if mode == 'openai' else gemini_envelope)(json.dumps(output)))
    monkeypatch.setattr(settings, 'llm_provider', mode)
    monkeypatch.setattr('app.services.analysis.factory.llm_provider', lambda _: (OpenAIProvider if mode == 'openai' else GeminiProvider)(
        'mock-secret', 'configured-model', transport=httpx.MockTransport(handle)))
    analyzed = client.post(f'/projects/{pid}/analyze')
    assert analyzed.status_code == 201, analyzed.text
    run = analyzed.json()['run']
    assert (run['provider'], run['model'], run['commit_sha']) == (mode, 'configured-model', 'a'*40)
    assert run['analysis_version'] == 'project-analysis-v0.4'
    need = client.post('/needs', json={'description': 'FastAPI tercih edilir'})
    assert need.status_code == 201, need.text
    assert need.json()['analysis_version'] == 'need-analysis-v0.4'
    result = client.post('/matches', json={'candidate_id': cid, 'need_id': need.json()['id']})
    assert result.status_code == 201, result.text
    assert result.json()['score'] == 100
    assert result.json()['required_coverage'] == 0
    assert result.json()['scoring_version'] == 'evidence-coverage-v0.2'
    assert client.get('/matches/' + result.json()['id']).json() == result.json()
    # Old persisted scores remain readable; no retroactive recomputation.
    historical = db.scalar(select(m.MatchResult))
    historical.scoring_version = 'evidence-coverage-v0.1'
    historical.score = 80
    db.commit()
    legacy = client.get('/matches/' + str(historical.id)).json()
    assert (legacy['score'], legacy['scoring_version']) == (80, 'evidence-coverage-v0.1')


@pytest.mark.parametrize('mode', ['openai', 'gemini', 'unsupported'])
def test_config_error_persisted_no_silent_fallback(client, db, monkeypatch, mode):
    monkeypatch.setattr(settings, 'llm_provider', mode)
    monkeypatch.setattr(settings, 'llm_api_key', '')
    monkeypatch.setattr(settings, 'gemini_api_key', '')
    monkeypatch.setattr(settings, 'llm_model', 'configured-model')
    assert client.get('/health').status_code == 200
    response = client.post('/needs', json={'description': 'Python'})
    assert response.status_code == 503
    error = response.json()['error']
    assert error['code'] == 'LLM_NOT_CONFIGURED'
    run = client.get('/analysis-runs/' + error['details']['analysis_run_id']).json()
    assert run['status'] == 'failed'
    assert run['provider'] == mode
    assert db.scalars(select(m.NeedCriterion)).all() == []
    # Explicit user criteria do not invoke an LLM and still work without a key.
    assert client.post('/needs', json={'description': 'Python', 'criteria': [
        {'skill_key': 'Python', 'skill_label': 'Python', 'priority': 'required'}]}).status_code == 201


@pytest.mark.parametrize('mode', ['openai', 'gemini'])
@pytest.mark.parametrize('kind,code,status', [('timeout', 'LLM_TIMEOUT', 504),
    ('provider', 'LLM_CONFIGURATION_ERROR', 502), ('invalid', 'INVALID_MODEL_OUTPUT', 502)])
def test_project_failures_preserve_snapshot_and_record_failure(client, db, monkeypatch, kind, code, status, mode):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    _, pid, _ = create_entities(client)
    def handle(request):
        if kind == 'timeout':
            raise httpx.ReadTimeout('do not leak mock-secret', request=request)
        if kind == 'provider':
            return httpx.Response(401, text='do not leak mock-secret')
        return httpx.Response(200, json=(envelope if mode == 'openai' else gemini_envelope)('invalid-json'))
    monkeypatch.setattr(settings, 'llm_provider', mode)
    monkeypatch.setattr('app.services.analysis.factory.llm_provider', lambda _: (OpenAIProvider if mode == 'openai' else GeminiProvider)(
        'mock-secret', 'model', max_retries=0, transport=httpx.MockTransport(handle)))
    response = client.post(f'/projects/{pid}/analyze')
    assert response.status_code == status
    error = response.json()['error']
    assert error['code'] == code
    assert 'mock-secret' not in response.text
    run = client.get('/analysis-runs/' + error['details']['analysis_run_id']).json()
    assert run['status'] == 'failed'
    assert run['commit_sha'] == 'a'*40
    assert db.scalars(select(m.SkillEvidence)).all() == []
    assert len(db.scalars(select(m.RepositorySnapshot)).all()) == 1
