from app.core.errors import AppError
from app.schemas.domain import (CriterionMatch, EvidenceStatus, MatchCalculation,
                                NeedCriterion, Priority, SkillEvidence)

MISSING = 'Erişilebilen proje verisinde bu kriteri destekleyen kanıt bulunamadı.'


def calculate_match(criteria: list[NeedCriterion], evidence: list[SkillEvidence],
                    analysis_version: str, uncertainties: list[str] | None = None) -> MatchCalculation:
    """Pure function. Only observed evidence counts; evidence strength is not a multiplier."""
    if not criteria:
        raise AppError('MATCHING_FAILED', 'İhtiyaç kriterleri boş; önce ihtiyaç kriterlerini belirleyin.', 422)
    if len({c.skill_key for c in criteria}) != len(criteria):
        raise AppError('MATCHING_FAILED', 'Tekrarlanan beceri kriterleri desteklenmiyor.', 422)
    rows = []
    for criterion in sorted(criteria, key=lambda c: (c.skill_key, str(c.id))):
        ids = sorted({e.id for e in evidence if e.skill_key == criterion.skill_key
                      and e.evidence_status == EvidenceStatus.observed}, key=str)
        rows.append(CriterionMatch(criterion_id=criterion.id, skill_key=criterion.skill_key,
            skill_label=criterion.skill_label, priority=criterion.priority, matched=bool(ids),
            evidence_ids=ids, explanation='Gözlemlenebilir proje kanıtı bulundu.' if ids else MISSING))
    required = [r for r in rows if r.priority == Priority.required]
    preferred = [r for r in rows if r.priority == Priority.preferred]
    rc = sum(r.matched for r in required) / len(required) if required else 0.0
    pc = sum(r.matched for r in preferred) / len(preferred) if preferred else 0.0
    if required and preferred:
        score = 100 * (0.8 * rc + 0.2 * pc)
        formula = '100 × (0.80 × required_coverage + 0.20 × preferred_coverage).'
    elif required:
        score = 100 * rc
        formula = '100 × required_coverage; preferred kriter yok.'
    else:
        score = 100 * pc
        formula = '100 × preferred_coverage; required kriter yok.'
    score = round(score, 6)
    notes = list(uncertainties or [])
    notes.extend(limit for e in evidence for limit in e.limitations)
    if any(e.evidence_status != EvidenceStatus.observed for e in evidence):
        notes.append('Yalnızca beyan edilen veya not_found durumundaki kayıtlar skora dahil edilmedi.')
    notes.append('Kanıt bulunmaması adayın beceriye sahip olmadığı anlamına gelmez.')
    return MatchCalculation(score=score, required_coverage=rc, preferred_coverage=pc,
        score_explanation=formula +
                          ' Skor gözlemlenebilir proje kanıtlarının ihtiyaçla uyumudur; işe alınma ihtimali veya genel yetenek puanı değildir.',
        strengths=[r.skill_label + ': proje kanıtı bulundu.' for r in rows if r.matched],
        gaps=[r.skill_label + ': ' + MISSING for r in rows if not r.matched],
        uncertainties=sorted(set(notes)), analysis_version=analysis_version,
        matched_criteria=[r for r in rows if r.matched], unmatched_criteria=[r for r in rows if not r.matched])
