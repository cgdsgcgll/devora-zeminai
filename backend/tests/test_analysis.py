from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.schemas.domain import NeedAnalysisInput, ProjectAnalysisInput, ProjectAnalysisResult, SnapshotData, SnapshotFile
from app.services.analysis.interfaces import validate_model_output
from app.services.analysis.rules import RuleNeedAnalyzer, RuleSkillAnalyzer


def test_readme_and_source_are_distinct():
    snapshot = SnapshotData(repository_url='https://github.com/test/repo', default_branch='main', commit_sha='a'*40,
        readme='We plan FastAPI', files=[
            SnapshotFile(path='README.md', content='We plan FastAPI', sha='b'*40, source_url='https://example.org/readme'),
            SnapshotFile(path='app.py', content='from fastapi import FastAPI\napp = FastAPI()', sha='c'*40, source_url='https://example.org/code')])
    result = RuleSkillAnalyzer().analyze_project(ProjectAnalysisInput(candidate_id=uuid4(), project_id=uuid4(),
        name='Demo', description='', snapshot=snapshot))
    readme = next(e for e in result.evidence if e.evidence_type == 'readme')
    source = next(e for e in result.evidence if e.skill_key == 'fastapi' and e.evidence_type == 'source_file')
    assert (readme.evidence_status, readme.evidence_strength) == ('declared_only', 'weak')
    assert (source.evidence_status, source.evidence_strength) == ('observed', 'strong')
    assert 'Contributor' in source.limitations[0]


@pytest.mark.parametrize('raw', ['not json', '{}', {'skills': ['python'], 'unknown': True}])
def test_invalid_provider_output(raw):
    with pytest.raises(AppError) as caught:
        validate_model_output(ProjectAnalysisResult, raw)
    assert caught.value.code == 'INVALID_MODEL_OUTPUT'


def test_need_priorities_and_normalization():
    result = RuleNeedAnalyzer().analyze_need(NeedAnalysisInput(need_id=uuid4(),
        description='Python ve FastAPI gerekli; Next.js tercih edilir; PostgreSQL gerekmiyor'))
    assert {c.skill_key: c.priority for c in result.criteria} == {
        'python': 'required', 'fastapi': 'required', 'nextjs': 'preferred'}


def test_dependency_description_is_not_dependency():
    from app.services.analysis.rules import dependency_skills
    assert dependency_skills('package.json', '{"description":"React", "dependencies":{"next":"15"}}') == ['nextjs']
    assert dependency_skills('requirements.txt', '# fastapi\nfastapi==0.115.12') == ['fastapi']
    assert dependency_skills('pyproject.toml', '[project]\ndependencies=["fastapi>=0.1"]') == ['fastapi']
