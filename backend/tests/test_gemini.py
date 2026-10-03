import json
from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.domain import NeedAnalysisInput
from app.services.analysis.factory import need_analyzer, skill_analyzer
from app.services.analysis.llm_analyzers import LLMNeedAnalyzer, ProjectSkillAnalyzer
from app.services.analysis.llm_schemas import NeedDraft
from app.services.llm.gemini_provider import GeminiProvider
from test_llm import evidence_draft, project_data


def envelope(text):
    return {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': text}]}}]}


def provider(output):
    return GeminiProvider('mock-key', 'configured-model', transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json=envelope(json.dumps(output)))))


def generate(client):
    return client.generate_structured(instructions='System', context='Need',
        schema=NeedDraft.model_json_schema(), schema_name='need')


def test_request_contract():
    def handle(request):
        assert str(request.url) == 'https://generativelanguage.googleapis.com/v1beta/models/configured-model:generateContent'
        assert request.headers['x-goog-api-key'] == 'mock-key'
        assert request.extensions['timeout']['read'] == 7
        payload = json.loads(request.content)
        assert payload['systemInstruction']['parts'] == [{'text': 'System'}]
        assert payload['contents'] == [{'role': 'user', 'parts': [{'text': 'Need'}]}]
        config = payload['generationConfig']
        assert config['maxOutputTokens'] == 1234
        assert config['candidateCount'] == 1
        assert config['responseFormat']['text'] == {'mimeType': 'APPLICATION_JSON', 'schema': NeedDraft.model_json_schema()}
        return httpx.Response(200, json=envelope('{"criteria":[],"uncertainties":[]}'))
    client = GeminiProvider('mock-key', 'models/configured-model', timeout=7,
        max_output_tokens=1234, transport=httpx.MockTransport(handle))
    assert NeedDraft.model_validate_json(generate(client)).criteria == []


@pytest.mark.parametrize('body', [[], {}, {'candidates': []}, envelope('not json'),
    envelope('```json\n{}\n```'), envelope('[]'), envelope('{'),
    {'candidates': [{'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': '{}'}]}}]},
    {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 42}]}}]}])
def test_malformed_output(body):
    client = GeminiProvider('key', 'model', transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
    with pytest.raises(AppError) as caught:
        generate(client)
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'


@pytest.mark.parametrize('key,model', [('', 'model'), ('key', ''), (' ', 'model'), ('key', '../invalid')])
def test_missing_configuration_does_not_send_request(key, model):
    def handle(_):
        pytest.fail('Unconfigured provider must not send a request')
    with pytest.raises(AppError) as caught:
        generate(GeminiProvider(key, model, transport=httpx.MockTransport(handle)))
    assert caught.value.code == 'LLM_NOT_CONFIGURED'


@pytest.mark.parametrize('failure,code,attempts', [(401, 'LLM_PROVIDER_ERROR', 1),
    (429, 'LLM_PROVIDER_ERROR', 3), (503, 'LLM_PROVIDER_ERROR', 3),
    ('timeout', 'LLM_TIMEOUT', 3), ('network', 'LLM_PROVIDER_ERROR', 3)])
def test_errors_sanitized_and_retries_bounded(monkeypatch, failure, code, attempts):
    monkeypatch.setattr('app.services.llm.gemini_provider.time.sleep', lambda _: None)
    calls = []
    def handle(request):
        calls.append(request)
        if failure == 'timeout':
            raise httpx.ReadTimeout('mock-key raw-private', request=request)
        if failure == 'network':
            raise httpx.ConnectError('mock-key raw-private', request=request)
        return httpx.Response(failure, text='mock-key raw-private')
    with pytest.raises(AppError) as caught:
        generate(GeminiProvider('mock-key', 'model', max_retries=99, transport=httpx.MockTransport(handle)))
    assert caught.value.code == code
    assert len(calls) == attempts
    assert caught.value.retryable == (attempts > 1)
    assert 'mock-key' not in json.dumps(caught.value.body())
    assert 'raw-private' not in json.dumps(caught.value.body())


def test_retry_success_and_thought_parts_ignored(monkeypatch):
    monkeypatch.setattr('app.services.llm.gemini_provider.time.sleep', lambda _: None)
    calls = []
    def handle(_):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429)
        body = envelope('{}')
        body['candidates'][0]['content']['parts'].insert(0, {'thought': True, 'text': 'Internal reasoning'})
        return httpx.Response(200, json=body)
    assert generate(GeminiProvider('key', 'model', transport=httpx.MockTransport(handle))) == '{}'
    assert len(calls) == 2


def test_refusal_and_oversize():
    for response, code in [
        (httpx.Response(200, json={'promptFeedback': {'blockReason': 'SAFETY'}}), 'LLM_PROVIDER_ERROR'),
        (httpx.Response(200, content=b'x'*1_000_001), 'INVALID_MODEL_OUTPUT')]:
        with pytest.raises(AppError) as caught:
            generate(GeminiProvider('key', 'model', transport=httpx.MockTransport(lambda _: response)))
        assert caught.value.code == code


@pytest.mark.parametrize('mode', ['rule_based', 'openai', 'gemini'])
def test_factory_modes(mode):
    config = Settings(_env_file=None, llm_provider=mode, gemini_api_key='key', gemini_model='chosen-model',
        llm_model='chosen-model', llm_timeout_seconds=9, llm_max_retries=1, llm_max_output_tokens=700)
    for analyzer in [skill_analyzer(config), need_analyzer(config)]:
        assert analyzer.provider == mode
        if mode != 'rule_based':
            assert analyzer.model == 'chosen-model'


def test_project_evidence_grounding():
    output = evidence_draft()
    output['evidence'] += evidence_draft(skill_key='Python', skill_label='Python')['evidence']
    output['evidence'] += evidence_draft(skill_key='Kubernetes', skill_label='Kubernetes',
        evidence_type='readme', path='README.md', excerpt='Built with Kubernetes')['evidence']
    result = ProjectSkillAnalyzer(provider(output)).analyze_project(project_data())
    evidence = {e.skill_key: e for e in result.evidence}
    assert evidence['python'].evidence_status == 'observed'
    assert evidence['fastapi'].evidence_status == 'observed'
    assert evidence['kubernetes'].evidence_status == 'declared_only'
    assert evidence['kubernetes'].evidence_strength == 'weak'
    assert evidence['fastapi'].source_url.endswith('/' + 'a'*40 + '/app.py')
    assert any('Contributor' in value for value in result.limitations)


@pytest.mark.parametrize('override', [{'path': 'fake.py'}, {'excerpt': 'invented'}, {'skill_label': 'AWS'}])
def test_project_fabrication_rejected(override):
    with pytest.raises(AppError) as caught:
        ProjectSkillAnalyzer(provider(evidence_draft(**override))).analyze_project(project_data())
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'


def test_need_semantics_and_no_invented_stack():
    output = {'criteria': [dict(kind='technical_skill', skill_key=label, skill_label=label, priority=priority,
        reason='Explicit request', source_excerpt=label) for label, priority in [
            ('Python', 'required'), ('FastAPI', 'required'), ('Docker', 'preferred')]], 'uncertainties': []}
    data = NeedAnalysisInput(need_id=uuid4(), description='Python ve FastAPI zorunlu, Docker tercih edilir.')
    result = LLMNeedAnalyzer(provider(output)).analyze_need(data)
    assert {c.skill_key: c.priority for c in result.criteria} == {'python': 'required', 'fastapi': 'required', 'docker': 'preferred'}
    output['criteria'][0].update(skill_key='AWS', skill_label='AWS')
    with pytest.raises(AppError) as caught:
        LLMNeedAnalyzer(provider(output)).analyze_need(data)
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'


def test_shared_strict_schema_rejects_extra_fields():
    output = evidence_draft()
    output['proficiency'] = 'expert'
    with pytest.raises(AppError) as caught:
        ProjectSkillAnalyzer(provider(output)).analyze_project(project_data())
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'
