from app.services.matching.scorer import DECLARED, MISSING, calculate_match
from app.services.living import gap_items
from test_matching import criterion, evidence
from test_profile_matching import experience, profile


def test_declared_ospf_is_explained_but_never_scored():
    criteria = [criterion('ospf')]
    empty = calculate_match(criteria, [], 'test')
    declared = calculate_match(criteria, [evidence('ospf', 'declared_only', 'readme')], 'test')
    assert empty.score == declared.score == 0
    assert not declared.unmatched_criteria[0].matched
    assert declared.unmatched_criteria[0].evidence_ids == []
    assert declared.unmatched_criteria[0].explanation == DECLARED
    assert empty.unmatched_criteria[0].explanation == MISSING
    assert DECLARED in gap_items(declared)[0].explanation
    assert DECLARED not in gap_items(empty)[0].explanation


def test_observed_ospf_wins_over_declaration_without_bonus():
    criteria = [criterion('ospf')]
    observed = evidence('ospf')
    result = calculate_match(criteria, [observed, evidence('ospf', 'declared_only', 'readme')], 'test')
    assert result.score == calculate_match(criteria, [observed], 'test').score == 100
    assert result.matched_criteria[0].matched
    assert result.matched_criteria[0].evidence_ids == [observed.id]
    assert result.matched_criteria[0].explanation != DECLARED


def test_unrelated_declaration_does_not_explain_missing_ospf():
    result = calculate_match([criterion('ospf')], [evidence('python', 'declared_only', 'readme')], 'test')
    assert result.unmatched_criteria[0].explanation == MISSING


def test_network_readme_and_hackathon_families_remain_separate():
    criteria = [criterion('ospf'), criterion('packet-tracer', 'preferred'), experience()]
    items = [evidence(key, 'declared_only', 'readme') for key in ('ospf', 'packet-tracer')]
    result = calculate_match(criteria, items, 'test', profile_evidence=[profile('hackathon')])
    assert result.score == 10
    assert result.required_coverage == 0
    assert result.preferred_coverage == .5
    assert [c.skill_key for c in result.matched_criteria] == ['hackathon_experience']
    assert {c.skill_key for c in result.unmatched_criteria} == {'ospf', 'packet-tracer'}
    assert all(c.explanation == DECLARED for c in result.unmatched_criteria)
    assert calculate_match(criteria, [], 'test', profile_evidence=[profile('hackathon')]).score == result.score
