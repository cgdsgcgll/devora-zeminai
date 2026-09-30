from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.schemas.domain import NeedCriterion, SkillEvidence
from app.services.matching.scorer import MISSING, calculate_match


def criterion(key, priority='required'):
    return NeedCriterion(need_id=uuid4(), skill_key=key, skill_label=key, priority=priority)


def evidence(key, status='observed', kind='source_file'):
    return SkillEvidence(candidate_id=uuid4(), project_id=uuid4(), snapshot_id=uuid4(), analysis_run_id=uuid4(),
        skill_key=key, skill_label=key, evidence_status=status, evidence_strength='strong', evidence_type=kind,
        source_url='https://github.com/test/repo', excerpt='code', reason='test', limitations=[])


@pytest.mark.parametrize('criteria,items,score,rc,pc', [
    ([criterion('python'), criterion('docker', 'preferred')], [evidence('python'), evidence('docker')], 100, 1, 1),
    ([criterion('python'), criterion('fastapi'), criterion('docker', 'preferred')], [evidence('python')], 40, .5, 0),
    ([criterion('python'), criterion('fastapi')], [evidence('python')], 50, .5, 0),
    ([criterion('python')], [], 0, 0, 0),
    ([criterion('python')], [evidence('python', 'declared_only', 'readme')], 0, 0, 0),
    ([criterion('python')], [evidence('python', 'not_found')], 0, 0, 0),
    ([criterion('docker', 'preferred')], [], 0, 0, 0),
])
def test_scores(criteria, items, score, rc, pc):
    result = calculate_match(criteria, items, 'test-v1')
    assert (result.score, result.required_coverage, result.preferred_coverage) == (score, rc, pc)
    assert result.scoring_version == 'evidence-coverage-v0.2'


def test_empty_criteria():
    with pytest.raises(AppError, match='boş'):
        calculate_match([], [], 'test')


def test_deterministic_and_duplicate_evidence():
    criteria = [criterion('python'), criterion('docker', 'preferred')]
    items = [evidence('python'), evidence('python')]
    one = calculate_match(criteria, items, 'test')
    assert one == calculate_match(list(reversed(criteria)), list(reversed(items)), 'test')
    assert one == calculate_match(criteria, items, 'test')
    assert one.score == 80
    assert one.unmatched_criteria[0].explanation == MISSING


def test_not_found_is_not_inability():
    result = calculate_match([criterion('python')], [evidence('python', 'not_found')], 'test')
    assert result.unmatched_criteria[0].explanation == MISSING
    assert any('beceriye sahip olmadığı anlamına gelmez' in u for u in result.uncertainties)


def test_duplicate_criteria_rejected():
    with pytest.raises(AppError):
        calculate_match([criterion('python'), criterion('python')], [], 'test')


@pytest.mark.parametrize('count,expected', [(0, 0), (1, 100/3), (3, 100)])
def test_preferred_only_no_free_coverage(count, expected):
    keys = ['python', 'fastapi', 'docker']
    result = calculate_match([criterion(key, 'preferred') for key in keys],
                             [evidence(key) for key in keys[:count]], 'test')
    assert result.score == pytest.approx(expected)
    assert result.required_coverage == 0
    assert '100 × preferred_coverage' in result.score_explanation


def test_legacy_match_schema_remains_readable():
    from app.schemas.domain import MatchCalculation
    result = calculate_match([criterion('python')], [], 'test').model_dump()
    result.update(scoring_version='evidence-coverage-v0.1', score=80)
    assert MatchCalculation.model_validate(result).scoring_version == 'evidence-coverage-v0.1'
