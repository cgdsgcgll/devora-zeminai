from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.schemas.domain import NeedCriterion, NeedAnalysisInput
from app.schemas.profile import ProfileEvidenceItem
from app.services.analysis.rules import RuleNeedAnalyzer
from app.services.analysis.llm_analyzers import LLMNeedAnalyzer
from app.services.matching.scorer import calculate_match
from app.core.errors import AppError
from test_matching import criterion, evidence
from test_llm import FakeProvider


def profile(category, **kwargs):
    return ProfileEvidenceItem(id=uuid4(), candidate_id=uuid4(), category=category, title='Demo',
        verification_status='declared_only', created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc), **kwargs)


def experience(key='hackathon_experience', kind='hackathon', priority='preferred'):
    return NeedCriterion(need_id=uuid4(), skill_key=key, skill_label=key, kind=kind, priority=priority)


def test_profile_never_satisfies_technical_skills_or_gives_bonus():
    criteria = [criterion('python'), criterion('fastapi')]
    items = [profile('hackathon'), profile('community'), profile('education', organization='Prestigious university')]
    items += [profile('certification') for _ in range(10)]
    assert calculate_match(criteria, [], 'test', profile_evidence=items).score == 0
    observed = [evidence('python')]
    old = calculate_match(criteria, observed, 'test')
    assert calculate_match(criteria, observed, 'test', profile_evidence=items) == old


def test_python_and_hackathon_separate_coverage():
    criteria = [criterion('python'), experience()]
    assert calculate_match(criteria, [evidence('python')], 'test').score == 80
    full = calculate_match(criteria, [evidence('python')], 'test', profile_evidence=[profile('hackathon')])
    assert full.score == 100
    assert len(full.matched_criteria) == 2
    row = next(r for r in full.matched_criteria if r.kind == 'hackathon')
    assert row.evidence_ids == [] and len(row.profile_evidence) == 1
    assert 'Beyan' in row.explanation


def test_community_link_is_not_verified():
    item = profile('community', source_url='https://example.org/community')
    item.verification_status = 'linked'
    result = calculate_match([experience('community_experience', 'community')], [], 'test', profile_evidence=[item])
    assert result.score == 100
    assert 'içeriği doğrulanmadı' in result.matched_criteria[0].explanation


def test_result_and_participation_roles_are_distinct():
    winner = experience('hackathon_winner')
    assert calculate_match([winner], [], 'test', profile_evidence=[profile('hackathon', metadata_json={'result':'participant'})]).score == 0
    assert calculate_match([winner], [], 'test', profile_evidence=[profile('hackathon', metadata_json={'result':'winner'})]).score == 100
    organizer = experience('community_organizer', 'community')
    assert calculate_match([organizer], [], 'test', profile_evidence=[profile('community', metadata_json={'participation_type':'member'})]).score == 0


def test_explicit_education_eligibility():
    need = experience('education_year_3_4', 'education')
    for year, expected in [(2,0),(3,100),(4,100)]:
        item = profile('education', metadata_json={'status':'ongoing','student_year':year})
        assert calculate_match([need], [], 'test', profile_evidence=[item]).score == expected


def test_technology_community_does_not_match_unrelated_community():
    need = experience('technology_community_experience', 'community')
    assert calculate_match([need], [], 'test', profile_evidence=[profile('community')]).score == 0
    assert calculate_match([need], [], 'test', profile_evidence=[profile('community', metadata_json={'focus':'technology'})]).score == 100


def test_family_key_normalization_and_event_community_separation():
    need = experience('Community Experience', 'community')
    assert need.skill_key == 'community_experience'
    assert calculate_match([need], [], 'test', profile_evidence=[profile('event', metadata_json={'participation_type':'organizer'})]).score == 0
    speaker = experience('event-speaker', 'event')
    assert calculate_match([speaker], [], 'test', profile_evidence=[profile('event', metadata_json={'participation_type':'speaker','responsibility':'Presented a talk'})]).score == 100
    assert calculate_match([speaker], [], 'test', profile_evidence=[profile('event', metadata_json={'participation_type':'participant'})]).score == 0


def test_priority_does_not_leak_between_comma_separated_families():
    result = RuleNeedAnalyzer().analyze_need(NeedAnalysisInput(need_id=uuid4(), description='Python gerekli, hackathon deneyimi tercih edilir'))
    assert {c.skill_key:c.priority for c in result.criteria} == {'python':'required','hackathon_experience':'preferred'}


def test_project_experience_requires_source_code_not_profile_or_readme():
    criteria = [experience('ai_project_experience', 'project_experience')]
    item = evidence('python')
    assert calculate_match(criteria, [item], 'test').score == 0
    item.excerpt = 'from openai import OpenAI'
    assert calculate_match(criteria, [item], 'test').score == 100
    item.excerpt = '# from openai import OpenAI'
    assert calculate_match(criteria, [item], 'test').score == 0
    item.excerpt = 'from openai import OpenAI'
    item.evidence_status = 'declared_only'
    assert calculate_match(criteria, [item], 'test').score == 0


def test_explicit_multifamily_need_and_no_soft_skills():
    analyzer = RuleNeedAnalyzer()
    data = NeedAnalysisInput(need_id=uuid4(), description='React bilen, yapay zekâ projelerinde çalışmış, hackathon deneyimi olan ve teknoloji topluluklarında aktif bir ekip arkadaşı arıyoruz.')
    result = analyzer.analyze_need(data)
    assert {(c.kind,c.priority) for c in result.criteria} == {('technical_skill','required'),('project_experience','preferred'),('hackathon','preferred'),('community','preferred')}
    data.description = 'İletişimi kuvvetli sosyal biri, yüksek GPA, prestijli üniversite.'
    assert analyzer.analyze_need(data).criteria == []
    data.description = 'Hackathon deneyimi gerekmiyor; Python gerekli'
    assert [c.skill_key for c in analyzer.analyze_need(data).criteria] == ['python']


def test_llm_profile_grounding_and_soft_skill_rejection():
    data = NeedAnalysisInput(need_id=uuid4(), description='Hackathon deneyimi tercih edilir.')
    output = {'criteria':[dict(kind='hackathon', skill_key='hackathon_experience', skill_label='Hackathon',
        priority='required', reason='Explicit', source_excerpt=data.description)], 'uncertainties':[]}
    result = LLMNeedAnalyzer(FakeProvider(output)).analyze_need(data)
    assert result.criteria[0].priority == 'preferred'
    output['criteria'][0].update(skill_key='hackathon_winner')
    with pytest.raises(AppError):
        LLMNeedAnalyzer(FakeProvider(output)).analyze_need(data)
    data.description='communication'
    output['criteria'][0].update(kind='technical_skill', skill_key='communication', skill_label='communication', source_excerpt='communication')
    with pytest.raises(AppError):
        LLMNeedAnalyzer(FakeProvider(output)).analyze_need(data)


def test_profile_only_api_and_frozen_history(client):
    cid = client.post('/candidates',json={'name':'Ada'}).json()['id']
    item = client.post(f'/candidates/{cid}/profile-evidence',json={'category':'hackathon','title':'Original'}).json()
    need = client.post('/needs',json={'description':'Python gerekli; hackathon deneyimi tercih edilir'}).json()
    result = client.post('/matches',json={'candidate_id':cid,'need_id':need['id']})
    assert result.status_code == 201, result.text
    saved = result.json()
    assert saved['score'] == 20
    client.patch('/profile-evidence/'+item['id'],json={'title':'Changed'})
    client.delete('/profile-evidence/'+item['id'])
    assert client.get('/matches/'+saved['id']).json() == saved
