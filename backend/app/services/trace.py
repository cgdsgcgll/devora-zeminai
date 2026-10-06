"""Frozen explanation data. Never recalculate historic matching on read."""
from app.schemas.domain import TraceEvidence


def freeze_items(criterion, material):
    items = []
    if criterion.kind in {'technical_skill', 'project_experience'}:
        for e in sorted(material.evidence, key=lambda e: str(e.id)):
            if e.skill_key == criterion.skill_key:
                items.append(TraceEvidence(skill_label=e.skill_label, family=e.evidence_type, status=e.evidence_status,
                    strength=e.evidence_strength, summary=e.reason, excerpt=e.excerpt,
                    source_url=e.source_url, source_label=e.path or e.evidence_type).model_dump(mode='json'))
    for p in criterion.profile_evidence:
        items.append(TraceEvidence(family=p.category, status=p.verification_status,
            summary=p.title, source_url=p.source_url, source_label=p.source_label).model_dump(mode='json'))
    return items


def presentation(result, anonymous, candidate_label=""):
    result.anonymous = anonymous
    result.candidate_label = f"#{str(result.candidate_id)[:8]}" if anonymous else candidate_label
    if not anonymous:
        return result
    result = result.model_copy(deep=True)
    result.strengths = []
    result.gaps = []
    result.uncertainties = []
    result.analysis_version = 'snapshot'
    for c in result.matched_criteria + result.unmatched_criteria:
        c.profile_evidence = []
        c.explanation = 'matched' if c.matched else 'unmatched'
        for e in c.trace_items:
            e.skill_label = c.skill_label
            e.summary = ''
            e.excerpt = ''
            e.source_url = None
            e.source_label = ''
    return result
